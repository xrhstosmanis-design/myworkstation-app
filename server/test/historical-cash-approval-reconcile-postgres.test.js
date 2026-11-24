import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const localTestDatabase=()=>{
  try {
    const url=new URL(process.env.DATABASE_URL);
    return process.env.NODE_ENV==='test'
      && ['localhost','127.0.0.1','postgres'].includes(url.hostname)
      && /test/i.test(url.pathname);
  } catch { return false; }
};
test('isolated PostgreSQL: preview, 53 reconciliations, one bank exclusion, audit, and no financial change',
  {skip:!localTestDatabase(),timeout:60000},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const admin=new PrismaClient();
  const schema='cash_review_'+crypto.randomBytes(6).toString('hex');
  const url=new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
  const stores=[['cmw0pwyvo000uokg2jrjm1p0c',12,18],['cmvgtyt6d000zh7gtbsp1en3p',13,10]];
  const run=(args=[],ack)=>spawnSync(process.execPath,
    [new URL('../scripts/reconcile-historical-cash-approvals.mjs',import.meta.url).pathname,...args],
    {encoding:'utf8',timeout:30000,env:{...process.env,DATABASE_URL:url.toString(),
      MWS_CASH_RECONCILE_ACK:ack||''}});
  try {
    await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');
    for(const sql of [
      'CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"sessionId" TEXT,"type" TEXT,"paymentMethod" TEXT,"amount" NUMERIC(14,2),"reversedAt" TIMESTAMPTZ)',
      'CREATE TABLE "SupplierPaymentSettlement" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"transactionId" TEXT,"status" TEXT,"paymentMethod" TEXT,"reviewedBy" TEXT,"reviewedAt" TIMESTAMPTZ,"reviewNote" TEXT)',
      'CREATE TABLE "SupplierPaymentAllocation" ("id" TEXT PRIMARY KEY,"settlementId" TEXT,"amount" NUMERIC(14,2))',
      'CREATE TABLE "OtherExpenseReview" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"transactionId" TEXT,"status" TEXT,"reviewedBy" TEXT,"reviewedAt" TIMESTAMPTZ,"reviewNote" TEXT)',
      'CREATE TABLE "BankLedgerEntry" ("id" TEXT PRIMARY KEY,"sourceTransactionId" TEXT)',
      'CREATE TABLE "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"operatorId" TEXT,"actorId" TEXT,"eventType" TEXT,"details" JSONB)'
    ])await db.$executeRawUnsafe(sql);
    let n=0;
    for(const [storeId,suppliers,expenses] of stores){
      for(let i=0;i<suppliers+expenses;i++){
        const id='transaction-'+(++n),companyId='synthetic-company',supplier=i<suppliers;
        await db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","paymentMethod","amount")
          VALUES (${id},${companyId},${storeId},'synthetic-shift',${supplier?'SUPPLIER_PAYMENT':'OTHER_EXPENSE'},'CASH_SHIFT',10.00)`;
        if(supplier){
          const settlementId='settlement-'+n;
          await db.$executeRaw`INSERT INTO "SupplierPaymentSettlement"
            ("id","companyId","storeId","transactionId","status","paymentMethod")
            VALUES (${settlementId},${companyId},${storeId},${id},'PENDING_REVIEW','CASH_SHIFT')`;
          await db.$executeRaw`INSERT INTO "SupplierPaymentAllocation" ("id","settlementId","amount")
            VALUES (${'allocation-'+n},${settlementId},10.00)`;
        } else {
          await db.$executeRaw`INSERT INTO "OtherExpenseReview" ("id","companyId","storeId","transactionId","status")
            VALUES (${'expense-'+n},${companyId},${storeId},${id},'PENDING_REVIEW')`;
        }
      }
    }
    // A bank transfer must never be reconciled, even with one valid allocation.
    const bankStore=stores[0][0];
    await db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","type","paymentMethod","amount")
      VALUES ('bank-957','synthetic-company',${bankStore},'SUPPLIER_PAYMENT','BANK_TRANSFER',957.47)`;
    await db.$executeRaw`INSERT INTO "SupplierPaymentSettlement"
      ("id","companyId","storeId","transactionId","status","paymentMethod")
      VALUES ('bank-settlement','synthetic-company',${bankStore},'bank-957','PENDING_REVIEW','BANK_TRANSFER')`;
    await db.$executeRaw`INSERT INTO "SupplierPaymentAllocation" ("id","settlementId","amount")
      VALUES ('bank-alloc','bank-settlement',957.47)`;
    await db.$executeRaw`INSERT INTO "BankLedgerEntry" ("id","sourceTransactionId") VALUES ('bank-ledger','bank-957')`;

    const original=JSON.stringify(await db.$queryRaw`SELECT * FROM "StoreTransaction" ORDER BY id`);
    const originalAlloc=JSON.stringify(await db.$queryRaw`SELECT * FROM "SupplierPaymentAllocation" ORDER BY id`);
    const preview=run();
    assert.equal(preview.status,0,preview.stderr);
    assert.match(preview.stdout,/"mode": "PREVIEW"/);
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "StoreOperatorAudit"`)[0].n,0);
    const denied=run(['--apply']);
    assert.equal(denied.status,1);
    assert.match(denied.stderr,/Missing explicit approval guard/);
    const applied=run(['--apply'],'APPROVE_20261124_53_RECORDS');
    assert.equal(applied.status,0,applied.stderr);
    assert.match(applied.stdout,/COMMITTED/);
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "SupplierPaymentSettlement" WHERE status='CONFIRMED'`)[0].n,25);
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "OtherExpenseReview" WHERE status='CONFIRMED'`)[0].n,28);
    assert.equal((await db.$queryRaw`SELECT status FROM "SupplierPaymentSettlement" WHERE id='bank-settlement'`)[0].status,'PENDING_REVIEW');
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "StoreOperatorAudit" WHERE "eventType"='HISTORICAL_CASH_REVIEW_RECONCILED'`)[0].n,53);
    assert.equal(JSON.stringify(await db.$queryRaw`SELECT * FROM "StoreTransaction" ORDER BY id`),original);
    assert.equal(JSON.stringify(await db.$queryRaw`SELECT * FROM "SupplierPaymentAllocation" ORDER BY id`),originalAlloc);
    const replay=run(['--apply'],'APPROVE_20261124_53_RECORDS');
    assert.equal(replay.status,1);
    assert.match(replay.stderr,/Live candidates changed/);
    assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "StoreOperatorAudit"`)[0].n,53);
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
    await admin.$disconnect();
  }
});
