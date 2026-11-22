import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {expenseReviewStatus} from '../src/routes/expense-review-policy.js';

const source=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
const actor={id:'operator',fullName:'Virtual operator',companyId:'company',storeId:'store',terminalPos:'MAIN',tokenType:'STORE_OPERATOR',permissions:['THIRD_PARTY_PAYMENT']};
const request=(extra={})=>({type:'OTHER_EXPENSE',amount:1.25,description:'Synthetic expense category test',paymentSource:'CASH_SHIFT',paymentMethod:'CASH_SHIFT',evidenceMode:'NO_DOCUMENT',idempotencyKey:crypto.randomUUID(),expenseCategoryId:'active',...extra});

// Register the actual route and its original permission/store checks. Only
// authentication (already-resolved actor) and startup DDL are outside this test.
function register(db){
  const routes=new Map();let guard;
  const Router=()=>({use(...args){guard=args.at(-1)},...Object.fromEntries(['get','post'].map(method=>[method,(path,...handlers)=>routes.set(method+path,handlers.at(-1))]))});
  const tables=new Function('Router','prisma','crypto','z','auth','executeHotTableBootstrap','expenseReviewStatus',source+';return tableStatements;')(Router,db,crypto,z,()=>{},async()=>{},expenseReviewStatus);
  const run=(body=request(),user=actor,storeId='store')=>new Promise(resolve=>{
    let status=200;
    const req={method:'POST',user,body,params:{storeId},query:{},headers:{},originalUrl:`/api/transactions/stores/${storeId}`};
    const res={status(value){status=value;return this},json(data){resolve({status,data})}};
    guard(req,res,()=>routes.get('post/stores/:storeId')(req,res));
  });
  return {tables,run};
}

test('actual expense handler refuses foreign stores, denied actors and malformed or non-expense categories before money writes',async()=>{
  let writes=0,reads=0;
  const db={store:{findFirst:async()=>({id:'store',companyId:'company',active:true})},$executeRaw:async()=>{writes++;return 1},$queryRaw:async()=>{reads++;return []},$transaction:async fn=>fn(db)};
  const {run}=register(db);
  assert.equal((await run(request(),actor,'foreign')).status,403);
  assert.equal((await run(request(),{...actor,permissions:[]})).status,403);
  for(const expenseCategoryId of ['', '   ', 'x'.repeat(181),{},12])assert.equal((await run(request({expenseCategoryId}))).status,400);
  assert.equal((await run(request({type:'SALE_CASH'}))).status,400);
  assert.equal((await run(request({type:'SUPPLIER_PAYMENT'}))).status,400);
  assert.equal((await run(request({deferredInvoice:{documentDate:'2026-11-03',sessionId:'shift'}}))).status,400);
  assert.equal(writes,0);assert.equal(reads,0);
});

