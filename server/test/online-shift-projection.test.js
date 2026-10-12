import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const route=await readFile(new URL('../src/routes/store-pos-sale-display.js',import.meta.url),'utf8');
const start=route.indexOf('router.get("/stores/:storeId/sales/recent",'),source=route.slice(start,route.indexOf('\nrouter.get("/sales/journal"',start));
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
function handler(db){let fn;vm.runInNewContext(source,{router:{get(_,f){fn=f}},ownedStore:async(req,id)=>{if(id!==req.user.storeId)throw Object.assign(Error('foreign store'),{status:403});return{id}},prisma:db,normalizeSale:r=>r});return fn}
async function read(fn,query={},patch={}){let body,error,status;await fn({params:{storeId:'A'},query,user:{companyId:'C',storeId:'A',employeeId:'employee',terminalPos:'ONLINE',tokenType:'STORE_OPERATOR',permissions:['SHIFT_TRANSACTIONS','RETURN_ITEMS'],...patch}},{status(n){status=n;return this},json(x){body=x}},e=>error=e);if(error)throw error;return{body,status}}
test('recent online shift read rejects revoked rights before reading sale data',async()=>{let reads=0;const fn=handler({$queryRaw:async()=>{reads++;return[]}});assert.equal((await read(fn,{view:'SHIFT'},{permissions:[]})).status,403);assert.equal(reads,0)});
test('native actual recent-sale query projects original online sale, mixed ledger IDs and category without cross-session or tenant joins',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='online_projection_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Sale"("id" text,"companyId" text,"storeId" text,"operatorEmployeeId" text,"receiptNumber" text,"total" numeric DEFAULT 1.4,"subtotal" numeric DEFAULT 1.4,"discount" numeric DEFAULT 0,"audience" text,"occurredAt" timestamp DEFAULT NOW(),"createdAt" timestamp DEFAULT NOW(),"transactionMode" text,"delayedReason" text,"reversalState" text,"reversalKind" text,"originalSaleId" text,"fiscalStatus" text,"source" text,"status" text,"customerId" text,"operationChannel" text)',
   'CREATE TABLE "StoreTransaction"("id" text,"companyId" text,"storeId" text,"sessionId" text,"description" text,"actorName" text,"occurredAt" timestamp DEFAULT NOW(),"type" text)',
   'CREATE TABLE "CashShiftSession"("id" text,"companyId" text,"storeId" text,"terminalPos" text,"status" text)',
   'CREATE TABLE "StoreOperatorAudit"("id" text,"companyId" text,"storeId" text,"eventType" text,"details" jsonb,"createdAt" timestamp DEFAULT NOW())',
   'CREATE TABLE "Payment"("id" text,"saleId" text,"method" text,"amount" numeric,"createdAt" timestamp DEFAULT NOW())',
   'CREATE TABLE "SaleLine"("id" text,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"lineTotal" numeric,"createdAt" timestamp DEFAULT NOW())',
   'CREATE TABLE "Product"("id" text,"companyId" text,"categoryId" text)',
   'CREATE TABLE "ProductCategory"("id" text,"companyId" text,"name" text)',
   'CREATE TABLE "Customer"("id" text,"companyId" text,"name" text)',
   `INSERT INTO "CashShiftSession" VALUES('online','C','A','ONLINE','OPEN'),('main','C','A','MAIN','OPEN'),('closed','C','A','ONLINE','CLOSED'),('foreign','D','B','ONLINE','OPEN')`,
   `INSERT INTO "Product" VALUES('pastry','C','cat')`, `INSERT INTO "ProductCategory" VALUES('cat','C','ΣΦΟΛΙΑΤΕΣ')`
  ])await db.$executeRawUnsafe(sql);
  for(const [id,company,store,employee,session,status] of [['online-sale','C','A','employee','online','COMPLETED'],['main-sale','C','A','employee','main','COMPLETED'],['closed-sale','C','A','employee','closed','COMPLETED'],['other-actor','C','A','other','online','COMPLETED'],['foreign-sale','D','B','employee','foreign','COMPLETED'],['unpaid','C','A','employee','online','OPEN']]){
   await db.$executeRaw`INSERT INTO "Sale"("id","companyId","storeId","operatorEmployeeId","source","status","fiscalStatus") VALUES(${id},${company},${store},${employee},'ONLINE_POS',${status},'NON_FISCAL')`;
   await db.$executeRaw`INSERT INTO "StoreOperatorAudit"("id","companyId","storeId","eventType","details") VALUES(${id},${company},${store},'POS_SALE_COMPLETED',${JSON.stringify({saleId:id,sessionId:session,onlineOrderNumber:id==='online-sale'?'ONL-003':id})}::jsonb)`;
   await db.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","description","actorName","type") VALUES(${id+'-cash'},${company},${store},${session},${'ONLINE ΠΑΡΑΓΓΕΛΙΑ '+(id==='online-sale'?'ONL-003':id)+' · ΜΕΤΡΗΤΑ'},'STAFF','SALE_CASH')`;
  }
  await db.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","description","type") VALUES('online-card','C','A','online','ONLINE ΠΑΡΑΓΓΕΛΙΑ ONL-003 · ΚΑΡΤΑ','SALE_CARD'),('prefix-collision','C','A','online','ONLINE ΠΑΡΑΓΓΕΛΙΑ ONL-0030 · ΚΑΡΤΑ','SALE_CARD'),('foreign-description','D','B','foreign','ONLINE ΠΑΡΑΓΓΕΛΙΑ ONL-003 · ΚΑΡΤΑ','SALE_CARD')`;
  await db.$executeRaw`INSERT INTO "Payment"("id","saleId","method","amount") VALUES('cash','online-sale','CASH',1),('card','online-sale','CARD',.4)`;
  await db.$executeRaw`INSERT INTO "SaleLine"("id","saleId","productId","description","quantity","unitPrice","lineTotal") VALUES('line','online-sale','pastry','ΤΥΡΟΠΙΤΑ',1,1.4,1.4)`;
  const fn=handler(db),own=(await read(fn,{view:'SHIFT'})).body.rows;
  assert.deepEqual(own.map(r=>r.id),['online-sale']);assert.equal(own[0].sessionId,'online');assert.deepEqual(own[0].shiftTransactionIds,['online-card','online-sale-cash']);assert.equal(own[0].lines[0].categoryName,'ΣΦΟΛΙΑΤΕΣ');assert.equal(own[0].payments.length,2);
  assert.deepEqual((await read(fn,{view:'SHIFT'},{permissions:['SHIFT_TRANSACTIONS','STORE_LEDGER_REVIEW']})).body.rows.map(r=>r.id).sort(),['online-sale','other-actor']);
  assert.deepEqual((await read(fn,{view:'SHIFT'},{terminalPos:'MAIN'})).body.rows.map(r=>r.id),['main-sale']);
  const history=(await read(fn,{})).body.rows;assert.ok(history.some(r=>r.id==='closed-sale'));assert.ok(!history.some(r=>r.id==='foreign-sale'||r.id==='unpaid'));
  await db.$executeRaw`DELETE FROM "StoreOperatorAudit" WHERE "id"='online-sale'`;
  assert.deepEqual((await read(fn,{view:'SHIFT'})).body.rows,[]);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});

