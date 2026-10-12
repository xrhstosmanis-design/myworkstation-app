import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {ownerSupplierProofError,readSupplierProofPdf,supplierProofMismatch} from '../src/routes/supplier-proof-pdf-check.js';
const source=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
const schemaSource=source.slice(source.indexOf('const supplierSettlementSchema='),source.indexOf('\nfunction parseAttachment'));
const schema=new Function('z',schemaSource+';return supplierSettlementSchema;')(z);
const user={id:'actor',fullName:'Virtual operator',companyId:'company',storeId:'store',terminalPos:'MAIN',tokenType:'STORE_OPERATOR',permissions:['STORE_LEDGER','SUPPLIER_PAYMENT']};
const request=(extra={})=>({supplierId:'supplier',paymentMethod:'CASH_SHIFT',paidAt:'2026-10-12',idempotencyKey:crypto.randomUUID(),evidenceMode:'NO_DOCUMENT',noDocumentAcknowledged:true,allocations:[{purchaseDocumentId:'doc',amount:6}],...extra});
const image={dataUrl:'data:image/jpeg;base64,'+Buffer.alloc(120,1).toString('base64'),filename:'virtual.jpg'};
test('no-proof supplier settlement requires explicit boolean acknowledgement and unambiguous evidence mode',()=>{
 assert.equal(schema.safeParse(request()).success,true);
 for(const value of [false,undefined,null,'true',1])assert.equal(schema.safeParse(request({noDocumentAcknowledged:value})).success,false);
 for(const evidenceMode of ['DOCUMENT',undefined,'unknown'])assert.equal(schema.safeParse(request({evidenceMode})).success,false);
 assert.equal(schema.safeParse(request({attachment:image})).success,false);
 const legacy=request({attachment:image});delete legacy.evidenceMode;delete legacy.noDocumentAcknowledged;
 assert.equal(schema.parse(legacy).evidenceMode,'DOCUMENT');
});
function registered(db){
 const handlers=new Map();let guard;
 const Router=()=>({use(...args){guard=args.at(-1)},...Object.fromEntries(['get','post'].map(method=>[method,(path,...args)=>handlers.set(method+path,args.at(-1))]))});
 const tableStatements=new Function('Router','prisma','crypto','z','auth','executeHotTableBootstrap','ownerSupplierProofError','readSupplierProofPdf','supplierProofMismatch',source+';return tableStatements;')(Router,db,crypto,z,()=>{},async()=>{},ownerSupplierProofError,readSupplierProofPdf,supplierProofMismatch);
 const run=(body,requestUser=user,storeId='store')=>new Promise(resolve=>{
  let status=200;const req={method:'POST',user:requestUser,params:{storeId},headers:{},body,query:{},originalUrl:`/api/transactions/stores/${storeId}/supplier-settlements`},res={status(n){status=n;return this},json(data){resolve({status,data})}};
  guard(req,res,()=>handlers.get('post/stores/:storeId/supplier-settlements')(req,res));
 });return {run,tableStatements};
}
test('actual supplier route rejects missing declaration and foreign/unauthorized operator before financial writes',async()=>{
 let writes=0;const db={store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store',companyId:'company',active:true}:null},$transaction:async()=>{writes++;throw Error('unexpected write')}};
 const {run}=registered(db);
 assert.equal((await run(request({noDocumentAcknowledged:false}))).status,400);
 assert.equal((await run(request(),{...user,permissions:[]})).status,403);
 assert.equal((await run(request(),user,'foreign')).status,403);
 assert.equal(writes,0);
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native supplier declaration atomically persists pending payment, audit and allocations, rejects replay/overpayment and rolls back', {skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schemaName='supplier_declaration_'+crypto.randomBytes(6).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schemaName);
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 let auditFail=false;const wrapped=new Proxy(db,{get(target,key){
  if(key==='store')return {findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store',active:true,companyId:'company'}:null};
  if(key==='$transaction')return cb=>target.$transaction(tx=>cb(new Proxy(tx,{get(t,k){if(k==='$executeRaw')return (strings,...values)=>{if(auditFail&&strings.join('').includes('INSERT INTO "StoreOperatorAudit"'))throw Error('virtual audit failure');return t.$executeRaw(strings,...values)};const v=t[k];return typeof v==='function'?v.bind(t):v}})));
  const v=target[key];return typeof v==='function'?v.bind(target):v;
 }});
 const {run,tableStatements}=registered(wrapped);
 try{
  await db.$executeRawUnsafe('CREATE TABLE "Supplier" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN DEFAULT true)');
  await db.$executeRawUnsafe('CREATE TABLE "PurchaseDocument" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"supplierId" TEXT,"documentNumber" TEXT,"totalGross" NUMERIC(14,2),"status" TEXT,"settlementMode" TEXT)');
  for(const sql of tableStatements)await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Supplier" ("id","companyId","name") VALUES ('supplier','company','VIRTUAL SUPPLIER'),('foreign','foreign','FOREIGN')`;
  await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES ('doc','company','supplier','VIRTUAL-001',10,'DRAFT','CREDIT'),('foreign','foreign','foreign','FOREIGN',10,'DRAFT','CREDIT')`;
  await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","openedBy","terminalPos") VALUES ('shift','company','store','actor','MAIN')`;
  const reset=async()=>{auditFail=false;await db.$executeRawUnsafe('TRUNCATE "SupplierPaymentAllocation","SupplierPaymentSettlement","StoreTransaction","StoreOperatorAudit","BankLedgerEntry" CASCADE');await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='OPEN'`;};
  const state=async()=>({payments:await db.$queryRaw`SELECT * FROM "StoreTransaction"`,settlements:await db.$queryRaw`SELECT * FROM "SupplierPaymentSettlement"`,allocations:await db.$queryRaw`SELECT * FROM "SupplierPaymentAllocation"`,events:await db.$queryRaw`SELECT * FROM "StoreOperatorAudit"`,bank:await db.$queryRaw`SELECT * FROM "BankLedgerEntry"`});
  const first=request();const result=await run(first);assert.equal(result.status,201);assert.equal(result.data.status,'PENDING_REVIEW');let s=await state();
  assert.equal(s.payments.length,1);assert.equal(s.settlements.length,1);assert.equal(s.allocations.length,1);assert.equal(s.events.length,1);assert.equal(s.payments[0].attachmentData,null);assert.equal(s.payments[0].sessionId,'shift');assert.equal(s.payments[0].actorId,'actor');assert.equal(Number(s.payments[0].amount),6);assert.match(s.payments[0].description,/ΧΩΡΙΣ ΑΠΟΔΕΙΚΤΙΚΟ/);assert.match(s.settlements[0].note,/πραγματοποίησα την πληρωμή 6.00/);assert.equal(s.events[0].details.evidenceMode,'NO_DOCUMENT');assert.equal(s.events[0].details.actorName,'Virtual operator');assert.ok(s.events[0].details.acceptedAt);assert.match(s.events[0].details.responsibilityDeclaration,/VIRTUAL SUPPLIER/);assert.equal(s.events[0].eventType,'SUPPLIER_SETTLEMENT_NO_DOCUMENT_DECLARED');
  assert.equal((await run(first)).status,409);assert.equal((await state()).payments.length,1);
  await reset();const concurrent=await Promise.all([run(request()),run(request())]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);assert.equal((await state()).payments.length,1);
  await reset();const same=request();const replay=await Promise.all([run(same),run(same)]);assert.deepEqual(replay.map(r=>r.status).sort(),[201,409]);assert.equal((await state()).events.length,1);
  await reset();auditFail=true;assert.equal((await run(request())).status,500);s=await state();assert.equal(s.payments.length+s.settlements.length+s.allocations.length+s.events.length,0);
  await reset();await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED'`;assert.equal((await run(request())).status,409);assert.equal((await state()).payments.length,0);
  await reset();assert.equal((await run(request({allocations:[{purchaseDocumentId:'foreign',amount:6}]}))).status,409);assert.equal((await run(request({allocations:[{purchaseDocumentId:'doc',amount:11}]}))).status,409);
  const owner={...user,tokenType:'USER',role:'OWNER'};
  await reset();const bank=await run(request({paymentMethod:'BANK_TRANSFER'}),owner);assert.equal(bank.status,201);s=await state();assert.equal(s.settlements[0].status,'PENDING_REVIEW');assert.equal(s.payments[0].sessionId,null);assert.equal(s.bank[0].status,'PENDING_REVIEW');assert.equal(s.bank[0].attachmentData,null);assert.equal(Number(s.bank[0].amount),-6);
  await reset();const attached=request({evidenceMode:'DOCUMENT',noDocumentAcknowledged:false,attachment:image});assert.equal((await run(attached,owner)).status,201);s=await state();assert.equal(s.settlements[0].status,'CONFIRMED');assert.equal(s.payments[0].attachmentData,image.dataUrl);assert.equal(s.events[0].eventType,'SUPPLIER_SETTLEMENT_CONFIRMED');
  await reset();const pdf=fs.readFileSync(new URL('./fixtures/g5-p09-bank-transfer.pdf',import.meta.url));assert.equal((await run(request({evidenceMode:'DOCUMENT',noDocumentAcknowledged:false,attachment:{dataUrl:'data:application/pdf;base64,'+pdf.toString('base64'),filename:'proof.pdf'}}),owner)).status,400);assert.equal((await state()).payments.length,0);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);await admin.$disconnect();}
});
