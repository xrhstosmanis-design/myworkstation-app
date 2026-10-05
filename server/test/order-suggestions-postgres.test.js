import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {once} from "node:events";
import express from "express";
import {z} from "zod";
import {buildOrderSuggestions} from "../src/lib/order-suggestions.js";
import {ownerRestrictedModuleKeys} from "../src/services/module-catalog.js";

// Real handler/guard/SQL, injected user contexts, isolated loopback TEMP data only.
test("order suggestions HTTP/SQL: quantities, returns, store/license/role boundaries and no writes",{skip:!process.env.DATABASE_URL,timeout:45000},async t=>{
  const url=new URL(process.env.DATABASE_URL);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.match(url.pathname,/\/[^/]+_test$/);assert.equal(process.env.NODE_ENV,"test");
  const {PrismaClient}=await import("@prisma/client"),prisma=new PrismaClient();
  try{await prisma.$transaction(async tx=>{
    const tables={
      Store:'"id" TEXT PRIMARY KEY,"companyId" TEXT',Company:'"id" TEXT PRIMARY KEY,"active" BOOLEAN,"licenseStatus" TEXT',
      CompanyModule:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"moduleKey" TEXT,"active" BOOLEAN',
      StorePaidModule:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP',
      Product:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"sku" TEXT,"unit" TEXT,"active" BOOLEAN,"trackStock" BOOLEAN',
      StoreProduct:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"productId" TEXT,"currentStock" NUMERIC,"minStock" NUMERIC,"active" BOOLEAN',
      Recipe:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"productId" TEXT,"active" BOOLEAN',
      PreparationRecipeLine:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"productId" TEXT,"automatic" BOOLEAN',
      Sale:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT,"source" TEXT,"occurredAt" TIMESTAMP',
      SaleLine:'"id" TEXT PRIMARY KEY,"saleId" TEXT,"productId" TEXT,"quantity" NUMERIC'
    };
    for(const [name,columns] of Object.entries(tables))await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${name}" (${columns}) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`INSERT INTO "Company" VALUES ('a',true,'ACTIVE'),('b',true,'ACTIVE'),('c',true,'SUSPENDED');`);
    await tx.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES ('a','a','ORDER_SUGGESTIONS',true),('b','b','ORDER_SUGGESTIONS',true),('c','c','ORDER_SUGGESTIONS',true)`);
    await tx.$executeRawUnsafe(`INSERT INTO "Store" VALUES ('a1','a'),('a2','a'),('off','a'),('b1','b'),('c1','c')`);
    await tx.$executeRawUnsafe(`INSERT INTO "StorePaidModule" VALUES ('off','off','ORDER_SUGGESTIONS',false,NULL,NULL)`);
    await tx.$executeRawUnsafe(`INSERT INTO "Product" VALUES ('p','a','Pieces','P','PIECE',true,true),('exchange','a','Exchange','E','PIECE',true,true),('kg','a','Weight','K','KG',true,true),('pack','a','Pack','PACK','PACKAGE',true,true),('recipe','a','Recipe','R','PIECE',true,true),('prepared','a','Prepared','PR','PIECE',true,true),('inactive','a','Inactive','I','PIECE',false,true),('untracked','a','Untracked','U','PIECE',true,false),('foreign','b','Foreign','F','PIECE',true,true)`);
    await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES ('p','a1','p',3,5,true),('e','a1','exchange',0,0,true),('k','a1','kg',0,0,true),('pack','a1','pack',0,7,true),('r','a1','recipe',0,2,true),('pr','a1','prepared',0,2,true),('i','a1','inactive',0,5,true),('u','a1','untracked',0,5,true),('bad','a1','foreign',0,5,true),('sibling','a2','p',50,5,true),('f','b1','foreign',1,9,true)`);
    await tx.$executeRawUnsafe(`INSERT INTO "Recipe" VALUES ('r','a','recipe',true);`);
    await tx.$executeRawUnsafe(`INSERT INTO "PreparationRecipeLine" VALUES ('pr','a','prepared',true);`);
    const now=new Date(),recent=new Date(now.getTime()-86400000),old=new Date(now.getTime()-91*86400000),future=new Date(now.getTime()+86400000);
    const sales=[['pos','a','a1','COMPLETED','POS',recent],['return','a','a1','COMPLETED','POS_REVERSAL',recent],['exchange','a','a1','COMPLETED','EXCHANGE',recent],['channel','a','a1','COMPLETED','EFOOD',recent],['cancel','a','a1','COMPLETED','POS_REVERSAL',recent],['old','a','a1','COMPLETED','POS',old],['future','a','a1','COMPLETED','POS',future],['draft','a','a1','DRAFT','POS',recent],['waste','a','a1','COMPLETED','WASTE',recent],['self','a','a1','COMPLETED','SELF_CONSUMPTION',recent],['sibling','a','a2','COMPLETED','POS',recent],['bad-company','b','a1','COMPLETED','POS',recent]];
    for(const sale of sales)await tx.$executeRaw`INSERT INTO "Sale" VALUES (${sale[0]},${sale[1]},${sale[2]},${sale[3]},${sale[4]},${sale[5]})`;
    const lines=[['p','pos','p',60],['r','return','p',-15],['ep','exchange','exchange',10],['er','exchange','exchange',-4],['ch','channel','exchange',12],['cancel','cancel','exchange',-3],['k','pos','kg',1],['old','old','p',999],['future','future','p',999],['draft','draft','p',999],['waste','waste','p',999],['self','self','p',999],['sibling','sibling','p',999],['bad-company','bad-company','p',999]];
    for(const line of lines)await tx.$executeRaw`INSERT INTO "SaleLine" VALUES (${line[0]},${line[1]},${line[2]},${line[3]})`;
    let reads=0;
    const db={$queryRaw:async(strings,...values)=>{if(strings.join("").includes('FROM "StoreProduct"'))reads++;return tx.$queryRaw(strings,...values);},$executeRaw:()=>{throw Error("Proposal attempted a write");},
      store:{findUnique:async({where})=>(await tx.$queryRaw`SELECT * FROM "Store" WHERE "id"=${where.id}`)[0]||null},
      company:{findUnique:async({where})=>{const row=(await tx.$queryRaw`SELECT * FROM "Company" WHERE "id"=${where.id}`)[0];return row?{...row,subscriptionEndsAt:null,modules:(await tx.$queryRaw`SELECT * FROM "CompanyModule" WHERE "companyId"=${where.id}`).map(m=>({...m,startsAt:null,endsAt:null}))}:null;}}};
    const guardSource=await readFile(new URL("../src/middleware/module-access.js",import.meta.url),"utf8");
    const guard=new Function("prisma","ownerRestrictedModuleKeys",guardSource.replace(/^import .*;\s*$/gm,"").replace(/^export /gm,"")+"\nreturn requireStoreModule;")(db,ownerRestrictedModuleKeys);
    const routeSource=await readFile(new URL("../src/routes/order-suggestions.js",import.meta.url),"utf8");
    const registrations=[];new Function("Router","z","prisma","requireStoreModule","buildOrderSuggestions",routeSource.replace(/^import .*;\s*$/gm,"").replace(/export default router;?/,"").replace(/^export /gm,""))(()=>({get:(...args)=>registrations.push(args)}),z,db,guard,buildOrderSuggestions);
    const users={owner:{role:"OWNER",companyId:"a"},sa:{role:"SUPER_ADMIN",companyId:"different"},employee:{role:"EMPLOYEE",tokenType:"STORE_OPERATOR",storeId:"a1",companyId:"a"},permitted:{role:"EMPLOYEE",tokenType:"STORE_OPERATOR",storeId:"a1",companyId:"a",permissions:["MODULE:ORDER_SUGGESTIONS"]},suspended:{role:"OWNER",companyId:"c"}};
    const app=express();app.use((req,res,next)=>{req.user=users[req.get("x-fixture-user")];return req.user?next():res.status(401).end();});app.get("/api/commerce/order-suggestions",...registrations[0].slice(1));app.use((err,req,res,next)=>res.status(500).json({error:err.message}));
    const server=app.listen(0,"127.0.0.1");await once(server,"listening");
    const request=async(store,user="owner",extra="")=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/commerce/order-suggestions?${store===undefined?"":`storeId=${store}`}${extra}`,{headers:{"x-fixture-user":user}});return {status:res.status,cache:res.headers.get("cache-control"),body:await res.json()};};
    const snapshot=()=>Promise.all(Object.keys(tables).map(async name=>(await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,md5(string_agg(row_to_json(t)::text,',' ORDER BY "id")) AS digest FROM "${name}" t`))[0]));const before=await snapshot();
    try{
      await t.test("real SQL excludes foreign/draft/future/waste and nets returns/exchanges/channel sales",async()=>{
        const result=await request("a1");assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.cache,"no-store");assert.equal(result.body.rows.length,6);
        const find=id=>result.body.rows.find(r=>r.productId===id);assert.equal(find("p").soldQuantity,60);assert.equal(find("p").returnedQuantity,15);assert.equal(find("p").suggestedQuantity,12);
        assert.equal(find("exchange").soldQuantity,22);assert.equal(find("exchange").returnedQuantity,7);assert.equal(find("exchange").suggestedQuantity,5);
        assert.equal(find("kg").suggestedQuantity,.334);for(const id of ["pack","recipe","prepared"])assert.equal(find(id).suggestedQuantity,null);
      });
      await t.test("store entitlement, employee permission and license denials run before proposal SQL",async()=>{
        for(const [store,user,status,code] of [["b1","owner",404,"TENANT_STORE_REJECTED"],["a2","employee",404,"TENANT_STORE_REJECTED"],["a1","employee",403,"ROLE_MODULE_DENIED"],["off","owner",403,"MODULE_DISABLED"],["c1","suspended",403,"LICENSE_INACTIVE"],[undefined,"owner",400,null],["missing","owner",404,null]]){const count=reads,result=await request(store,user);assert.equal(result.status,status,JSON.stringify(result.body));if(code)assert.equal(result.body.code,code);assert.equal(reads,count);}
        assert.equal((await request("a1","permitted")).status,200);
      });
      await t.test("parameters validate before SQL; target-company support and sibling store stay isolated",async()=>{
        const count=reads;assert.equal((await request("a1","owner","&historyDays=0")).status,400);assert.equal(reads,count);
        const own=await request("a1","sa");assert.equal(own.status,200);assert.equal(own.body.rows.length,6);
        const sibling=await request("a2");assert.equal(sibling.body.rows.length,1);assert.equal(sibling.body.rows[0].currentStock,50);assert.equal(sibling.body.rows[0].soldQuantity,999);
        const foreign=await request("b1","sa");assert.equal(foreign.body.rows.length,1);assert.equal(foreign.body.rows[0].productId,"foreign");assert.equal(foreign.body.rows[0].suggestedQuantity,8);
        assert.deepEqual(await snapshot(),before);
      });
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  },{timeout:40000});}finally{await prisma.$disconnect();}
});
