import {greeceDateTimeInput,greeceDateTimeToIso} from "../../shared/greece-time.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {z} from 'zod';
import {readCustomerActivityLedger} from '../src/lib/customer-activity-ledger.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('actual legacy receipt edit denies POS-linked accounting changes while manual receipt edit remains available',async()=>{
  const source=await fs.readFile(new URL('../src/routes/customer-control-v2.js',import.meta.url),'utf8');
  const start=source.indexOf('router.patch("/receipts/:receiptId"'),line=source.slice(start,source.indexOf('\n',start));
  let found={id:'r',customerId:'c',amount:-.3,referenceType:'POS_CUSTOMER_RECEIPT'},transactions=0,writes=[];
  const db={$queryRaw:async()=>found?[found]:[],$transaction:async fn=>{transactions++;await fn({$executeRaw:async(sql,...values)=>writes.push({sql:sql.join('?'),values})})}};
  const handler=new Function('prisma','z','validStore','n','let handler;const router={patch:(p,h)=>handler=h};'+line+';return handler;')(db,z,async()=>{throw Error('unexpected store lookup')},Number);
  const call=async()=>{let status=200,payload;const res={status:s=>{status=s;return res},json:p=>{payload=p;return res}};await handler({user:{companyId:'company',id:'owner'},params:{receiptId:'r'},body:{amount:.2}},res,e=>{throw e});return {status,payload}};
  assert.equal((await call()).status,409);assert.equal(transactions,0);assert.equal(writes.length,0);
  found=null;assert.equal((await call()).status,404);assert.equal(transactions,0);
  found={id:'r',customerId:'c',amount:-.3,referenceType:'MANUAL_RECEIPT'};assert.equal((await call()).status,200);assert.equal(transactions,1);assert.equal(writes.length,2);assert.match(writes[0].sql,/UPDATE "CustomerLedger"/);
});

test('actual receipts table exposes only manual edit and identifies POS rows as read-only',async()=>{
  const source=await fs.readFile(new URL('../../client/src/components/commerce/installCustomerControlSuiteV2.js',import.meta.url),'utf8');
  const start=source.indexOf('function receipts(){'),end=source.indexOf('\n',start),implementation=source.slice(start,end);
  const state={rows:{items:[{id:'pos',referenceType:'POS_CUSTOMER_RECEIPT',amount:.3},{id:'manual',referenceType:'MANUAL_RECEIPT',amount:.2}]}};
  const render=new Function('state','criteria','money','esc','fmt',implementation+';return receipts;')(state,()=>'',String,String,String);
  const dom=new JSDOM(render());try{assert.equal(dom.window.document.querySelectorAll('[data-cc-edit-receipt]').length,1);assert.equal(dom.window.document.querySelector('[data-cc-edit-receipt]').dataset.ccEditReceipt,'manual');assert.match(dom.window.document.body.textContent,/POS · μόνο ανάγνωση/)}finally{dom.window.close()}
});

test('account ledger rejects invalid date windows before database access',async()=>{
  const db={$transaction:()=>{throw Error('unexpected database access')}};
  for(const query of [{from:'invalid'},{from:'2026-02-02',to:'2026-02-01'}])await assert.rejects(readCustomerActivityLedger(db,'company','customer',query),e=>e.status===400);
});

