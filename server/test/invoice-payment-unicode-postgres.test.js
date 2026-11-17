import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {findInvoicePayment,assertReusableInvoicePayment,invoiceToken} from '../src/lib/invoice-payment-reuse.js';

function isolated(value=process.env.DATABASE_URL){
 try{
  const u=new URL(value);
  if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(u.pathname)||u.hash)return false;
  const seen=new Set();for(const [key,val] of u.searchParams){if(seen.has(key))return false;seen.add(key);if(key==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(val))return false}else if(!['connection_limit','pool_timeout','statement_cache_size'].includes(key)||!/^\d{1,6}$/.test(val))return false}
  return true;
 }catch{return false}
}
test('unicode payment fixture requires an isolated test target and does not silently skip CI',()=>{
 for(const url of ['postgresql://u:p@remote/module_test','postgresql://u:p@localhost/production','postgresql://u:p@localhost/module_test?host=remote'])assert.equal(isolated(url),false);
 if(process.env.CI)assert.ok(isolated(),'CI must execute the native Unicode lookup regression');
});

test('native invoice lookup normalizes accented Greek consistently without weakening payment identity',{skip:!isolated()},async t=>{
 const {PrismaClient}=await import('@prisma/client');const admin=new PrismaClient(),schema='unicode_invoice_test_'+crypto.randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 const target={companyId:'c',storeId:'store',supplierId:'supplier',supplierTaxId:'999999999',totalGross:12.34};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  await db.$executeRawUnsafe('CREATE TABLE "Supplier"("id" TEXT PRIMARY KEY,"companyId" TEXT,"taxId" TEXT)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreTransaction"("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"type" TEXT,"amount" NUMERIC(14,2),"reversedAt" TIMESTAMPTZ,"invoiceDocumentNumber" TEXT,"description" TEXT,"occurredAt" TIMESTAMPTZ,"invoicePaymentKey" TEXT)');
  await db.$executeRaw`INSERT INTO "Supplier" VALUES ('supplier','c','999999999'),('other-supplier','c','111111111'),('foreign','other-company','999999999')`;
  const add=async(id,number,{description=null,company='c',store='store',supplier='supplier',type='SUPPLIER_PAYMENT',amount=12.34,reversed=null,key=null,time='2026-11-17T10:00:00Z'}={})=>db.$executeRaw`INSERT INTO "StoreTransaction" VALUES (${id},${company},${store},${supplier},${type},${amount},${reversed}::timestamptz,${number},${description},${time}::timestamptz,${key})`;
  for(const [index,number] of ['ΆνευΧ-12345','ΤΊΜ-ΉΈΌΎΏΪΫ-10','Α\u0301νευΧ-54321','Café-123'].entries()){
   await t.test('stored Unicode number '+index,async()=>{
    const id='unicode-'+index;await add(id,number);
    const token=invoiceToken(number);const found=await findInvoicePayment(db,{...target,documentNumber:number});assert.equal(found?.id,id,'stored and requested tokens must agree');
    assert.equal((await findInvoicePayment(db,{...target,documentNumber:token}))?.id,id);assert.equal((await findInvoicePayment(db,{...target,documentNumber:number.normalize('NFD')}))?.id,id);
    assert.equal(assertReusableInvoicePayment(found,{...target,documentNumber:number}).id,id);
    assert.equal(await findInvoicePayment(db,{...target,documentNumber:token+'9'}),null);
   });
  }
  await t.test('legacy description and preferred canonical payment retain exact identity and ordering',async()=>{
   await add('legacy',null,{description:'Τιμολόγιο ΆνευΧ-777 — Γρήγορη καταχώριση POS'});
   assert.equal((await findInvoicePayment(db,{...target,documentNumber:'ΑΝΕΥΧ777'}))?.id,'legacy');
   await add('preferred','ΆνευΧ-777',{key:'c:VAT:999999999:ΑΝΕΥΧ777',time:'2026-11-17T11:00:00Z'});
   assert.equal((await findInvoicePayment(db,{...target,documentNumber:'ΆνευΧ-777'}))?.id,'preferred');
  });
  await t.test('company, supplier, active payment and reuse amount/store boundaries remain strict',async()=>{
   await add('reversed','ΆνευΧ-999',{reversed:'2026-11-17T12:00:00Z'});await add('wrong-type','ΆνευΧ-999',{type:'OTHER_EXPENSE'});await add('wrong-supplier','ΆνευΧ-999',{supplier:'other-supplier'});await add('foreign-company','ΆνευΧ-999',{company:'other-company',supplier:'foreign'});
   assert.equal(await findInvoicePayment(db,{...target,documentNumber:'ΑΝΕΥΧ999'}),null);
   const found=await findInvoicePayment(db,{...target,documentNumber:'ΆνευΧ-12345'});
   for(const change of [{storeId:'other-store'},{supplierId:'other-supplier',supplierTaxId:'111111111'},{totalGross:12.40},{companyId:'other-company'}])assert.throws(()=>assertReusableInvoicePayment(found,{...target,documentNumber:'ΆνευΧ-12345',...change}),{status:409});
   assert.equal(assertReusableInvoicePayment(found,{...target,documentNumber:'ΆνευΧ-12345',totalGross:12.39}).id,found.id,'existing five-cent tolerance retained');
  });
  const before=await db.$queryRaw`SELECT to_jsonb(t) AS row FROM "StoreTransaction" t ORDER BY "id"`;
  await findInvoicePayment(db,{...target,documentNumber:'ΆνευΧ-12345'});
  assert.deepEqual(await db.$queryRaw`SELECT to_jsonb(t) AS row FROM "StoreTransaction" t ORDER BY "id"`,before,'lookup makes no writes');
 }finally{await db.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
