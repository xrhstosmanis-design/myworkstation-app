import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {once} from "node:events";
import express,{Router} from "express";
import {z} from "zod";
import {lockInvoiceStore} from "../src/lib/invoice-common-draft.js";
import {invoiceDbFixture,isolatedInvoiceDb} from "./helpers/invoice-common-draft-fixture.js";

test("supplier deposits reconcile partial returns and credits within one store", {skip:!isolatedInvoiceDb()}, async()=>{
  const f=await invoiceDbFixture();
  let server;
  try{
    await f.seed({mydata:false,payment:false});
    await f.db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "name" text, ADD COLUMN "sku" text, ADD COLUMN "active" boolean DEFAULT true');
    await f.db.$executeRawUnsafe('ALTER TABLE "StoreProduct" ADD COLUMN "active" boolean DEFAULT true');
    await f.db.$executeRawUnsafe(`UPDATE "Product" SET "name"='LAB empty crate',"sku"='CRATE-1' WHERE "id"='p'`);
    await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "status"='APPROVED' WHERE "id"='d-pos'`);
    await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","totalGross","status")
      VALUES ('credit','c','s','sup','CREDIT_NOTE','LAB-CREDIT',6,'APPROVED')`);
    const source=(await readFile(new URL("../src/routes/supplier-deposits.js",import.meta.url),"utf8"))
      .replace(/^import .*;\n/gm,"").replace("export default router;","return router;");
    const staffGrants=[];
    const requireStaffAction=async(db,req,storeId,capability)=>staffGrants.push([storeId,capability]);
    const router=new Function("Router","randomUUID","z","prisma","lockInvoiceStore","requireStaffAction",source)(Router,randomUUID,z,f.db,lockInvoiceStore,requireStaffAction);
    const app=express();
    app.use(express.json(),(req,res,next)=>{
      req.user={id:"owner",companyId:"c",role:req.get("x-test-role")||"OWNER"};
      if(req.get("x-test-staff"))Object.assign(req.user,{role:"MEMBER",staffAccess:true,storeId:"s"});
      next();
    },router);
    app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
    server=app.listen(0,"127.0.0.1");
    await once(server,"listening");
    const base=`http://127.0.0.1:${server.address().port}`;
    const get=async(path,headers)=>fetch(base+path,{headers});
    const post=async(path,body)=>fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const input={storeId:"s",documentId:"d-pos",kind:"CRATE",productId:"p",quantity:10,unitCents:200,dueDate:"2026-11-25"};
    const products=await (await get("/?storeId=s&q=CRATE-1")).json();
    assert.deepEqual(products.products,[{id:"p",name:"LAB empty crate",sku:"CRATE-1"}]);
    assert.equal((await post("/",{...input,productId:"outside-catalog"})).status,409);
    const creation=await post("/",input);
    assert.equal(creation.status,201,await creation.clone().text());
    const {id}=await creation.json();
    assert.equal((await post("/",input)).status,409);
    const activity=(kind,reference,quantity)=>post(`/${id}/${kind}`,{storeId:"s",reference,quantity});
    assert.equal((await activity("CREDIT","credit",1)).status,409);
    assert.equal((await activity("RETURN","LAB-RETURN",6)).status,200);
    assert.equal((await activity("RETURN","LAB-RETURN",6)).status,200);
    assert.equal((await activity("RETURN","SECOND",5)).status,409);
    assert.equal((await activity("CREDIT","credit",4)).status,409);
    assert.equal((await activity("CREDIT","credit",3)).status,200);
    const manager=await get("/?storeId=s",{"x-test-role":"MANAGER"});
    assert.equal(manager.status,200);
    const {rows}=await manager.json();
    assert.deepEqual([rows[0].quantity-rows[0].returned,rows[0].returned-rows[0].credited],[4,3]);
    assert.equal(rows[0].history.length,2);
    assert.equal(rows[0].label,"LAB empty crate");
    assert.equal(rows[0].sku,"CRATE-1");
    assert.deepEqual((await (await get("/?storeId=control")).json()).rows,[]);
    assert.equal((await get("/?storeId=s",{"x-test-role":"CASHIER"})).status,403);
    assert.equal((await get("/?storeId=s",{"x-test-staff":"1"})).status,200);
    assert.deepEqual(staffGrants,[["s","invoices.read"]]);
    assert.equal((await get("/?storeId=control",{"x-test-staff":"1"})).status,403);
    await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "status"='CANCELLED' WHERE "id"='credit'`);
    assert.equal((await (await get("/?storeId=s")).json()).rows[0].credited,0);
    assert.equal((await f.db.$queryRawUnsafe('SELECT * FROM "StockMovement"')).length,0);
    assert.equal((await f.db.$queryRawUnsafe('SELECT * FROM "StoreTransaction"')).length,0);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await f.close();
  }
});