test('mounted actual shift center counts online mixed sale once, shows category and rejects closed/foreign sessions',async()=>{
 const {build}=await import('esbuild'),{JSDOM}=await import('jsdom'),{createRequire}=await import('node:module'),{fileURLToPath}=await import('node:url');
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreTransactionsPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}}),m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));let rows=[{id:'online-sale',source:'ONLINE_POS',sessionId:'online',total:1.4,occurredAt:'2026-10-12T16:19:32Z',payments:[{method:'CASH',amount:1},{method:'CARD',amount:.4}],shiftTransactionIds:['cash','card'],lines:[{id:'pastry',description:'ΤΥΡΟΠΙΤΑ',quantity:1,lineTotal:1.4,categoryName:'ΣΦΟΛΙΑΤΕΣ'}]},{id:'old',sessionId:'closed',total:999},{id:'foreign',sessionId:'foreign',total:999}];
 const api=async path=>path.includes('/sales/recent')?{rows}:path.includes('/cash/')?{store:{id:'A'}}:{store:{id:'A'},openSessions:[{id:'online',terminalPos:'ONLINE',openingOperational:10},{id:'main',terminalPos:'MAIN',openingOperational:20}],summaryBySession:{online:{cashSales:1,cardSales:.4,irisSales:0,expensesTotal:0,transferIn:0,transferOut:0},main:{cashSales:0,cardSales:0,irisSales:0,expensesTotal:0,transferIn:0,transferOut:0}},recent:[{id:'cash',sessionId:'online',type:'SALE_CASH',amount:1,description:'ONLINE ΠΑΡΑΓΓΕΛΙΑ ONL-003 · ΜΕΤΡΗΤΑ'},{id:'card',sessionId:'online',type:'SALE_CARD',amount:.4,description:'ONLINE ΠΑΡΑΓΓΕΛΙΑ ONL-003 · ΚΑΡΤΑ'},{id:'foreign-tx',sessionId:'foreign',type:'SALE_CASH',amount:999,description:'ONLINE ΠΑΡΑΓΓΕΛΙΑ ONL-003 · ΜΕΤΡΗΤΑ'}]};
 try{
  await act(async()=>root.render(React.createElement(m.exports.default,{api,store:{id:'A'}})));
  let cards=[...document.querySelectorAll('.active-shift-card')];assert.equal(cards[0].querySelectorAll('strong')[3].textContent,'1');assert.equal(cards[1].querySelectorAll('strong')[3].textContent,'0');assert.equal(document.querySelectorAll('.active-movement-table .row').length,1);assert.match(document.querySelector('.category-actions').textContent,/ΣΦΟΛΙΑΤΕΣ.*1 τεμ/);
  await act(async()=>document.querySelector('.shift-category-row').click());assert.match(document.querySelector('.category-detail').textContent,/ΤΥΡΟΠΙΤΑ/);
  await act(async()=>cards[1].click());assert.equal(document.querySelector('.category-actions'),null);assert.equal(document.querySelectorAll('.active-movement-table .row').length,0);
  // Legacy/capped fallback must recognize the Greek word ending. It remains separate from canonical-sale deduplication.
  rows=[];await act(async()=>window.dispatchEvent(new Event('focus')));
  assert.equal(document.querySelector('.active-shift-card').querySelectorAll('strong')[3].textContent,'2');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of old){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
