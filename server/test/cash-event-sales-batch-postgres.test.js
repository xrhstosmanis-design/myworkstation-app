import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {readCashEventSales} from '../src/services/cash-event-sales-source.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
// Frozen pre-batch native query: compare original projection, ordering and
// actor/session ambiguity, not a JavaScript imitation of PostgreSQL semantics.
async function legacySales(db,scope,session){
 const openedAt=new Date(session.openedAt),closedAt=new Date(session.closedAt);
 const sales=await db.$queryRaw`
  SELECT s."id" AS "saleId",s."companyId",s."storeId",s."status",s."source",s."receiptNumber",s."occurredAt",s."total",link."sessionId",link."actorId",link."actorName",TRUE AS "linked",
   (SELECT jsonb_agg(jsonb_build_object('lineId',l."id",'productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'discount',l."discount",'lineTotal',l."lineTotal",'promotionId',to_jsonb(l)->>'promotionId','promotionType',to_jsonb(l)->>'promotionType') ORDER BY l."id")
    FROM (SELECT * FROM "SaleLine" sl WHERE sl."saleId"=s."id" ORDER BY sl."id" LIMIT 1001) l) AS "lines",
   (SELECT jsonb_agg(jsonb_build_object('eventId',a."id",'items',a."details"->'items') ORDER BY a."id") FROM (SELECT * FROM "StoreOperatorAudit" raw WHERE raw."companyId"=${scope.companyId} AND raw."storeId"=${scope.storeId} AND raw."eventType"='POS_SALE_COMPLETED' AND raw."details"->>'saleId'=s."id" AND raw."details"->>'sessionId'=${session.id} ORDER BY raw."id" LIMIT 1001) a
    WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId} AND a."eventType"='POS_SALE_COMPLETED' AND a."details"->>'saleId'=s."id" AND a."details"->>'sessionId'=${session.id}) AS "completions"
  FROM "Sale" s JOIN LATERAL (
   SELECT MIN(t."sessionId") AS "sessionId",CASE WHEN COUNT(DISTINCT t."actorId")=1 THEN MIN(t."actorId") END AS "actorId",CASE WHEN COUNT(DISTINCT t."actorName")=1 THEN MIN(t."actorName") END AS "actorName"
   FROM (
    SELECT t."sessionId",t."actorId",t."actorName" FROM "StoreTransaction" t WHERE t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId}
     AND t."type" IN ('SALE_CASH','SALE_CARD','SALE_IRIS','SALE_CREDIT') AND t."reversedAt" IS NULL AND t."description" LIKE ('POS πώληση ' || s."id" || ' ·%')
    UNION ALL
    SELECT a."details"->>'sessionId',a."actorId",COALESCE(to_jsonb(a)->>'actorName',a."details"->>'actorName') FROM "StoreOperatorAudit" a
     WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId} AND a."eventType"='POS_SALE_COMPLETED' AND a."details"->>'saleId'=s."id"
   ) t
   HAVING COUNT(*)>0 AND COUNT(DISTINCT t."sessionId")=1 AND MIN(t."sessionId")=${session.id}
  ) link ON TRUE
  WHERE s."companyId"=${scope.companyId} AND s."storeId"=${scope.storeId} AND s."status"='COMPLETED' AND s."source"='POS'
   AND s."occurredAt">=${openedAt} AND s."occurredAt"<=${closedAt}
  ORDER BY s."occurredAt",s."id" LIMIT 2001`;
 return sales;
}
const scope={companyId:'co',storeId:'store'},session={...scope,id:'shift',status:'CLOSED',openedAt:'2026-10-22T12:00:00Z',closedAt:'2026-10-22T20:00:00Z'};
test('native batching preserves exact legacy identities, completions and evidence hash while base source scans execute once',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_batch_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Sale"("id" text primary key,"companyId" text,"storeId" text,"status" text,"source" text,"receiptNumber" text,"occurredAt" timestamptz,"total" numeric)',
   'CREATE TABLE "SaleLine"("id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text)',
   'CREATE INDEX ON "SaleLine"("saleId")',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"actorId" text,"actorName" text,"reversedAt" timestamptz)',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"eventType" text,"actorId" text,"details" jsonb,"createdAt" timestamptz)',
   'CREATE TABLE "PosSaleActionAudit"("id" text primary key,"companyId" text,"storeId" text,"saleId" text,"actionType" text,"actorId" text,"actorName" text,"createdAt" timestamptz,"details" jsonb)'
  ])await db.$executeRawUnsafe(sql);
  const saleIds=['split','credit','zero','double-session','late-ambiguous','duplicate-completion','actor-conflict','actor-null','null-session','prefix','prefix-long','reversed','refund','unlinked','foreign'];
  for(const id of saleIds){
   await db.$executeRaw`INSERT INTO "Sale" VALUES (${id},'co',${id==='foreign'?'other':'store'},'COMPLETED','POS',${'R-'+id},'2026-10-22T16:00:00Z',${id==='zero'?0:10})`;
   await db.$executeRaw`INSERT INTO "SaleLine" VALUES (${'line-'+id},${id},'p',${id},1,${id==='zero'?0:10},0,${id==='zero'?0:10},NULL,NULL)`;
  }
  let sequence=0;
  const ledger=async(saleId,sessionId='shift',type='SALE_CASH',actorId='user',actorName='Recorded',reversed=false,description=`POS πώληση ${saleId} · CASH`,storeId='store')=>db.$executeRaw`INSERT INTO "StoreTransaction" VALUES (${'tx-'+(++sequence)},'co',${storeId},${sessionId},${type},10,${description},${actorId},${actorName},${reversed?new Date('2026-10-22T17:00:00Z'):null})`;
  const completion=async(saleId,sessionId='shift',actorId='user',actorName='Recorded',createdAt='2026-10-22T16:00:00Z',storeId='store',eventType='POS_SALE_COMPLETED')=>{
   const details={saleId,sessionId,actorName,items:[{productId:'p',quantity:1,unitPrice:10,lineTotal:10,priceSource:'MANUAL'}]};
   return db.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES (${'audit-'+String(++sequence).padStart(6,'0')},'co',${storeId},${eventType},${actorId},${JSON.stringify(details)}::jsonb,${new Date(createdAt)})`;
  };
  await ledger('split');await ledger('split','shift','SALE_CARD');await completion('split');await ledger('credit','shift','SALE_CREDIT');await completion('zero');
  await ledger('double-session');await ledger('double-session','other-shift');await completion('late-ambiguous');await completion('late-ambiguous','other-shift','user','Recorded','2026-10-25T16:00:00Z');
  await completion('duplicate-completion');await completion('duplicate-completion');await ledger('actor-conflict','shift','SALE_CARD','operator-id','Operator');await completion('actor-conflict','shift','account-id','Account');
  await ledger('actor-null','shift','SALE_CASH',null,null);await completion('actor-null');await ledger('null-session',null);await completion('null-session');
  await ledger('prefix-long');await ledger('prefix','shift','SALE_CASH','user','Recorded',false,'POS πώληση prefix-longer · CASH');
  await ledger('reversed','shift','SALE_CASH','user','Recorded',true);await ledger('refund','shift','RETURN_CASH');await completion('refund','shift','user','Recorded','2026-10-22T16:00:00Z','store','POS_RETURN_COMPLETED');
  await ledger('foreign','shift','SALE_CASH','user','Recorded',false,'POS πώληση foreign · CASH','other');await completion('foreign','shift','user','Recorded','2026-10-22T16:00:00Z','other');
  // Unrelated history is deliberately present: materialized base identity reads
  // must not be executed once per selected sale as in the legacy lateral plan.
  await db.$executeRaw`INSERT INTO "StoreOperatorAudit" SELECT 'noise-'||g,'co','store','POS_SALE_COMPLETED','user',jsonb_build_object('saleId','noise-'||g,'sessionId','shift','items',jsonb_build_array(jsonb_build_object('private','unused'))),'2026-10-22T16:00:00Z'::timestamptz FROM generate_series(1,120) g`;
  const tables=['Sale','SaleLine','StoreTransaction','StoreOperatorAudit','PosSaleActionAudit'];
  const snapshot=()=>Promise.all(tables.map(t=>db.$queryRawUnsafe(`SELECT to_jsonb(x) AS record FROM "${t}" x ORDER BY "id"`)));
  const before=await snapshot();
  const parity=async({explain=false}={})=>db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   let batchQuery,batchSales,events;
   const tracked=new Proxy(tx,{get(target,key){if(key==='$queryRaw')return async(strings,...values)=>{const sql=strings.join('?'),result=await target.$queryRaw(strings,...values);if(sql.includes('WITH candidate_sales AS MATERIALIZED')){batchQuery=Prisma.sql(strings,...values);batchSales=result;}if(sql.includes('FROM "PosSaleActionAudit"'))events=result;return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
   let legacyQuery;const legacyTracked=new Proxy(tx,{get(target,key){if(key==='$queryRaw')return async(strings,...values)=>{legacyQuery=Prisma.sql(strings,...values);return target.$queryRaw(strings,...values);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
   const result=await readCashEventSales(tracked,scope,session),legacy=await legacySales(legacyTracked,scope,session);
   assert.deepEqual(batchSales,legacy,'every native source field and order equals the pre-batch query');assert.equal(hash({sales:batchSales,events}),hash({sales:legacy,events}));if(result.status==='AVAILABLE')assert.equal(result.evidenceHash,hash({sales:legacy,events}));else assert.equal(result.status,'LIMITED');
   if(explain){
    const rows=await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON, TIMING FALSE) ${batchQuery}`),raw=rows[0]['QUERY PLAN'],plan=(typeof raw==='string'?JSON.parse(raw):raw)[0].Plan,nodes=[];
    const walk=node=>{nodes.push(node);for(const child of node.Plans||[])walk(child)};walk(plan);
    for(const [cteName,relation]of [['ledger_identity','StoreTransaction'],['completion_identity','StoreOperatorAudit']]){
     const cte=nodes.find(n=>n['Subplan Name']==='CTE '+cteName);assert(cte,'materialized '+cteName+' has its own source plan');
     const descendants=[],visit=node=>{descendants.push(node);for(const child of node.Plans||[])visit(child)};visit(cte);
     const scans=descendants.filter(n=>n['Relation Name']===relation);
     assert.equal(scans.length,1,relation+' identity has one base relation scan');assert.equal(scans[0]['Actual Loops'],1,relation+' identity scan is not repeated per sale');
    }
    const baselineRows=await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON, TIMING FALSE) ${legacyQuery}`),baselineRaw=baselineRows[0]['QUERY PLAN'],baseline=(typeof baselineRaw==='string'?JSON.parse(baselineRaw):baselineRaw)[0].Plan,baselineNodes=[];
    const walkBaseline=node=>{baselineNodes.push(node);for(const child of node.Plans||[])walkBaseline(child)};walkBaseline(baseline);
    for(const relation of ['StoreTransaction','StoreOperatorAudit'])assert(baselineNodes.some(n=>n['Relation Name']===relation&&n['Actual Loops']>1),'legacy '+relation+' source is actually repeated per candidate');
   }
   return {result,sales:batchSales};
  },{isolationLevel:'RepeatableRead',timeout:30000});
  const first=await parity({explain:true});assert.equal(first.result.status,'AVAILABLE');
  assert.deepEqual(first.sales.map(s=>s.saleId),['actor-conflict','actor-null','credit','duplicate-completion','null-session','prefix-long','split','zero']);
  assert.equal(first.sales.find(s=>s.saleId==='duplicate-completion').completions.length,2);assert.equal(first.sales.find(s=>s.saleId==='actor-conflict').actorId,null);assert.equal(first.sales.find(s=>s.saleId==='actor-conflict').actorName,null);assert.equal(first.sales.find(s=>s.saleId==='actor-null').actorId,'user');assert.equal(first.sales.find(s=>s.saleId==='null-session').sessionId,'shift');assert.deepEqual(await snapshot(),before);
  // Verify the optional physical actor-name schema as well as the historical
  // details-only schema, without whole-audit to_jsonb serialization.
  await db.$executeRawUnsafe('ALTER TABLE "StoreOperatorAudit" ADD COLUMN "actorName" text');await db.$executeRaw`UPDATE "StoreOperatorAudit" SET "actorName"='Physical actor' WHERE "details"->>'saleId'='split'`;
  const namedBefore=await snapshot(),named=await parity();assert.equal(named.sales.find(s=>s.saleId==='split').actorName,null);assert.deepEqual(await snapshot(),namedBefore);
  // Per-sale completion overflow remains observable, not silently deduplicated.
  await db.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","eventType","actorId","details","createdAt") SELECT 'many-'||lpad(g::text,6,'0'),'co','store','POS_SALE_COMPLETED','user',jsonb_build_object('saleId','zero','sessionId','shift','items','[]'::jsonb),'2026-10-22T16:00:00Z'::timestamptz FROM generate_series(1,1001) g`;
  const manyBefore=await snapshot(),many=await parity();assert.equal(many.result.status,'LIMITED');assert.equal(many.sales.find(s=>s.saleId==='zero').completions.length,1001);assert.deepEqual(await snapshot(),manyBefore);
  // Raw overflow must be explicit even though added candidates have no links.
  await db.$executeRaw`INSERT INTO "Sale" SELECT 'unlinked-overflow-'||g,'co','store','COMPLETED','POS','overflow','2026-10-22T16:00:00Z'::timestamptz,10 FROM generate_series(1,2001) g`;
  const overflowBefore=await snapshot();assert.equal((await db.$transaction(tx=>readCashEventSales(tx,scope,session),{isolationLevel:'RepeatableRead'})).status,'LIMITED');assert.deepEqual(await snapshot(),overflowBefore);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
