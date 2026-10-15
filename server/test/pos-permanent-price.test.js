import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {priceInput,assertPriceAccess,readPermanentPrice,savePermanentPrice,registerPermanentPriceRoutes} from '../src/lib/pos-permanent-price.js';
import {invoiceAuditFinancialText} from '../../client/src/components/commerce/invoiceAuditFinancials.js';
const store={id:'store',companyId:'company',name:'LAB'},access={changeRetail:true};
const req=(body={})=>({user:{id:'owner',companyId:'company',role:'OWNER',fullName:'OWNER'},params:{storeId:'store',productId:'product'},body,query:{}});
const input=()=>({newPrice:0.6,expectedPrice:0.5,reason:'Αλλαγή τιμοκαταλόγου',confirm:true,requestId:randomUUID()});
test('permanent store price validates finite cents, reason, explicit confirmation and current access',()=>{
  assert.equal(priceInput(input()).newPrice,0.6);
  for(const newPrice of ['',null,-1,NaN,Infinity,0.111,1000000])assert.throws(()=>priceInput({...input(),newPrice}),{status:400});
  for(const extra of [{confirm:false},{reason:''},{requestId:'x'},{expectedPrice:null}])assert.throws(()=>priceInput({...input(),...extra}),{status:400});
  assert.doesNotThrow(()=>assertPriceAccess(req(),store,access));
  assert.throws(()=>assertPriceAccess(req(),store,{}),{status:403});
  assert.throws(()=>assertPriceAccess(req(),{...store,companyId:'foreign'},access),{status:403});
  const r=req();r.user.role='EMPLOYEE';assert.throws(()=>assertPriceAccess(r,store,access),{status:403});r.user.tokenType='STORE_OPERATOR';r.user.storeId='foreign';assert.throws(()=>assertPriceAccess(r,store,access),{status:403});r.user.storeId='store';assert.doesNotThrow(()=>assertPriceAccess(r,store,access));
});
test('permanent price preparation is read-only, honors product flag and blocks fixed barcode price',async()=>{
  let row={id:'product',name:'ΝΕΡΟ 500ML',sku:'W500',salePrice:'0.5',allowPosPriceChange:true},barcode=[];
  const queries=[],db={$queryRaw:async(strings,...values)=>{queries.push([strings.join('?'),values]);return strings.join('').includes('ProductBarcode')?barcode:[row]}};
  assert.equal((await readPermanentPrice(db,req(),store,access)).salePrice,0.5);
  assert.ok(queries[0][0].includes('s."active"=true'));assert.ok(queries[0][1].includes('company'));assert.ok(queries[0][1].includes('store'));
  row={...row,allowPosPriceChange:false};await assert.rejects(readPermanentPrice(db,req(),store,access),{status:403});row.allowPosPriceChange=true;
  const r=req();r.query.barcode='123';barcode=[{salePrice:'0.7'}];await assert.rejects(readPermanentPrice(db,r,store,access),{status:409});row=null;await assert.rejects(readPermanentPrice(db,req(),store,access),{status:404});
});
test('Events financial text names the exact product and SKU with before/after prices',()=>{
  const text=invoiceAuditFinancialText({eventType:'PERMANENT_PRICE_CHANGE',financialDetails:{productName:'ΝΕΡΟ 500ML',sku:'W500',oldPrice:0.5,newPrice:0.6}});
  for(const part of ['ΝΕΡΟ 500ML','W500','0,50','0,60','Μόνιμη'])assert.ok(text.includes(part),part);
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PG permanent price is atomic, idempotent and store scoped; stale/denied/failed Audit cannot change price',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`pos_price_${randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" bool)',
      'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"sku" text,"salePrice" numeric,"active" bool,"allowPosPriceChange" bool)',
      'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"salePrice" numeric,"active" bool,"currentStock" numeric,"updatedAt" timestamp,primary key("storeId","productId"))',
      'CREATE TABLE "ProductBarcode"("productId" text,"barcode" text,"salePrice" numeric)',
      'CREATE TABLE "ProductPriceHistory"("id" text primary key,"companyId" text,"productId" text,"storeId" text,"oldPrice" numeric,"newPrice" numeric,"changeType" text,"createdByUserId" text)',
      'CREATE TABLE "PosSaleActionAudit"("id" text primary key,"companyId" text,"storeId" text,"actionType" text,"reason" text,"actorId" text,"actorName" text,"details" jsonb)',
      'CREATE TABLE "CashShiftSession"("id" text,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedAt" timestamp)',
      'CREATE TABLE "StoreOperatorProfile"("companyId" text,"storeId" text,"employeeId" text,"permissions" jsonb,"posAccess" bool)',
      'CREATE TABLE "StoreOperatorCredential"("id" text,"companyId" text,"storeId" text,"employeeId" text,"active" bool)',
      'CREATE TABLE "StockMovement"("id" text,"quantity" numeric)',
      'CREATE TABLE "StoreTransaction"("id" text,"amount" numeric)'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Store" VALUES('store','company','LAB',true),('control','company','CONTROL',true),('foreign','other','OTHER',true)`;
    await db.$executeRaw`INSERT INTO "Product" VALUES('product','company','ΝΕΡΟ 500ML','W500',0.5,true,true),('foreign','other','OTHER','F',1,true,true)`;
    await db.$executeRaw`INSERT INTO "StoreProduct" VALUES('store','product',NULL,true,12,NULL),('control','product',0.9,true,30,NULL),('foreign','foreign',1,true,99,NULL)`;
    await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES('shift','company','store','MAIN','OPEN',NOW())`;
    await db.$executeRaw`INSERT INTO "StoreOperatorProfile" VALUES('company','store','employee','{"changeRetail":true}',true)`;
    await db.$executeRaw`INSERT INTO "StoreOperatorCredential" VALUES('operator','company','store','employee',true)`;
    await db.$executeRaw`INSERT INTO "StockMovement" VALUES('prior',-1)`;await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES('prior',0.5)`;
    const controls=async()=>JSON.stringify(await Promise.all([db.$queryRaw`SELECT * FROM "StockMovement"`,db.$queryRaw`SELECT * FROM "StoreTransaction"`,db.$queryRaw`SELECT "storeId","currentStock" FROM "StoreProduct" ORDER BY "storeId"`,db.$queryRaw`SELECT "salePrice" FROM "Product"`,db.$queryRaw`SELECT * FROM "StoreProduct" WHERE "storeId"!='store' ORDER BY "storeId"`]));
    const before=await controls(),options={ensureAudit:async()=>{},terminal:async()=>'MAIN'};
    const call=body=>savePermanentPrice(db,req(body),store,access,options);
    const payload=input(),results=await Promise.all(Array.from({length:4},()=>call(payload)));
    assert.equal(results.filter(x=>!x.replayed).length,1);assert.equal(new Set(results.map(x=>x.eventId)).size,1);
    assert.equal(Number((await db.$queryRaw`SELECT "salePrice" FROM "StoreProduct" WHERE "storeId"='store'`)[0].salePrice),0.6);
    const events=await db.$queryRaw`SELECT * FROM "PosSaleActionAudit"`;assert.equal(events.length,1);assert.equal(events[0].details.productName,'ΝΕΡΟ 500ML');assert.equal(events[0].details.sku,'W500');assert.equal(events[0].details.sessionId,'shift');assert.equal(events[0].actorName,'OWNER');assert.equal(events[0].details.scope,'STORE_PERMANENT');
    assert.equal((await db.$queryRaw`SELECT * FROM "ProductPriceHistory"`).length,1);assert.equal(await controls(),before);
    await assert.rejects(call({...input(),newPrice:0.8}),{status:409});
    await assert.rejects(call({...payload,newPrice:0.9}),{status:409});
    const foreign=req({...input(),expectedPrice:1});foreign.params.productId='foreign';await assert.rejects(savePermanentPrice(db,foreign,store,access,options),{status:404});
    await db.$executeRaw`UPDATE "Product" SET "allowPosPriceChange"=false WHERE "id"='product'`;
    await assert.rejects(call({...input(),expectedPrice:0.6}),{status:403});
    await db.$executeRaw`UPDATE "Product" SET "allowPosPriceChange"=true WHERE "id"='product'`;
    const denied=req({...input(),expectedPrice:0.6});Object.assign(denied.user,{id:'operator',operatorId:'operator',tokenType:'STORE_OPERATOR',storeId:'store'});
    await db.$executeRaw`UPDATE "StoreOperatorProfile" SET "permissions"='{"changeRetail":false}'`;
    await assert.rejects(savePermanentPrice(db,denied,store,access,options),{status:403});
    await db.$executeRaw`ALTER TABLE "PosSaleActionAudit" ADD CONSTRAINT reject_new CHECK (("details"->>'newPrice')::numeric < 0.7)`;
    await assert.rejects(call({...input(),expectedPrice:0.6,newPrice:0.8}));
    assert.equal(Number((await db.$queryRaw`SELECT "salePrice" FROM "StoreProduct" WHERE "storeId"='store'`)[0].salePrice),0.6);assert.equal((await db.$queryRaw`SELECT * FROM "ProductPriceHistory"`).length,1);assert.equal(await controls(),before);
    // Exercise the registered GET handler and its store/product identity response.
    const routes={};registerPermanentPriceRoutes({get:(p,h)=>routes.get=h,post:(p,h)=>routes.post=h},db);
    const r=req();r.storeOperatorStore=store;r.storeOperatorAccess=access;let response;
    await routes.get(r,{set(){},json(v){response=v}},e=>{throw e});assert.equal(response.salePrice,0.6);assert.equal(response.productId,'product');
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