test('actual expense handler refuses an unavailable category before inserting an expense',async()=>{
  let writes=0,transactions=0;
  const db={store:{findFirst:async()=>({id:'store',companyId:'company',active:true})},$executeRaw:async()=>{writes++;return 1},$queryRaw:async()=>[],$transaction:async fn=>{transactions++;return fn(db)}};
  const result=await register(db).run();
  assert.equal(result.status,409);assert.match(result.data.error,/κατηγορία εξόδου/);assert.equal(transactions,1);assert.equal(writes,0);
});

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('native registered expense route binds only active same-company categories atomically across all insertion paths, preserves replay identity and locks deactivation',{skip:!isolated(),timeout:30000},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient();
  const schema='expense_category_'+crypto.randomBytes(6).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const db=new PrismaClient({datasources:{db:{url:url.toString()}}}),other=new PrismaClient({datasources:{db:{url:url.toString()}}});
  let afterCategoryLock=null,denyBinding=false;
  const wrap=target=>new Proxy(target,{get(current,key){
    if(key==='store')return {findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store',companyId:'company',name:'Synthetic store',active:true}:null};
    if(key==='$transaction')return fn=>current.$transaction(tx=>fn(wrap(tx)));
    if(key==='$queryRaw')return async(strings,...values)=>{const rows=await current.$queryRaw(strings,...values);if(strings.join('').includes('FROM "ManagementExpenseCategory"')&&afterCategoryLock)await afterCategoryLock();return rows};
    if(key==='$executeRaw')return (strings,...values)=>denyBinding&&strings.join('').includes('UPDATE "StoreTransaction" SET "expenseCategoryId"')?Promise.resolve(0):current.$executeRaw(strings,...values);
    const value=current[key];return typeof value==='function'?value.bind(current):value;
  }});
  const {tables,run}=register(wrap(db));
  try{
    await db.$executeRawUnsafe('CREATE TABLE "PurchaseDocument" (id TEXT PRIMARY KEY)');
    for(const sql of tables)await db.$executeRawUnsafe(sql);
    // This existing nullable column/catalog belongs to the central management
    // schema. The production route adds neither table nor column.
    await db.$executeRawUnsafe('ALTER TABLE "StoreTransaction" ADD COLUMN "expenseCategoryId" TEXT');
    await db.$executeRawUnsafe('CREATE TABLE "ManagementExpenseCategory" (id TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,description TEXT NOT NULL,active BOOLEAN NOT NULL)');
    await db.$executeRaw`INSERT INTO "ManagementExpenseCategory" VALUES ('active','company','Synthetic supplies',true),('other-active','company','Synthetic transport',true),('inactive','company','Synthetic inactive',false),('foreign','foreign','Synthetic foreign',true)`;
    await db.$executeRaw`INSERT INTO "CashShiftSession" (id,"companyId","storeId","terminalPos","openedBy",status) VALUES ('shift','company','store','MAIN','operator','OPEN'),('control-shift','company','store','CONTROL','control','OPEN')`;
    await db.$executeRaw`INSERT INTO "StoreTransaction" (id,"companyId","storeId","sessionId",type,amount,"actorId","actorName") VALUES ('control-row','company','store','control-shift','OTHER_EXPENSE',7,'control','Synthetic control')`;
    const controlBefore=await db.$queryRaw`SELECT to_jsonb(t)::text AS value FROM "StoreTransaction" t WHERE id='control-row'`;
    const counts=async()=>{
      const rows=await db.$queryRaw`SELECT (SELECT count(*)::int FROM "StoreTransaction") AS payments,(SELECT count(*)::int FROM "OtherExpenseReview") AS reviews,(SELECT count(*)::int FROM "BankLedgerEntry") AS bank`;
      return rows[0];
    };
    const before=await counts();
    for(const expenseCategoryId of ['inactive','foreign','missing'])assert.equal((await run(request({expenseCategoryId}))).status,409);
    assert.deepEqual(await counts(),before);
    const firstRequest=request(),first=await run(firstRequest);
    assert.equal(first.status,201,first.data.error);assert.equal(first.data.expenseCategoryId,'active');assert.equal(first.data.amount,1.25);assert.equal(first.data.sessionId,'shift');
    const stored=await db.$queryRaw`SELECT "expenseCategoryId",amount,"actorId","sessionId" FROM "StoreTransaction" WHERE id=${first.data.id}`;
    assert.equal(stored[0].expenseCategoryId,'active');assert.equal(Number(stored[0].amount),1.25);assert.equal(stored[0].actorId,'operator');assert.equal(stored[0].sessionId,'shift');
    assert.equal((await run(firstRequest)).status,409);
    assert.equal((await run({...firstRequest,expenseCategoryId:'other-active'})).status,409);
    assert.equal((await db.$queryRaw`SELECT "expenseCategoryId" FROM "StoreTransaction" WHERE id=${first.data.id}`)[0].expenseCategoryId,'active');
    const concurrentRequest=request(),concurrent=await Promise.all([run(concurrentRequest),run(concurrentRequest)]);
    assert.deepEqual(concurrent.map(value=>value.status).sort(),[201,409]);
    const concurrentId=concurrent.find(value=>value.status===201).data.id;
    assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "StoreTransaction" WHERE id=${concurrentId}`)[0].n),1);
    assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "OtherExpenseReview" WHERE "transactionId"=${concurrentId}`)[0].n),1);

    const modernExternal=await run(request({paymentSource:'EXTERNAL',paymentMethod:'EMPLOYEE_REIMBURSEMENT'}));
    assert.equal(modernExternal.status,201,modernExternal.data.error);assert.equal(modernExternal.data.sessionId,null);assert.equal(modernExternal.data.expenseCategoryId,'active');
    const attachment={dataUrl:'data:image/png;base64,'+Buffer.alloc(160,3).toString('base64'),filename:'synthetic-proof.png'};
    for(const paymentSource of ['EXTERNAL','CASH_SHIFT']){
      const legacy=await run(request({evidenceMode:undefined,attachment,paymentSource,paymentMethod:paymentSource==='EXTERNAL'?'EMPLOYEE_REIMBURSEMENT':'CASH_SHIFT',idempotencyKey:crypto.randomUUID()}));
      assert.equal(legacy.status,201,legacy.data.error);assert.equal(legacy.data.expenseCategoryId,'active');assert.equal(legacy.data.sessionId,paymentSource==='EXTERNAL'?null:'shift');
    }
    const bank=await run(request({paymentSource:'EXTERNAL',paymentMethod:'BANK_TRANSFER'}));
    assert.equal(bank.status,201,bank.data.error);assert.equal(bank.data.expenseCategoryId,'active');
    const bankRows=await db.$queryRaw`SELECT amount,status FROM "BankLedgerEntry" WHERE "sourceTransactionId"=${bank.data.id}`;
    assert.equal(bankRows.length,1);assert.equal(Number(bankRows[0].amount),-1.25);assert.equal(bankRows[0].status,'PENDING_REVIEW');
    const refund=await run(request({amount:-1.25}));assert.equal(refund.status,201,refund.data.error);assert.equal(refund.data.amount,-1.25);assert.equal(refund.data.expenseCategoryId,'active');
    const uncategorized=await run(request({expenseCategoryId:undefined}));assert.equal(uncategorized.status,201,uncategorized.data.error);assert.equal(uncategorized.data.expenseCategoryId,null);
    const beforeRollback=await counts();denyBinding=true;
    const rollback=await run(request());denyBinding=false;
    assert.equal(rollback.status,409);assert.match(rollback.data.error,/δεν καταχωρίστηκε/);assert.deepEqual(await counts(),beforeRollback);

    let lockReached,releaseLock;const reached=new Promise(resolve=>lockReached=resolve),release=new Promise(resolve=>releaseLock=resolve);
    afterCategoryLock=async()=>{lockReached();await release};
    const racing=run(request());
    let deadline;
    try{await Promise.race([reached,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Category lock was not reached within five seconds')),5000)})])}finally{clearTimeout(deadline)}
    try{
      await assert.rejects(other.$transaction(async tx=>{
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='100ms'");
        await tx.$executeRaw`UPDATE "ManagementExpenseCategory" SET active=false WHERE id='active'`;
      }),error=>error?.meta?.code==='55P03'||/lock timeout/i.test(error?.message||''));
    }finally{afterCategoryLock=null;releaseLock()}
    const lockedExpense=await racing;assert.equal(lockedExpense.status,201,lockedExpense.data.error);assert.equal(lockedExpense.data.expenseCategoryId,'active');
    await other.$executeRaw`UPDATE "ManagementExpenseCategory" SET active=false WHERE id='active'`;
    const afterDeactivation=await counts();assert.equal((await run(request())).status,409);assert.deepEqual(await counts(),afterDeactivation);
    assert.equal((await db.$queryRaw`SELECT "expenseCategoryId" FROM "StoreTransaction" WHERE id=${lockedExpense.data.id}`)[0].expenseCategoryId,'active');
    assert.deepEqual(await db.$queryRaw`SELECT to_jsonb(t)::text AS value FROM "StoreTransaction" t WHERE id='control-row'`,controlBefore);
    const reviews=await db.$queryRaw`SELECT status FROM "OtherExpenseReview" WHERE "transactionId"=${first.data.id}`;
    assert.equal(reviews.length,1);assert.equal(reviews[0].status,'PENDING_REVIEW');
    assert.equal((await counts()).payments,10);assert.equal((await counts()).reviews,9);assert.equal((await counts()).bank,1);
  }finally{
    await other.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();
  }
});
