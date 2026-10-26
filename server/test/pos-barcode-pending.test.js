import {posNewProductAllowed} from '../src/lib/pos-new-product-card.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {registerPermanentPriceRoutes} from '../src/lib/pos-permanent-price.js';
import {barcodeRegistrationList} from '../src/lib/pos-barcode-pending.js';

function handler(prisma){
 const routes=new Map(),middleware=[];
 const Router=()=>({get:(path,...fns)=>routes.set(path,fns),post(){},put(){},delete(){},use:(_,fn)=>middleware.push(fn)});
 const source=fs.readFileSync(new URL('../src/routes/store-pos-catalog.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace('export default router;','').replace('const {barcodeRegistrationList}=await import("../lib/pos-barcode-pending.js");','');
 // Isolate legacy catalogue routes; real new-product registration is covered by its mounted/native tests.
 new Function('Router','prisma','z','crypto','registerPermanentPriceRoutes','registerPosNewProductRoutes','posNewProductAllowed','barcodeRegistrationList',source)(Router,prisma,z,crypto,registerPermanentPriceRoutes,()=>{},posNewProductAllowed,barcodeRegistrationList);
 return async(query={},user={id:'u',companyId:'c',role:'OWNER'},storeId='s')=>{
  const req={query,user,params:{storeId},method:'GET',path:`/stores/${storeId}/barcode-registration`},res={statusCode:200,status(c){this.statusCode=c;return this},json(b){this.body=b;return this}};
  for(const fn of [...middleware,...routes.get('/stores/:storeId/barcode-registration')]){let proceed=false,error;await fn(req,res,e=>{proceed=true;error=e});if(error)throw error;if(!proceed)break}
  return res;
 };
}
test('actual read route validates page/store/operator before querying and returns bounded count projection',async()=>{
 let calls=0,values;
 const db={store:{findFirst:async({where})=>where.companyId==='c'?{id:where.id,companyId:'c'}:null},$queryRaw:async(parts,...params)=>{calls++;values=params;return[{missingCount:300,totalMatches:300,rows:[{id:'p',salePrice:'2.5',currentStock:'-1',barcodes:[]}]}]}};
 const run=handler(db);
 const result=await run({missingOnly:'true',offset:'250'});assert.equal(result.body.missingCount,300);assert.equal(result.body.rows[0].salePrice,2.5);assert.equal(result.body.limit,250);assert.ok(values.includes(250)&&values.includes('s')&&values.includes('c'));
 const before=calls;for(const offset of ['-1','1.2','abc','1000001'])assert.equal((await run({offset})).statusCode,400);assert.equal(calls,before);
 await assert.rejects(run({}, {companyId:'foreign'}),e=>e.status===404);
 await assert.rejects(run({}, {companyId:'c',tokenType:'STORE_OPERATOR',storeId:'control'}),e=>e.status===403);
 const denied=handler({...db,$queryRaw:async()=>[{permissions:{addBarcode:false},posAccess:true}]});assert.equal((await denied({}, {id:'op',companyId:'c',tokenType:'STORE_OPERATOR',storeId:'s'})).statusCode,403);
});
const native=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('native actual route counts beyond250, pages every ID, refreshes resolution and preserves alias ownership/store isolation without writes',{skip:!native},async()=>{
 const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
 try{await db.$transaction(async tx=>{
  for(const sql of [
   'CREATE TEMP TABLE "Product"("id" text PRIMARY KEY,"companyId" text,"sku" text,"name" text,"masterProductId" text,"salePrice" numeric,"active" boolean) ON COMMIT DROP',
   'CREATE TEMP TABLE "StoreProduct"("storeId" text,"productId" text,"active" boolean,"salePrice" numeric,"currentStock" numeric) ON COMMIT DROP',
   'CREATE TEMP TABLE "ProductBarcode"("id" text,"productId" text,"barcode" text,"salePrice" numeric) ON COMMIT DROP',
   'CREATE TEMP TABLE "MasterProductBarcode"("masterProductId" text,"barcode" text) ON COMMIT DROP'
  ])await tx.$executeRawUnsafe(sql);
  await tx.$executeRawUnsafe(`INSERT INTO "Product" SELECT 'p'||i,'c',i::text,'same name',NULL,2,true FROM generate_series(1,301) i`);
  await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT 's',"id",true,2.5,7 FROM "Product"`);
  await tx.$executeRawUnsafe(`INSERT INTO "Product" VALUES ('direct','c','D','Roshen',NULL,2,true),('alias','c','A','Alias','m',2,true),('claimed','c','C','Claimed','claimed-master',2,true),('blank','c','B','Blank',NULL,2,true),('foreign','other','F','Foreign',NULL,2,true),('inactive','c','I','Inactive',NULL,2,false),('disabled','c','X','Disabled',NULL,2,true),('control','c','Z','Control',NULL,2,true)`);
  await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT CASE WHEN "id"='control' THEN 'control-store' ELSE 's' END,"id","id"<>'disabled',3,9 FROM "Product" WHERE "id" NOT LIKE 'p%' OR "id"='claimed'`);
  await tx.$executeRawUnsafe(`INSERT INTO "ProductBarcode" VALUES ('d','direct','4823077625626',2),('b','blank','   ',NULL)`);
  await tx.$executeRawUnsafe(`INSERT INTO "MasterProductBarcode" VALUES ('m','12345678'),('claimed-master','4823077625626')`);
  const prisma={$queryRaw:tx.$queryRaw.bind(tx),store:{findFirst:async({where})=>where.companyId==='c'?{id:where.id,companyId:'c'}:null}},run=handler(prisma);
  const snapshot=async()=>Promise.all(['Product','StoreProduct','ProductBarcode','MasterProductBarcode'].map(table=>tx.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY 1,2`)));
  const before=await snapshot(),first=(await run({missingOnly:'true'})).body,second=(await run({missingOnly:'true',offset:'250'})).body;
  assert.equal(first.missingCount,303);assert.equal(first.totalMatches,303);assert.equal(first.rows.length,250);assert.equal(second.rows.length,53);assert.equal(new Set([...first.rows,...second.rows].map(x=>x.id)).size,303);
  assert.ok([...first.rows,...second.rows].some(x=>x.id==='claimed'));assert.ok([...first.rows,...second.rows].some(x=>x.id==='blank'));assert.ok(![...first.rows,...second.rows].some(x=>['direct','alias','foreign','inactive','disabled','control'].includes(x.id)));
  const alias=(await run({q:'12345678'})).body;assert.equal(alias.rows[0].id,'alias');assert.equal(alias.rows[0].barcodes[0].barcode,'12345678');
  assert.deepEqual((await run({q:'4823077625626'})).body.rows.map(x=>x.id),['direct']);
  assert.equal((await run({q:'no matches',countOnly:'true'})).body.missingCount,303);
  assert.equal((await run({missingOnly:'true'},undefined,'control-store')).body.missingCount,1);
  assert.deepEqual(await snapshot(),before);
  // A separate fixture action simulates another window completing a barcode.
  await tx.$executeRawUnsafe(`INSERT INTO "ProductBarcode" VALUES ('resolved','p1','98765432',NULL)`);
  const after=(await run({missingOnly:'true',q:'1'})).body;assert.equal(after.missingCount,302);assert.ok(!after.rows.some(x=>x.id==='p1'));
  assert.equal((await run({countOnly:'true'})).body.rows.length,0);
 },{timeout:30000})}finally{await db.$disconnect()}
});