test('native isolated PostgreSQL account ledger de-duplicates credit, enriches receipts, preserves returns and reconciles bounded dates',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`customer_activity_${crypto.randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Customer"("id" text PRIMARY KEY,"companyId" text,"name" text,"balance" numeric(14,2))',
      'CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text,"name" text)',
      'CREATE TABLE "CustomerLedger"("id" text PRIMARY KEY,"customerId" text,"storeId" text,"createdAt" timestamptz,"entryType" text,"amount" numeric(14,2),"referenceId" text,"note" text,"paymentMethod" text,"actorId" text,"actorName" text)',
      'CREATE TABLE "Sale"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"customerId" text,"status" text,"occurredAt" timestamptz,"source" text,"reversalKind" text,"transactionMode" text,"total" numeric(14,2),"receiptNumber" text,"delayedReason" text,"originalSaleId" text,"operatorEmployeeId" text)',
      'CREATE TABLE "Payment"("saleId" text,"method" text)',
      'CREATE TABLE "SaleLine"("id" text,"saleId" text,"quantity" numeric,"description" text,"unitPrice" numeric,"lineTotal" numeric,"createdAt" timestamptz)',
      'CREATE TABLE "PosSaleActionAudit"("companyId" text,"storeId" text,"saleId" text,"reason" text,"createdAt" timestamptz)'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Customer" VALUES ('c','company','Virtual LAB',1.10),('foreign','other','Foreign',2)`;
    await db.$executeRaw`INSERT INTO "Store" VALUES ('store','company','LAB'),('foreign-store','other','Other')`;
    await db.$executeRaw`INSERT INTO "Sale" VALUES
      ('credit','company','store','c','COMPLETED','2026-01-01T10:00Z','POS',NULL,'CREDIT',0.80,NULL,NULL,NULL,'operator'),
      ('cash-sale','company','store','c','COMPLETED','2026-01-02T10:00Z','POS',NULL,'NORMAL',0.25,NULL,NULL,NULL,'operator'),
      ('return','company','store','c','COMPLETED','2026-01-02T11:00Z','POS_REVERSAL','RETURN_ITEMS','NORMAL',-0.25,NULL,NULL,'cash-sale','operator')`;
    await db.$executeRaw`INSERT INTO "Payment" VALUES ('credit','CREDIT'),('cash-sale','CASH'),('return','CASH')`;
    await db.$executeRaw`INSERT INTO "SaleLine" VALUES ('line','credit',1,'ΝΕΡΟ',1,0.8,'2026-01-01T10:00Z')`;
    await db.$executeRaw`INSERT INTO "PosSaleActionAudit" VALUES ('company','store','return','Επιστροφή από πελάτη','2026-01-02T11:00Z')`;
    await db.$executeRaw`INSERT INTO "CustomerLedger" VALUES
      ('credit-ledger','c','store','2026-01-01T10:00Z','SALE_CREDIT',0.80,'credit','Πίστωση POS','CREDIT','operator','LAB POS2'),
      ('cash-receipt','c','store','2026-01-03T10:00Z','RECEIPT',-0.30,'cash-receipt','Μερική είσπραξη','CASH','operator','LAB POS2'),
      ('card-receipt','c','store','2026-01-04T10:00Z','RECEIPT',-0.40,'card-receipt','CARD APPROVED','CARD','operator','LAB POS2')`;
    const before=await db.$queryRaw`SELECT (SELECT COUNT(*) FROM "Sale") AS "sales",(SELECT COUNT(*) FROM "CustomerLedger") AS "ledger",(SELECT "balance" FROM "Customer" WHERE "id"='c') AS "balance"`;
    const all=await readCustomerActivityLedger(db,'company','c',{from:'2026-01-01',to:'2026-01-05'});
    assert.equal(all.rows.length,5);assert.equal(all.rows.filter(r=>r.reference==='credit').length,1);
    assert.equal(all.openingBalance,1);assert.equal(all.closingBalance,1.1);assert.equal(all.customer.balance,1.1);
    const credit=all.rows.find(r=>r.reference==='credit');assert.equal(credit.debit,.8);assert.equal(credit.credit,0);assert.equal(credit.paymentMethod,'CREDIT');assert.equal(credit.actorId,'LAB POS2');assert.match(credit.items,/ΝΕΡΟ/);assert.match(credit.items,/0.8/);assert.equal(credit.runningBalance,1.8);
    const cash=all.rows.find(r=>r.id==='cash-sale');assert.equal(cash.debit,.25);assert.equal(cash.credit,.25);assert.equal(cash.runningBalance,1.8);
    const reversal=all.rows.find(r=>r.id==='return');assert.equal(reversal.type,'SALE_RETURN');assert.equal(reversal.originalSaleId,'cash-sale');assert.equal(reversal.amount,-.25);assert.equal(reversal.note,'Επιστροφή από πελάτη');assert.equal(reversal.runningBalance,1.8);
    const receipt=all.rows.find(r=>r.id==='cash-receipt');assert.equal(receipt.credit,.3);assert.equal(receipt.runningBalance,1.5);assert.equal(receipt.paymentMethod,'CASH');assert.equal(receipt.actorId,'LAB POS2');
    const window=await readCustomerActivityLedger(db,'company','c',{from:'2026-01-03',to:'2026-01-03T23:59:59Z'});assert.equal(window.rows.length,1);assert.equal(window.openingBalance,1.8);assert.equal(window.closingBalance,1.5);assert.equal(window.customer.balance,1.1);
    assert.equal(await readCustomerActivityLedger(db,'company','foreign'),null);
    assert.deepEqual(await db.$queryRaw`SELECT (SELECT COUNT(*) FROM "Sale") AS "sales",(SELECT COUNT(*) FROM "CustomerLedger") AS "ledger",(SELECT "balance" FROM "Customer" WHERE "id"='c') AS "balance"`,before);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});

