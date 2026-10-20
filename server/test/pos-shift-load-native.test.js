import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../src/routes/store-pos-sale-display.js',import.meta.url),'utf8');
function registered(db){const routes=new Map(),Router=()=>({get:(p,...h)=>routes.set(p,h.at(-1)),post(){},use(){}});new Function('Router','prisma','crypto','executeHotTableBootstrap',source.replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,''))(Router,db,crypto,async()=>{});return (user,query={view:'SHIFT'},storeId='store')=>new Promise(resolve=>{let status=200;routes.get('/stores/:storeId/sales/recent')({user,query,params:{storeId}}, {status(n){status=n;return this},json(data){resolve({status,data})}},error=>resolve({status:error.status||500,error}));});}
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const user={id:'operator',employeeId:'employee',companyId:'company',storeId:'store',tokenType:'STORE_OPERATOR',terminalPos:'MAIN',permissions:['SHIFT_TRANSACTIONS']};
test('shift handler preserves missing transaction permission and foreign-store refusal',async()=>{const db={store:{findFirst:async()=>({id:'store',name:'Virtual'})}};const get=registered(db);assert.equal((await get({...user,permissions:[]})).status,403);assert.equal((await get(user,{view:'SHIFT'},'foreign-store')).status,403)});
test('native registered SHIFT lookup materializes exact open ledger once; own/all/online/old/foreign isolation and normal history remain intact',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='shift_load_'+crypto.randomBytes(6).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',name);await admin.$executeRawUnsafe(`CREATE SCHEMA "${name}"`);const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 try{
  for(const sql of [
   'CREATE TABLE "Store"(id text primary key,"companyId" text,name text,active boolean)',
   'CREATE TABLE "CashShiftSession"(id text primary key,"companyId" text,"storeId" text,"terminalPos" text,status text)',
   'CREATE TABLE "Sale"(id text primary key,"companyId" text,"storeId" text,"operatorEmployeeId" text,"receiptNumber" text,total numeric,subtotal numeric,discount numeric,audience text,"occurredAt" timestamptz,"createdAt" timestamptz,"transactionMode" text,"delayedReason" text,"reversalState" text,"reversalKind" text,"originalSaleId" text,"fiscalStatus" text,source text,"operationChannel" text,"customerId" text,status text)',
   'CREATE TABLE "StoreTransaction"(id text primary key,"companyId" text,"storeId" text,"sessionId" text,description text,"actorName" text,"occurredAt" timestamptz,type text)',
   'CREATE TABLE "StoreOperatorAudit"(id text primary key,"companyId" text,"storeId" text,"eventType" text,details jsonb,"createdAt" timestamptz)',
   'CREATE TABLE "Customer"(id text primary key,"companyId" text,name text)',
   'CREATE TABLE "Payment"(id text primary key,"saleId" text,method text,amount numeric,"createdAt" timestamptz)',
   'CREATE TABLE "SaleLine"(id text primary key,"saleId" text,"productId" text,description text,quantity numeric,"unitPrice" numeric,"lineTotal" numeric,"createdAt" timestamptz)',
   'CREATE TABLE "Product"(id text primary key,"companyId" text,"categoryId" text)',
   'CREATE TABLE "ProductCategory"(id text primary key,name text)'])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','company','Virtual Store',true)`;
  await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES ('open','company','store','MAIN','OPEN'),('old','company','store','MAIN','CLOSED'),('other-terminal','company','store','SECOND','OPEN'),('other-store','company','store-other','MAIN','OPEN'),('foreign','foreign','store','MAIN','OPEN')`;
  for(const [id,employee,company,store,session,kind] of [['sale-own-x','employee','company','store','open','POS'],['sale-colleague-x','colleague','company','store','open','POS'],['sale-online-x','employee','company','store','open','ONLINE_POS'],['sale-closed-x','employee','company','store','old','POS'],['sale-second-x','employee','company','store','other-terminal','POS'],['sale-otherstore-x','employee','company','store-other','other-store','POS'],['sale-foreign-x','employee','foreign','store','foreign','POS']]){
   await db.$executeRaw`INSERT INTO "Sale" (id,"companyId","storeId","operatorEmployeeId",total,subtotal,discount,"occurredAt","createdAt",source,status,"fiscalStatus") VALUES (${id},${company},${store},${employee},2.20,2.20,0,'2020-01-01','2026-10-20',${kind},'COMPLETED','NON_FISCAL')`;
   const description=kind==='ONLINE_POS'?'ONLINE ΠΑΡΑΓΓΕΛΙΑ VIRTUAL-42 · ΜΕΤΡΗΤΑ':'POS '+id;
   await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES (${id+'-tx'},${company},${store},${session},${description},'Virtual Operator','2026-10-20','SALE_CASH')`;
  }
  await db.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES ('online-audit','company','store','POS_SALE_COMPLETED','{"saleId":"sale-online-x","sessionId":"open","onlineOrderNumber":"VIRTUAL-42"}'::jsonb,'2026-10-20')`;
  await db.$executeRaw`INSERT INTO "Payment" VALUES ('payment','sale-own-x','CASH',2.20,'2026-10-20')`;
  await db.$executeRaw`INSERT INTO "SaleLine" VALUES ('line','sale-own-x',NULL,'Virtual product',1,2.20,2.20,'2026-10-20')`;
  const before=await db.$queryRaw`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) AS hash FROM "StoreTransaction" t`;
  let statement,values;const wrapped={store:db.store,$queryRaw:async(strings,...v)=>{if(strings.join('').includes('active_shift_ledger')){statement=strings.reduce((s,p,i)=>s+p+(i<v.length?'$'+(i+1):''),'');values=v}return db.$queryRaw(strings,...v)}};const get=registered(wrapped);
  const own=await get(user);assert.equal(own.status,200,own.error?.message);assert.deepEqual(own.data.rows.map(r=>r.id).sort(),['sale-online-x','sale-own-x']);assert.ok(own.data.rows.every(r=>r.sessionId==='open'));assert.equal(own.data.rows.find(r=>r.id==='sale-own-x').payments[0].amount,2.20);assert.equal(own.data.rows.find(r=>r.id==='sale-own-x').lines[0].description,'Virtual product');assert.deepEqual(own.data.rows.find(r=>r.id==='sale-online-x').shiftTransactionIds,['sale-online-x-tx']);
  const plan=await db.$queryRawUnsafe('EXPLAIN (ANALYZE,FORMAT JSON) '+statement,...values);const serialized=JSON.stringify(plan);assert.match(serialized,/CTE active_shift_ledger/);assert.match(serialized,/CTE Scan/);
  const all=await get({...user,permissions:[...user.permissions,'STORE_LEDGER_REVIEW']});assert.equal(all.status,200);assert.deepEqual(all.data.rows.map(r=>r.id).sort(),['sale-colleague-x','sale-online-x','sale-own-x']);
  const other=await get({...user,terminalPos:'SECOND',permissions:[...user.permissions,'STORE_LEDGER_REVIEW']});assert.deepEqual(other.data.rows.map(r=>r.id),['sale-second-x']);
  const history=await get(user,{});assert.equal(history.status,200);assert.ok(history.data.rows.some(r=>r.id==='sale-closed-x'));assert.ok(!history.data.rows.some(r=>r.id==='sale-foreign-x'||r.id==='sale-otherstore-x'));
  const noOpen=await get({...user,terminalPos:'EMPTY'});assert.deepEqual(noOpen.data.rows,[]);
  assert.deepEqual(await db.$queryRaw`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) AS hash FROM "StoreTransaction" t`,before);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);await admin.$disconnect()}
});
