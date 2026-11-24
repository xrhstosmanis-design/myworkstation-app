import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";
import {z} from "zod";
import {staffRequestCapability} from "../../shared/backoffice-staff.mjs";

const path="/api/commerce/purchase-orders/order/ocr-lines/line/create-product";
const source=readFileSync(new URL("../src/routes/purchase-order-ocr-resolution.js",import.meta.url),"utf8");
const start=source.indexOf('router.post("/:orderId/ocr-lines/:lineId/create-product"');
const end=source.indexOf("\nexport default router",start);
const body={storeId:"scope",name:"Δοκιμαστικό προϊόν",barcodeMode:"PROVIDED",barcode:"12345678"};
const fail=(status=403,code="DENIED",message="Denied")=>Object.assign(new Error(message),{status,code});

function fixture({grants=["invoices.edit","products.create"],revokeOnWrite,otherLine,duplicate}={}){
  let handler,created, linked, audit;
  const calls=[];
  const line={id:"line",orderId:"order",storeId:otherLine?"other":"scope",status:"NEW",updatedAt:new Date(0)};
  const requireGrant=async(db,user,store,cap)=>{
    calls.push([db===tx?"transaction":"read",store,cap]);
    if(store!==user.storeId||!grants.includes(cap)||db===tx&&revokeOnWrite===cap)throw fail(403,"DENIED","Denied");
  };
  const tx={
    async $queryRaw(parts,...values){
      const sql=parts.join("?");
      if(sql.includes('SELECT "id","productId","updatedAt"'))return [{...line,productId:linked}];
      if(sql.includes('FROM "StoreOperatorAudit"'))return audit?[{details:audit}]:[];
      if(sql.includes('FROM "ProductBarcode"'))return duplicate?[{name:"Already exists"}]:[];
      if(sql.includes('MAX('))return [{next:10001}];
      assert.fail(sql);
    },
    async $executeRaw(parts,...values){
      const sql=parts.join("?");
      if(sql.includes('pg_advisory_xact_lock'))return;
      if(sql.startsWith('INSERT INTO "Product"')){created=values[0];assert.equal(values[1],"company");return;}
      if(sql.startsWith('INSERT INTO "ProductBarcode"')){assert.equal(values[1],created);return;}
      if(sql.startsWith('INSERT INTO "StoreProduct"')){assert.deepEqual(values.slice(1,3),["scope",created]);assert.match(sql,/currentStock.*0,true/);return;}
      if(sql.startsWith('UPDATE "PurchaseOrderLine"')){assert.deepEqual(values.slice(-2),["line","order"]);linked=values[0];return;}
      if(sql.startsWith('INSERT INTO "StoreOperatorAudit"')){audit=JSON.parse(values.at(-1));return;}
      assert.fail(sql);
    }
  };
  const prisma={$transaction:run=>run(tx)};
  const deps={
    router:{post:(_path,value)=>handler=value},z,crypto,prisma,id:()=>crypto.randomUUID(),
    requireStaffAction:(db,req,store,cap)=>requireGrant(db,req.user,store,cap),requireStaffGrant:requireGrant,staffError:fail,
    ownedLine:async(company,order,lineId)=>company==="company"&&order===line.orderId&&lineId===line.id?line:null,
    lockEditablePurchaseOrder:async(db,order)=>assert.deepEqual(order,{id:"order",companyId:"company",storeId:"scope",reopenVersion:undefined}),
    validateInvoiceTaxonomy:async()=>{},ean13:()=>assert.fail("staff may not upload a generated code"),
    generateInternalBarcode:async()=> "2900000000004",
    learnSupplierMapping:async()=>assert.fail("no implicit company supplier learning"),
    learnCentralInvoiceCorrection:async()=>assert.fail("no implicit central learning")
  };
  new Function(...Object.keys(deps),source.slice(start,end))(...Object.values(deps));
  return {calls,get created(){return created;},async run(input,orderId="order",lineId="line"){
    const req={params:{orderId,lineId},user:{id:"staff",companyId:"company",storeId:"scope",staffAccess:true},body:input};
    let status,result,error;
    const res={status(value){status=value;return res;},json(value){result=value;}};
    await handler(req,res,failure=>error=failure);
    return {status,result,error};
  }};
}

test("staff admission is exact and leaves other OCR catalog mutation routes denied",()=>{
  assert.equal(staffRequestCapability("POST",path),"invoices.edit");
  assert.equal(staffRequestCapability("GET",path),null);
  assert.equal(staffRequestCapability("POST",path.replace("create-product","resolve-existing")),null);
});

test("both live grants and a scoped line are required before any creation",async()=>{
  for(const settings of [{grants:["invoices.edit"]},{grants:["products.create"]},{revokeOnWrite:"products.create"},{revokeOnWrite:"invoices.edit"},{otherLine:true}]){
    const f=fixture(settings);
    assert.ok([403,404].includes((await f.run(body)).error?.status));
    assert.equal(f.created,undefined);
  }
  const f=fixture();
  for(const [input,order,line] of [[{...body,storeId:"other"}],[{...body,barcodeMode:"NONE"}],[{...body,barcodeMode:"GENERATED"}],[body,"other"],[body,"order","other"]]){
    const outcome=await f.run(input,order,line);
    assert.ok([400,403,404].includes(outcome.error?.status??outcome.status), JSON.stringify({input,order,line,outcome,error:outcome.error?.stack}));
    assert.equal(f.created,undefined);
  }
});

test("provided and generated barcodes are linked once, with audited retry and no implicit learning",async()=>{
  for(const input of [body,{...body,barcodeMode:"GENERATED",barcode:undefined}]){
    const f=fixture();
    const first=await f.run(input);
    assert.equal(first.status,201);
    assert.equal(first.result.productId,f.created);
    assert.equal(first.result.barcode,input.barcode??"2900000000004");
    assert.equal(first.result.mappingLearned,false);
    const second=await f.run(input);
    assert.equal(second.status,200);
    assert.equal(second.result.productId,first.result.productId);
    assert.equal(second.result.replayed,true);
    assert.equal((await f.run({...input,name:"Different"})).error?.status,409);
  }
  const duplicate=fixture({duplicate:true});
  assert.equal((await duplicate.run(body)).error?.code,"INVOICE_PRODUCT_DUPLICATE_BARCODE");
  assert.equal(duplicate.created,undefined);
});