test('actual customer ledger modal renders charges, receipts, reasons, methods, actors and window balances',async()=>{
  const source=await fs.readFile(new URL('../../client/src/components/commerce/installCustomerControlSuiteV2.js',import.meta.url),'utf8');
  const implementation=source.slice(source.indexOf('async function ledgerModal('),source.indexOf('function openContext('));
  const dom=new JSDOM('<body></body>'),document=dom.window.document,calls=[];
  const data={customer:{balance:.5},openingBalance:0,closingBalance:.5,rows:[
    {at:'2026-10-11T21:00Z',type:'RECEIPT',transactionMode:null,reference:'receipt',paymentMethod:'CASH',actorId:'LAB POS2',credit:.3,runningBalance:.5,note:'Μερική είσπραξη'},
    {at:'2026-10-11T20:00Z',type:'SALE_CREDIT',transactionMode:'CREDIT',reference:'sale',items:'1 × ΝΕΡΟ @ 1 € · 0.80 €',paymentMethod:'CREDIT',actorId:'LAB POS2',debit:.8,runningBalance:.8},
    {at:'2026-10-11T19:00Z',type:'SALE_RETURN',amount:-1,debit:-1,credit:-1,runningBalance:0,note:'Επιστροφή από πελάτη'}]};
  const api=async path=>{calls.push(path);return data},modal=html=>{const e=document.createElement('section');e.innerHTML=html;document.body.appendChild(e);return e};
  const open=new Function('api','modal','esc','money','fmt','alert','greeceDateTimeInput','greeceDateTimeToIso',implementation+';return ledgerModal;')(api,modal,String,v=>Number(v||0).toFixed(2)+' €',String,e=>{throw Error(e)},greeceDateTimeInput,greeceDateTimeToIso);
  try{await open('c');const rows=[...document.querySelectorAll('.cc-table.ledger .row')].slice(1).map(r=>r.textContent);assert.equal(rows.length,3);assert.match(rows[0],/Πληρωμή.*CASH.*0.30 €.*0.50 €.*LAB POS2.*Μερική είσπραξη/);assert.match(rows[1],/Πιστωτική πώληση.*ΝΕΡΟ.*CREDIT.*0.80 €.*LAB POS2/);assert.match(rows[2],/Επιστροφή.*-1.00 €.*Επιστροφή από πελάτη/);assert.match(document.querySelector('.cc-ledger-balance').textContent,/Υπόλοιπο έναρξης διαστήματος.*0.00 €.*Υπόλοιπο τέλους διαστήματος.*0.50 €/);assert.match(calls[0],/from=.*to=/);assert.equal(new Date(new URL(calls[0],"https://test.invalid").searchParams.get("to")).getUTCSeconds(),59)}finally{dom.window.close()}
});

