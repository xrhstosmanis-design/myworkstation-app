import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import vm from 'node:vm';

// Frozen verbatim from owner-shifts.js at be1be1d57932606ff1c8a46dfd61a7b0b19f32c4.
// This is the original correlated SQL, never derived from the new implementation.
const ORIGINAL_SELECTION="    const selectedSales=await prisma.$queryRaw`\n      SELECT s.\"id\" FROM \"Sale\" s\n      WHERE s.\"companyId\"=${companyId} AND s.\"storeId\"=${shift.storeId} AND s.\"status\"='COMPLETED'\n        AND EXISTS (\n          SELECT 1 FROM (\n            SELECT t.\"sessionId\" FROM \"StoreTransaction\" t\n            JOIN \"CashShiftSession\" sh ON sh.\"id\"=t.\"sessionId\" AND sh.\"companyId\"=s.\"companyId\" AND sh.\"storeId\"=s.\"storeId\"\n            WHERE t.\"companyId\"=s.\"companyId\" AND t.\"storeId\"=s.\"storeId\"\n              AND s.\"id\"=ANY(regexp_split_to_array(COALESCE(t.\"description\",''),'[^[:alnum:]_-]+'))\n              AND COALESCE(t.\"description\",'') NOT LIKE ('%αρχική '||s.\"id\"||'%')\n              AND COALESCE(t.\"description\",'') NOT LIKE ('%αρχική πώληση '||s.\"id\"||'%')\n            UNION\n            SELECT a.\"details\"->>'sessionId' FROM \"StoreOperatorAudit\" a\n            JOIN \"CashShiftSession\" sh ON sh.\"id\"=a.\"details\"->>'sessionId' AND sh.\"companyId\"=s.\"companyId\" AND sh.\"storeId\"=s.\"storeId\"\n            WHERE a.\"companyId\"=s.\"companyId\" AND a.\"storeId\"=s.\"storeId\" AND a.\"eventType\"='POS_SALE_COMPLETED' AND a.\"details\"->>'saleId'=s.\"id\"\n          ) evidence\n          HAVING COUNT(DISTINCT evidence.\"sessionId\")=1 AND MIN(evidence.\"sessionId\")=${shift.id}\n        )\n    `;\n";
const ORIGINAL_SELECTION_SHA256="e6b2e20d62a379231031b682362c9b9d41f94a8e712d32135385168546ffdac6";
const OUTSIDE_SELECTION_SHA256="22478ad339dae46c97e5f76e1c0b35fe9f829e3cf01f81e4d77d7e8b60fc2a86";
const route=await readFile(new URL('../src/routes/owner-shifts.js',import.meta.url),'utf8');
const a=route.indexOf('    const selectedSales=await prisma.$queryRaw`'),b=route.indexOf('    const saleIds=',a);
const candidate=route.slice(a,b);
const sha=s=>createHash('sha256').update(s).digest('hex');
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const json=v=>JSON.parse(JSON.stringify(v));
function selection(db,text,sessionId='online',companyId='C',storeId='A'){
 const fn=vm.runInNewContext('(async function(prisma,companyId,shift){'+text+'return selectedSales;})');
 return fn(db,companyId,{id:sessionId,storeId});
}
function detail(db,text,sessionId='online',companyId='C'){
 const modified=route.slice(0,a)+text+route.slice(b),start=modified.indexOf('router.get("/:sessionId/detail",');
 const source=modified.slice(start,modified.indexOf('\nrouter.post(',start));
 const normalizers=modified.slice(modified.indexOf('const n=value=>'),modified.indexOf('let schemaPromise;'));
 let fn;vm.runInNewContext(normalizers+source,{router:{get(_,f){fn=f}},prisma:db,ensureSchema:async()=>{}});
 return (async()=>{let body,status,error;await fn({params:{sessionId},user:{companyId}},{status(v){status=v;return this},json(v){body=v}},e=>error=e);if(error)throw error;return json({body,status});})();
}
function boundQuery(text,sessionId='online'){
 let result;selection({$queryRaw(strings,...values){result={sql:strings.reduce((s,part,i)=>s+(i?'$'+i:'')+part,''),values};return[]}},text,sessionId);
 return result;
}
const ids=rows=>Array.from(rows,r=>r.id).sort();
const tables=['Store','CashShiftSession','Sale','StoreOperatorAudit','StoreTransaction','SaleLine','Product','ProductCategory','Payment'];
async function digest(db){const out={};for(const name of tables){const rows=await db.$queryRawUnsafe(`SELECT md5(COALESCE(string_agg(j::text,',' ORDER BY j::text),'')) AS hash FROM (SELECT to_jsonb(t) j FROM "${name}" t) x`);out[name]=rows[0].hash;}return out;}
test('owner shift optimization changes only the approved selected-sales read and freezes original SQL',()=>{
 assert.equal(sha(ORIGINAL_SELECTION),ORIGINAL_SELECTION_SHA256);
 assert.equal(sha(route.slice(0,a)+route.slice(b)),OUTSIDE_SELECTION_SHA256);
 assert.notEqual(candidate,ORIGINAL_SELECTION);
});
test('native original/candidate selected identity, complete detail, immutable sources and set-based work',{skip:!isolated()},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='owner_reader_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Store"("id" text,"companyId" text,"name" text)',
   'CREATE TABLE "CashShiftSession"("id" text,"companyId" text,"storeId" text,"openedAt" timestamptz,"closedAt" timestamptz,"status" text,"cashSales" numeric DEFAULT 0,"cardSales" numeric DEFAULT 0,"openingOperational" numeric DEFAULT 0,"actualOperational" numeric DEFAULT 0,"variance" numeric DEFAULT 0)',
   'CREATE TABLE "Sale"("id" text,"companyId" text,"storeId" text,"status" text,"source" text,"total" numeric,"occurredAt" timestamptz)',
   'CREATE TABLE "StoreOperatorAudit"("id" text,"companyId" text,"storeId" text,"eventType" text,"details" jsonb)',
   'CREATE TABLE "StoreTransaction"("id" text,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"supplierId" text,"supplierName" text,"subtractFromShift" boolean DEFAULT false,"actorId" text,"actorName" text,"occurredAt" timestamptz DEFAULT NOW(),"createdAt" timestamptz DEFAULT NOW(),"reversedAt" timestamptz,"reversedBy" text,"reversedByName" text,"reversalReason" text,"sourceType" text,"attachmentData" text,"attachmentFilename" text)',
   'CREATE TABLE "SaleLine"("id" text,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"lineTotal" numeric,"createdAt" timestamptz DEFAULT NOW())',
   'CREATE TABLE "Product"("id" text,"companyId" text,"categoryId" text)',
   'CREATE TABLE "ProductCategory"("id" text,"companyId" text,"name" text)',
   'CREATE TABLE "Payment"("id" text,"saleId" text,"method" text,"amount" numeric)',
   `INSERT INTO "Store" VALUES('A','C','LAB'),('B','C','CONTROL'),('D','D','FOREIGN')`,
   `INSERT INTO "CashShiftSession"("id","companyId","storeId","openedAt","closedAt","status","cashSales") VALUES('online','C','A','2026-10-11','2026-10-13','CLOSED',1.4),('main','C','A','2026-10-11','2026-10-13','CLOSED',2.2),('other-store','C','B','2026-10-11','2026-10-13','CLOSED',0),('foreign','D','D','2026-10-11','2026-10-13','CLOSED',0)`,
   `INSERT INTO "Product" VALUES('pastry','C','cat')`, `INSERT INTO "ProductCategory" VALUES('cat','C','ΣΦΟΛΙΑΤΕΣ')`
  ])await db.$executeRawUnsafe(sql);

  const expected=[];
  async function sale(id,{session='online',kind='ledger',company='C',store='A',status='COMPLETED',total=1,description=id,occurredAt='2000-01-01T00:00:00Z'}={}){
   await db.$executeRaw`INSERT INTO "Sale" VALUES(${id},${company},${store},${status},'POS',${total},${new Date(occurredAt)})`;
   await db.$executeRaw`INSERT INTO "SaleLine"("id","saleId","productId","description","quantity","unitPrice","lineTotal") VALUES(${id},${id},'pastry','Synthetic',1,${total},${total})`;
   await db.$executeRaw`INSERT INTO "Payment" VALUES(${id},${id},'CASH',${total})`;
   if(kind==='ledger'||kind==='both')await ledger(id,session,description,company,store);
   if(kind==='audit'||kind==='both')await audit(id,session,id,company,store);
  }
  async function ledger(id,session,description,company='C',store='A'){
   await db.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","type","amount","description") VALUES(${randomUUID()},${company},${store},${session},'SALE_CASH',1,${description})`;
  }
  async function audit(id,session,saleId,company='C',store='A',event='POS_SALE_COMPLETED'){
   await db.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES(${randomUUID()},${company},${store},${event},${JSON.stringify({saleId,sessionId:session})}::jsonb)`;
  }
  for(const id of ['legacy-sale','audit-only','mixed-sale','negative-return','punct.audit','wild_card','percent%id','']){
   await sale(id,{kind:['audit-only','punct.audit','percent%id'].includes(id)?'audit':id==='mixed-sale'?'both':'ledger',total:id==='negative-return'?-4:2});expected.push(id);
  }
  await ledger('mixed-sale','online','mixed-sale · CASH');
  await ledger('mixed-sale','online','mixed-sale · CARD');
  await audit('mixed-sale','online','mixed-sale');
  await db.$executeRaw`INSERT INTO "Payment" VALUES('mixed-extra','mixed-sale','CARD',.5)`;
  await sale('original-sale',{session:'main'});
  await ledger('return','online','ΟΛΙΚΗ ΕΠΙΣΤΡΟΦΗ · αρχική original-sale · επιστροφή negative-return');
  await ledger('return2','online','ΜΕΡΙΚΗ ΕΠΙΣΤΡΟΦΗ · αρχική πώληση original-sale · επιστροφή negative-return');
  await sale('conflict',{kind:'ledger'});await audit('conflict','main','conflict');
  await sale('conflict-ledger',{kind:'ledger'});await ledger('conflict-ledger','main','conflict-ledger');
  await sale('missing',{kind:'none'});
  await sale('prefix',{description:'prefix-extra'});
  await sale('punct.id',{description:'punct.id'});
  await sale('null-description',{description:null});
  await sale('open-sale',{status:'OPEN'});
  await sale('wrong-event',{kind:'none'});await audit('wrong-event','online','wrong-event','C','A','OTHER');
  await sale('missing-session',{session:'absent'});
  await sale('foreign-session',{session:'foreign'});
  await sale('foreign-company',{company:'D',store:'D',session:'foreign'});
  await sale('foreign-store',{store:'B',session:'other-store'});
  await sale('foreign-evidence',{kind:'none'});await audit('foreign-evidence','online','foreign-evidence','D','A');
  await ledger('foreign-evidence','online','foreign-evidence','C','B');
  await sale('malformed-audit',{kind:'none'});
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" VALUES('null','C','A','POS_SALE_COMPLETED',NULL),('number','C','A','POS_SALE_COMPLETED','42'),('array','C','A','POS_SALE_COMPLETED','[]'),('missing','C','A','POS_SALE_COMPLETED','{"saleId":"malformed-audit"}')`);
  // The original LIKE predicate treats underscore as a wildcard; retain that exact behavior.
  await sale('wild_x',{description:'wild_x · αρχική wildAx'});
  const before=await digest(db);
  await t.test('exact original identity including empty, old, mixed, negative, wildcard and foreign evidence',async()=>{
   const old=await selection(db,ORIGINAL_SELECTION),next=await selection(db,candidate);
   assert.deepEqual(ids(old),expected.sort());assert.deepEqual(ids(next),ids(old));
   for(const session of ['main','other-store','absent','foreign'])assert.deepEqual(ids(await selection(db,candidate,session)),ids(await selection(db,ORIGINAL_SELECTION,session)));
   assert.deepEqual(ids(await selection(db,candidate,'foreign','D','D')),ids(await selection(db,ORIGINAL_SELECTION,'foreign','D','D')));
  });
  await t.test('complete actual handler output equals frozen original for each original/control/foreign session',async()=>{
   for(const session of ['online','main','other-store','foreign','absent'])assert.deepEqual(await detail(db,candidate,session),await detail(db,ORIGINAL_SELECTION,session));
   assert.deepEqual(await detail(db,candidate,'foreign','D'),await detail(db,ORIGINAL_SELECTION,'foreign','D'));
  });
  assert.deepEqual(await digest(db),before,'read paths must not change any source row');
  await t.test('synthetic scale tokenization executes once per scoped ledger row, not once per sale',async()=>{
   for(let i=0;i<120;i++)await sale('scale-'+i,{total:i+10});
   const baseline=await digest(db);
   for(const table of ['Sale','CashShiftSession','StoreTransaction','StoreOperatorAudit'])await db.$executeRawUnsafe(`ANALYZE "${table}"`);
   const old=boundQuery(ORIGINAL_SELECTION),next=boundQuery(candidate);
   const plan=await db.$queryRawUnsafe('EXPLAIN (ANALYZE,FORMAT JSON) '+next.sql,...next.values);
   const root=plan[0]['QUERY PLAN'][0].Plan,nodes=[];
   function walk(node){nodes.push(node);for(const child of node.Plans||[])walk(child);}walk(root);
   const materialized=nodes.find(node=>node['Subplan Name']==='CTE ledger_tokens');
   assert.ok(materialized,'scoped token expansion has an explicit materialization boundary');
   assert.equal(materialized['Actual Loops'],1);
   assert.equal(nodes.some(node=>node['Parent Relationship']==='SubPlan'),false,'no correlated per-sale evidence subplan');
   const oldPlan=await db.$queryRawUnsafe('EXPLAIN (ANALYZE,FORMAT JSON) '+old.sql,...old.values);
   const oldNodes=[];function oldWalk(node){oldNodes.push(node);for(const child of node.Plans||[])oldWalk(child);}oldWalk(oldPlan[0]['QUERY PLAN'][0].Plan);
   assert.ok(oldNodes.some(node=>node['Parent Relationship']==='SubPlan'&&node['Actual Loops']>=120),'frozen query reproduces repeated per-sale evidence work');
   assert.deepEqual(ids(await selection(db,candidate)),ids(await selection(db,ORIGINAL_SELECTION)));
   assert.deepEqual(await detail(db,candidate),await detail(db,ORIGINAL_SELECTION));
   assert.deepEqual(await digest(db),baseline);
   t.diagnostic(JSON.stringify({syntheticOnly:true,ledgerMaterializationLoops:materialized['Actual Loops'],originalCorrelatedLoops:Math.max(...oldNodes.filter(n=>n['Parent Relationship']==='SubPlan').map(n=>n['Actual Loops'])),originalMs:oldPlan[0]['QUERY PLAN'][0]['Execution Time'],candidateMs:plan[0]['QUERY PLAN'][0]['Execution Time']}));
  });
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
