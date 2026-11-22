import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCashEventSalesBatch,cashEventSessionBatchLimit} from '../src/services/cash-event-sales-source.js';
import {readReconciliationSession,readReconciliationSources,cashReconciliationSourceLimit} from '../src/services/cash-reconciliation-source.js';
import {readCashControlRule} from '../src/services/cash-control-rules.js';
import {reconcileError} from '../src/services/cash-reconciliation-contract.js';
import {readCashChatEvidence} from '../src/services/cash-chat-evidence.js';
import {createCashPaperRepository} from '../src/services/cash-paper-repository.js';
import {projectAutomaticPaperEvidence,boundAutomaticPaperDiscovery} from '../src/services/cash-paper-automatic.js';
import {readCashReviewEvidence} from '../src/services/cash-review-evidence.js';
import {readFullCashEventEvidence} from '../src/services/cash-full-audit.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
const readCashEventSales=frozenEventSales;

// Frozen exact pre-snapshot-batch event reader; SQL/projection is not mocked.
import {Prisma} from '@prisma/client';
import {compareCashEventSales,cashEventSalesLimits} from '../src/services/cash-event-sales.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';

const unavailable=status=>({status,findings:[],financialAdjustmentCents:0});
// Called only inside the existing authorized, selected-store read transaction.
// No schema bootstrap, mutable catalog lookup, external reader or financial write.
async function frozenEventSales(db,scope,session){
 if(!scope.companyId||!scope.storeId||session.companyId!==scope.companyId||session.storeId!==scope.storeId||!session.id||session.status!=='CLOSED'||!session.openedAt||!session.closedAt)return unavailable('UNAVAILABLE');
 const openedAt=new Date(session.openedAt),closedAt=new Date(session.closedAt);
 if(!Number.isFinite(openedAt.getTime())||!Number.isFinite(closedAt.getTime())||closedAt<openedAt)return unavailable('UNAVAILABLE');
 const present=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'PosSaleActionAudit'))::text AS "auditTable",to_regclass(format('%I.%I',current_schema(),'StoreOperatorAudit'))::text AS "completionTable",
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='StoreOperatorAudit' AND column_name='actorName') AS "completionActorName"`;
 if(!present[0]?.auditTable||!present[0]?.completionTable)return unavailable('UNAVAILABLE');
 // Bound before building any links. A truncated raw candidate set cannot be
 // reported complete merely because its first sales have no ledger linkage.
 const candidates=await db.$queryRaw`SELECT s."id" FROM "Sale" s WHERE s."companyId"=${scope.companyId} AND s."storeId"=${scope.storeId} AND s."status"='COMPLETED' AND s."source"='POS'
  AND s."occurredAt">=${openedAt} AND s."occurredAt"<=${closedAt} ORDER BY s."occurredAt",s."id" LIMIT 2001`;
 if(candidates.length>cashEventSalesLimits.sales||candidates.some(s=>typeof s.id!=='string'||!/^[A-Za-z0-9-]{1,180}$/.test(s.id))||new Set(candidates.map(s=>s.id)).size!==candidates.length)return unavailable('LIMITED');
 const candidateIds=candidates.map(s=>s.id);
 // Older audit schemas have no actorName column. Inspect the capability once
 // instead of serializing each audit's full JSON (including completion items).
 const completionActorName=present[0].completionActorName===true?Prisma.sql`COALESCE(a."actorName",a."details"->>'actorName')`:Prisma.sql`a."details"->>'actorName'`;
 const sales=candidateIds.length?await db.$queryRaw`
  WITH candidate_sales AS MATERIALIZED (
   SELECT s."id",s."companyId",s."storeId",s."status",s."source",s."receiptNumber",s."occurredAt",s."total"
   FROM "Sale" s WHERE s."companyId"=${scope.companyId} AND s."storeId"=${scope.storeId} AND s."id"=ANY(${candidateIds}::text[])
    AND s."status"='COMPLETED' AND s."source"='POS' AND s."occurredAt">=${openedAt} AND s."occurredAt"<=${closedAt}
  ), ledger_identity AS MATERIALIZED (
   SELECT t."sessionId",t."actorId",t."actorName",t."description",substring(t."description" FROM '^POS πώληση ([A-Za-z0-9-]+) ·') AS "saleId"
   FROM "StoreTransaction" t WHERE t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId}
    AND t."type" IN ('SALE_CASH','SALE_CARD','SALE_IRIS','SALE_CREDIT') AND t."reversedAt" IS NULL
  ), completion_identity AS MATERIALIZED (
   SELECT a."id",a."details"->>'saleId' AS "saleId",a."details"->>'sessionId' AS "sessionId",a."actorId",${completionActorName} AS "actorName"
   FROM "StoreOperatorAudit" a WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId} AND a."eventType"='POS_SALE_COMPLETED'
  ), candidate_completions AS MATERIALIZED (
   SELECT a.* FROM completion_identity a JOIN candidate_sales s ON a."saleId"=s."id"
  ), link_rows AS MATERIALIZED (
   SELECT s."id" AS "saleId",t."sessionId",t."actorId",t."actorName" FROM ledger_identity t JOIN candidate_sales s ON t."saleId"=s."id"
    AND left(t."description",char_length('POS πώληση '||s."id"||' ·'))='POS πώληση '||s."id"||' ·'
   UNION ALL
   SELECT a."saleId",a."sessionId",a."actorId",a."actorName" FROM candidate_completions a
  ), links AS MATERIALIZED (
   SELECT t."saleId",MIN(t."sessionId") AS "sessionId",CASE WHEN COUNT(DISTINCT t."actorId")=1 THEN MIN(t."actorId") END AS "actorId",CASE WHEN COUNT(DISTINCT t."actorName")=1 THEN MIN(t."actorName") END AS "actorName"
   FROM link_rows t GROUP BY t."saleId" HAVING COUNT(*)>0 AND COUNT(DISTINCT t."sessionId")=1 AND MIN(t."sessionId")=${session.id}
  ), ranked_completions AS MATERIALIZED (
   SELECT a."id",a."saleId",row_number() OVER(PARTITION BY a."saleId" ORDER BY a."id") AS position FROM candidate_completions a WHERE a."sessionId"=${session.id}
  ), completion_groups AS MATERIALIZED (
   SELECT a."saleId",jsonb_agg(jsonb_build_object('eventId',raw."id",'items',raw."items") ORDER BY raw."id") AS "completions"
   FROM ranked_completions a JOIN LATERAL (
    SELECT raw."id",raw."details"->'items' AS "items" FROM "StoreOperatorAudit" raw WHERE raw."id"=a."id" AND raw."companyId"=${scope.companyId} AND raw."storeId"=${scope.storeId} AND raw."eventType"='POS_SALE_COMPLETED' LIMIT 1
   ) raw ON TRUE WHERE a.position<=1001 GROUP BY a."saleId"
  )
  SELECT s."id" AS "saleId",s."companyId",s."storeId",s."status",s."source",s."receiptNumber",s."occurredAt",s."total",link."sessionId",link."actorId",link."actorName",TRUE AS "linked",
   (SELECT jsonb_agg(jsonb_build_object('lineId',l."id",'productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'discount',l."discount",'lineTotal',l."lineTotal",'promotionId',to_jsonb(l)->>'promotionId','promotionType',to_jsonb(l)->>'promotionType') ORDER BY l."id")
    FROM (SELECT * FROM "SaleLine" sl WHERE sl."saleId"=s."id" ORDER BY sl."id" LIMIT 1001) l) AS "lines",completed."completions"
  FROM candidate_sales s JOIN links link ON link."saleId"=s."id" LEFT JOIN completion_groups completed ON completed."saleId"=s."id"
  ORDER BY s."occurredAt",s."id" LIMIT 2001`:[];
 const records=await db.$queryRaw`
  SELECT a."id",a."companyId",a."storeId",a."saleId",a."actionType",a."actorId",a."actorName",a."createdAt",a."details"
  FROM "PosSaleActionAudit" a WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId}
   AND a."details"->>'sessionId'=${session.id} AND a."createdAt">=${openedAt} AND a."createdAt"<=${closedAt}
   AND a."actionType" IN ('PRICE_CHANGE','PERMANENT_PRICE_CHANGE','DISCOUNT','DISCOUNT_SET') ORDER BY a."createdAt",a."id" LIMIT 2001`;
 if(sales.length>cashEventSalesLimits.sales||records.length>cashEventSalesLimits.events||sales.some(s=>Array.isArray(s.completions)&&(s.completions.length>1000||s.completions.some(c=>Array.isArray(c.items)&&c.items.length>1000))))return unavailable('LIMITED');
 // Details are projection only, never trusted authorization or approval flags.
 const events=records.map(r=>{const d=r.details||{};return {id:r.id,companyId:r.companyId,storeId:r.storeId,saleId:r.saleId,actionType:r.actionType,actorId:r.actorId,actorName:r.actorName,createdAt:r.createdAt,sessionId:d.sessionId,productId:d.productId,productName:d.productName,lineId:d.lineId,quantity:d.newQuantity??d.previousQuantity??d.quantity,oldPrice:d.oldPrice,newPrice:d.newPrice,newTotal:d.newTotal};});
 const confirmations=[];
 for(const sale of sales)for(const line of sale.lines||[]){
  if(!line.promotionId||!['GIFT','LEAFLET'].includes(line.promotionType)||!Array.isArray(sale.completions)||sale.completions.length!==1)continue;
  const completion=sale.completions[0],items=Array.isArray(completion.items)?completion.items:[];
  const matched=items.filter(i=>i.productId===line.productId&&Number(i.quantity)===Number(line.quantity)&&Number(i.unitPrice)===Number(line.unitPrice)&&Number(i.lineTotal)===Number(line.lineTotal)&&i.priceSource===line.promotionType);
  const sameLines=(sale.lines||[]).filter(l=>l.productId===line.productId&&Number(l.quantity)===Number(line.quantity)&&Number(l.unitPrice)===Number(line.unitPrice)&&Number(l.lineTotal)===Number(line.lineTotal));
  if(matched.length!==1||sameLines.length!==1||!completion.eventId)continue;
  confirmations.push({...scope,kind:'AUTOMATIC_DISCOUNT',saleId:sale.saleId,lineId:line.lineId,productId:line.productId,occurredAt:new Date(sale.occurredAt).toISOString(),quantity:Number(line.quantity),unitPriceCents:Math.round(Number(line.unitPrice)*100),lineTotalCents:Math.round(Number(line.lineTotal)*100),evidenceId:completion.eventId});
 }
 const result=compareCashEventSales({scope:{...scope,sessionId:session.id},sales,events,confirmations});
 // Full bounded source receipt changes even when a previously unresolved edit
 // is now matched. It is report freshness, never a financial review adjustment.
 return {...result,evidenceHash:hash({sales,events})};
}

// Frozen orchestration uses the unchanged standalone reader.
async function frozenSources(db,scope,period,extraIds=[]){
  const stores=await db.store.findUnique({where:{id:scope.storeId},select:{id:true,companyId:true,name:true}});
  if(!stores||stores.companyId!==scope.companyId)throw reconcileError('CASH_RECONCILIATION_NOT_FOUND',404);
  const rule=await readCashControlRule(db,stores);
  const rows=await db.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND ("closedAt" AT TIME ZONE 'Europe/Athens')::date BETWEEN ${period.from}::date AND ${period.to}::date ORDER BY "closedAt","id" LIMIT 201`;
  if(rows.length>cashReconciliationSourceLimit)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const selectedIds=rows.map(r=>r.id),ids=[...new Set([...selectedIds,...extraIds])];
  if(ids.length>500||selectedIds.some(id=>typeof id!=='string')||new Set(selectedIds).size!==selectedIds.length)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const sessions=new Map();let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,ids.length)},async()=>{while(cursor<ids.length){const id=ids[cursor++];sessions.set(id,await readReconciliationSession(db,scope,id,rule));}}));
  const neighbours=[...new Set([...sessions.values()].flatMap(s=>[s.session.previousSession?.id,s.session.nextSession?.id]).filter(Boolean))];
  if(new Set([...ids,...neighbours]).size>500)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  for(const id of neighbours)if(!sessions.has(id))sessions.set(id,await readReconciliationSession(db,scope,id,rule));
  let paperEvidence;
  if(scope.fullAudit===true){
    const discovery=boundAutomaticPaperDiscovery(await readCashChatEvidence(db,scope)),repository=createCashPaperRepository(db),papers=[];
    for(const source of discovery.sources||[]){let reading={status:'REQUIRES_REVIEW'};if(source.checksum&&source.references?.[0]?.messageId){try{await repository.source(scope,source.references[0].messageId,source.checksum);reading=await repository.get(scope,source.checksum);}catch{}}papers.push({...source,reading});}
    paperEvidence=projectAutomaticPaperEvidence({scope,sessions,papers,discovery,selectedIds,period,storeName:stores.name});
    for(const id of selectedIds){const original=sessions.get(id);
      original.fullEvidence={duplicates:await readCashReviewEvidence(db,{...original.session,sessionId:id},{includeChat:false}),events:await readFullCashEventEvidence(db,scope,original.session,original.automaticTransactions||[])};
    }
  }
  return {store:stores,rule,sessions,selectedIds,period,coverage:'BOUNDED_CLOSED_SHIFTS',limit:cashReconciliationSourceLimit,...(paperEvidence?{paperEvidence}:{})};
}

const scope={companyId:'co',storeId:'store',generation:'0'};
const shift=(id,extra={})=>({...scope,id,status:'CLOSED',terminalPos:'MAIN',openedAt:new Date('2026-11-01T06:00:00Z'),closedAt:new Date('2026-11-01T07:00:00Z'),...extra});
const rawSale=(id,sessionId)=>({...scope,saleId:id,sessionId,status:'COMPLETED',source:'POS',receiptNumber:id,occurredAt:new Date('2026-11-01T06:30:00Z'),total:0,actorId:'operator',actorName:'Synthetic',linked:true,lines:[{lineId:'line-'+id,productId:'p',description:'Synthetic',quantity:1,unitPrice:0,lineTotal:0}],completions:null});
test('bounded event batches isolate raw limits, deduplicate overlapping candidates and still read empty-session events; errors propagate',async()=>{
 const sessions=[shift('first'),shift('overlap'),shift('empty'),shift('bad'),shift('foreign',{storeId:'other'})],calls=[];
 let index=0;const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});
  if(sql.includes('to_regclass'))return[{auditTable:'present',completionTable:'present',completionActorName:true}];
  if(sql.includes('SELECT s."id" FROM "Sale"'))return [[{id:'sale'}],[{id:'sale'}],[],[{id:'unsafe_id'}]][index++];
  if(sql.includes('WITH candidate_sales'))return[rawSale('sale','first')];
  if(sql.includes('FROM "PosSaleActionAudit"'))return[];throw Error('Unexpected query');
 }};
 const result=await readCashEventSalesBatch(db,scope,sessions);
 assert.equal(result.get('first').status,'AVAILABLE');assert.equal(result.get('overlap').status,'AVAILABLE');assert.equal(result.get('empty').status,'AVAILABLE');assert.equal(result.get('bad').status,'LIMITED');assert.equal(result.get('foreign').status,'UNAVAILABLE');
 assert.equal(calls.filter(c=>c.sql.includes('to_regclass')).length,1);assert.equal(calls.filter(c=>c.sql.includes('WITH candidate_sales')).length,1);assert.equal(calls.filter(c=>c.sql.includes('FROM "PosSaleActionAudit"')).length,3);
 const enrichment=calls.find(c=>c.sql.includes('WITH candidate_sales'));assert.deepEqual(enrichment.values.find(Array.isArray),['sale']);assert(enrichment.sql.includes('PARTITION BY a."saleId",a."sessionId"'));assert(!enrichment.sql.includes('ORDER BY s."occurredAt",s."id" LIMIT 2001'));
 assert.equal(result.get('first').findings.length,1);assert.equal(result.get('overlap').findings.length,0);
 await assert.rejects(readCashEventSalesBatch({$queryRaw:async()=>{throw Error('Synthetic source failure')}},scope,[shift('first')]),/Synthetic source failure/);
 await assert.rejects(readCashEventSalesBatch(db,scope,Array.from({length:17},(_,i)=>shift('s'+i))),/Invalid cash event batch/);
 await assert.rejects(readCashEventSalesBatch(db,scope,[shift('a'),shift('a')]),/Invalid cash event batch/);
});

function fakeSourceDb(isolation){
 const calls=[],ids=Array.from({length:18},(_,i)=>'s'+String(i).padStart(2,'0')),all=[...ids,'previous','next'];
 const rows=new Map(all.map((id,i)=>[id,{...shift(id),sourceIsolation:isolation,openedBy:'operator',openedByName:'Synthetic',shiftLabel:'Day',variance:0,cardVariance:0,openingOperational:0,actualOperational:0,updatedAt:new Date('2026-11-01T07:00:00Z'),previousSession:id===ids[0]?{id:'previous'}:null,nextSession:id===ids.at(-1)?{id:'next'}:null}]));
 const db={store:{findUnique:async()=>({id:'store',companyId:'co',name:'Synthetic'})},$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});
  if(sql.includes('FROM "CashControlStoreRule"'))return[];
  if(sql.includes('ORDER BY "closedAt","id" LIMIT 201'))return ids.map(id=>({id}));
  if(sql.includes('FROM "CashShiftSession" s'))return[rows.get(values.find(v=>rows.has(v)))];
  if(sql.includes('AS "attachmentDigest"'))return[];
  if(sql.includes('FROM "CashControlReview"'))return sql.includes('COUNT(*)')?[{count:0}]:[];
  if(sql.includes('COUNT(*)::int AS "transactionCount"'))return[{transactionCount:0,activeTotal:0,expenseTotal:0,reversedCount:0,lastMovementAt:null}];
  if(sql.includes('to_regclass'))return[{auditTable:'present',completionTable:'present'}];
  if(sql.includes('FROM "Sale"')||sql.includes('FROM "PosSaleActionAudit"'))return[];
  throw Error('Unexpected query '+sql);
 }};return {db,calls,ids};
}
test('source orchestration chunks all selected/context sessions and retains standalone/unknown/ReadCommitted sequences',async()=>{
 const period={from:'2026-11-01',to:'2026-11-01'};
 for(const isolation of ['repeatable read','serializable','read committed',undefined,'unknown']){
  const actual=fakeSourceDb(isolation),old=fakeSourceDb(isolation),source=await readReconciliationSources(actual.db,scope,period),legacy=await frozenSources(old.db,scope,period);
  assert.deepEqual(source,legacy);assert.deepEqual(projectReconciliation(source,[]),projectReconciliation(legacy,[]));assert.equal(source.sessions.size,20);
  const stable=['repeatable read','serializable'].includes(isolation),metadata=actual.calls.filter(c=>c.sql.includes('to_regclass')).length;
  assert.equal(metadata,stable?Math.ceil(20/cashEventSessionBatchLimit):20);assert.equal(old.calls.filter(c=>c.sql.includes('to_regclass')).length,20);
  assert.equal(actual.calls.filter(c=>c.sql.includes('SELECT s."id" FROM "Sale"')).length,20);
  assert.equal(actual.calls.filter(c=>c.sql.includes('FROM "PosSaleActionAudit"')).length,20);
  assert(!JSON.stringify(source).includes('eventCollector'));assert(!JSON.stringify(source).includes('sourceIsolation'));
 }
});

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native stable-snapshot batches preserve frozen raw evidence, source/report hashes, bounds and immutable controls while identity scans occur once per chunk',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_event_snapshot_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const definitions=[
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text)',
   'CREATE TABLE "CashControlStoreRule"("companyId" text,"storeId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamptz)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"shiftLabel" text,"openedAt" timestamptz,"closedAt" timestamptz,"variance" numeric,"cardVariance" numeric,"openingOperational" numeric,"actualOperational" numeric,"updatedAt" timestamptz)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"actorId" text,"actorName" text,"attachmentData" text,"attachmentMimeType" text,"attachmentFilename" text,"subtractFromShift" boolean,"occurredAt" timestamptz,"createdAt" timestamptz,"reversedAt" timestamptz)',
   'CREATE TABLE "CashControlReview"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"decision" text,"amount" numeric,"note" text,"actorId" text,"actorName" text,"snapshotJson" jsonb,"createdAt" timestamptz)',
   'CREATE TABLE "Sale"("id" text primary key,"companyId" text,"storeId" text,"status" text,"source" text,"receiptNumber" text,"occurredAt" timestamptz,"total" numeric)',
   'CREATE TABLE "SaleLine"("id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text)',
   'CREATE INDEX ON "SaleLine"("saleId")',
   'CREATE TABLE "Payment"("id" text primary key,"saleId" text,"method" text,"amount" numeric)',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"eventType" text,"actorId" text,"operatorId" text,"details" jsonb,"createdAt" timestamptz)',
   'CREATE TABLE "PosSaleActionAudit"("id" text primary key,"companyId" text,"storeId" text,"saleId" text,"relatedSaleId" text,"actionType" text,"reason" text,"actorId" text,"actorName" text,"createdAt" timestamptz,"details" jsonb)',
   'CREATE TABLE "PosSaleSafetyAudit"("id" text primary key,"companyId" text,"storeId" text,"saleId" text,"relatedSaleId" text,"eventType" text,"actorId" text,"actorName" text,"createdAt" timestamptz,"details" jsonb)',
   'CREATE TABLE "StoreChatMessage"("id" text primary key,"companyId" text,"storeId" text,"category" text,"createdAt" timestamptz,"attachmentName" text,"attachmentMimeType" text,"attachmentSize" int,"attachmentChecksum" text,"attachmentData" text)'
  ];for(const sql of definitions)await db.$executeRawUnsafe(sql.replace('CREATE TABLE "','CREATE TABLE "'+schema+'"."').replace('CREATE INDEX ON "','CREATE INDEX ON "'+schema+'"."'));
  await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','co','Synthetic')`;
  const ids=Array.from({length:18},(_,i)=>'shift-'+String(i).padStart(2,'0'));
  const opened=i=>new Date(Date.parse('2026-11-01T06:00:00Z')+i*600000),closed=i=>new Date(+opened(i)+600000);
  for(const [i,id]of ids.entries())await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES (${id},'co','store','MAIN','CLOSED','operator','Synthetic','Day',${opened(i)},${closed(i)},0,0,0,0,${closed(i)})`;
  for(const [id,at]of [['previous','2026-10-31T06:00:00Z'],['next','2026-11-02T06:00:00Z']])await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES (${id},'co','store','MAIN','CLOSED','operator','Synthetic','Day',${new Date(at)},${new Date(+new Date(at)+600000)},0,0,0,0,${new Date(at)})`;
  let serial=0;
  const sale=async(id,sessionId,at,{completion=true,ledger=true,total=0,storeId='store',type='SALE_CASH',reversed=false}={})=>{
   await db.$executeRaw`INSERT INTO "Sale" VALUES (${id},'co',${storeId},'COMPLETED','POS',${id},${at}::timestamptz,${total})`;
   await db.$executeRaw`INSERT INTO "SaleLine" VALUES (${'line-'+id},${id},'p','Synthetic',1,${total},0,${total},NULL,NULL)`;
   if(ledger)await db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName","subtractFromShift","occurredAt","createdAt","reversedAt") VALUES (${'ledger-'+(++serial)},'co',${storeId},${sessionId},${type},${total},${'POS πώληση '+id+' · CASH'},'operator','Synthetic',true,${at}::timestamptz,${at}::timestamptz,${reversed?new Date(at):null})`;
   if(completion)await complete(id,sessionId,at,storeId);
  };
  const complete=async(id,sessionId,at,storeId='store',actorId='operator')=>db.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES (${'completion-'+String(++serial).padStart(6,'0')},'co',${storeId},'POS_SALE_COMPLETED',${actorId},NULL,${JSON.stringify({saleId:id,sessionId,actorName:'Synthetic',items:[{productId:'p',quantity:1,unitPrice:0,lineTotal:0,priceSource:'MANUAL'}]})}::jsonb,${at}::timestamptz)`;
  for(const [i,id]of ids.entries())await sale('sale-'+i,id,new Date(+opened(i)+300000).toISOString());
  await sale('credit',ids[0],'2026-11-01T06:01:00Z',{type:'SALE_CREDIT'});await sale('completion-only',ids[0],'2026-11-01T06:02:00Z',{ledger:false});
  await sale('reversed',ids[0],'2026-11-01T06:03:00Z',{completion:false,reversed:true});await sale('refund',ids[0],'2026-11-01T06:04:00Z',{completion:false,type:'RETURN_CASH'});
  await sale('cross-session',ids[0],'2026-11-01T06:05:00Z');await complete('cross-session','outside-session','2026-12-01T00:00:00Z');
  await complete('sale-0',ids[0],'2026-11-01T06:05:00Z','store','account-other-namespace');await sale('foreign',ids[0],'2026-11-01T06:06:00Z',{storeId:'other'});
  // Microseconds just outside the exact candidate window remain excluded.
  await sale('micro-outside',ids[0],'2026-11-01T05:59:59.999999Z');
  await db.$executeRaw`INSERT INTO "PosSaleActionAudit" VALUES ('price','co','store','sale-0',NULL,'PRICE_CHANGE',NULL,'operator','Synthetic','2026-11-01T06:04:59.999999Z',${JSON.stringify({sessionId:ids[0],productId:'p',lineId:'line-sale-0',oldPrice:1,newPrice:0,quantity:1,newTotal:0})}::jsonb)`;
  await db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","createdAt","occurredAt") VALUES ('expense','co','store',${ids[0]},'OTHER_EXPENSE',-0.1,'Synthetic expense','2026-11-01T06:02:00Z','2026-11-01T06:02:00Z')`;
  const tables=definitions.filter(s=>s.startsWith('CREATE TABLE')).map(s=>s.match(/CREATE TABLE "([^"]+)"/)[1]);
  const snapshot=()=>Promise.all(tables.map(t=>db.$queryRawUnsafe(`SELECT to_jsonb(x) AS record FROM "${t}" x ORDER BY to_jsonb(x)::text`)));
  const before=await snapshot();
  const trace=tx=>{const calls=[];return {calls,db:new Proxy(tx,{get(target,key){if(key==='$queryRaw')return async(strings,...values)=>{const result=await target.$queryRaw(strings,...values);calls.push({sql:strings.join('?'),query:Prisma.sql(strings,...values),values,result});return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}})};};
  const descriptors=[shift(ids[0]),shift('overlap'),shift(ids[1],{openedAt:opened(1),closedAt:closed(1)}),shift('empty',{openedAt:new Date('2026-12-31T01:00:00Z'),closedAt:new Date('2026-12-31T02:00:00Z')}),shift('foreign',{storeId:'other'})];
  const checkBatch=async(descriptors,{explain=false}={})=>db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const actual=trace(tx),old=[];
   const result=await readCashEventSalesBatch(actual.db,scope,descriptors);
   for(const descriptor of descriptors){const tracked=trace(tx),legacy=await frozenEventSales(tracked.db,scope,descriptor);old.push(...tracked.calls);assert.deepEqual(result.get(descriptor.id),legacy,'per-session frozen evidence/findings/hash parity');
    const prior=tracked.calls.find(c=>c.sql.includes('WITH candidate_sales'))?.result||[],candidateCall=actual.calls.filter(c=>c.sql.includes('SELECT s."id" FROM "Sale"'))[descriptors.filter(d=>d.storeId===scope.storeId).findIndex(d=>d.id===descriptor.id)],candidates=new Set((candidateCall?.result||[]).map(r=>r.id));
    const rows=(actual.calls.find(c=>c.sql.includes('WITH candidate_sales'))?.result||[]).filter(r=>r.sessionId===descriptor.id&&candidates.has(r.saleId));assert.deepEqual(rows,prior,'complete raw sales/completions/ordering retained');
    const currentEvents=actual.calls.find(c=>c.sql.includes('FROM "PosSaleActionAudit"')&&c.values.includes(descriptor.id))?.result||[],oldEvents=tracked.calls.find(c=>c.sql.includes('FROM "PosSaleActionAudit"'))?.result||[];assert.deepEqual(currentEvents,oldEvents,'all raw event fields and ordering retained');
   }
   assert.equal(actual.calls.filter(c=>c.sql.includes('WITH candidate_sales')).length,descriptors.some(d=>d.storeId==='store'&&d.id!== 'empty')?1:0);
   if(explain){const query=actual.calls.find(c=>c.sql.includes('WITH candidate_sales')).query,rows=await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE,FORMAT JSON,TIMING FALSE) ${query}`),raw=rows[0]['QUERY PLAN'],plan=(typeof raw==='string'?JSON.parse(raw):raw)[0].Plan,nodes=[];const walk=n=>{nodes.push(n);for(const c of n.Plans||[])walk(c)};walk(plan);
    for(const [cte,relation]of [['ledger_identity','StoreTransaction'],['completion_identity','StoreOperatorAudit']]){const root=nodes.find(n=>n['Subplan Name']==='CTE '+cte);assert(root);const scans=[];const visit=n=>{if(n['Relation Name']===relation)scans.push(n);for(const c of n.Plans||[])visit(c)};visit(root);assert.equal(scans.length,1);assert.equal(scans[0]['Actual Loops'],1);}
    assert(old.filter(c=>c.sql.includes('WITH candidate_sales')).length>1,'frozen orchestration repeated the base identity query for multiple sessions');
   }
   return result;
  },{isolationLevel:'RepeatableRead',timeout:30000});
  await checkBatch(descriptors,{explain:true});assert.deepEqual(await snapshot(),before);
  const period={from:'2026-11-01',to:'2026-11-01'};
  for(const isolationLevel of ['RepeatableRead','Serializable','ReadCommitted'])for(const fullAudit of [false,true])await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const actual=trace(tx),old=trace(tx),requested={...scope,...(fullAudit?{fullAudit:true}:{})};
   const source=await readReconciliationSources(actual.db,requested,period),legacy=await frozenSources(old.db,requested,period);
   assert.deepEqual(source,legacy,'whole source, per-session sourceHash and full evidence preserve the frozen source');assert.deepEqual(projectReconciliation(source,[]),projectReconciliation(legacy,[]),'canonical financial rows/text/report hash unchanged');assert.equal(source.selectedIds.length,18);assert.equal(source.sessions.size,20);
   const stable=isolationLevel!=='ReadCommitted';assert.equal(actual.calls.filter(c=>c.sql.includes('ledger_identity AS MATERIALIZED')).length,stable?2:18);assert.equal(old.calls.filter(c=>c.sql.includes('ledger_identity AS MATERIALIZED')).length,18);
  },{isolationLevel,timeout:30000});
  assert.deepEqual(await snapshot(),before);
  // The optional actorName capability has its own exact old-vs-new projection.
  await db.$executeRawUnsafe('ALTER TABLE "StoreOperatorAudit" ADD COLUMN "actorName" text');await db.$executeRaw`UPDATE "StoreOperatorAudit" SET "actorName"='Physical actor' WHERE "details"->>'saleId'='sale-0'`;await checkBatch(descriptors);
  // Per-session LIMIT failures do not poison another session in the same batch.
  await db.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","eventType","actorId","details","createdAt") SELECT 'many-completion-'||g,'co','store','POS_SALE_COMPLETED','operator',jsonb_build_object('saleId','sale-0','sessionId',${ids[0]},'items','[]'::jsonb),'2026-11-01T06:05:00Z'::timestamptz FROM generate_series(1,1001) g`;
  const limited=await checkBatch(descriptors);assert.equal(limited.get(ids[0]).status,'LIMITED');assert.equal(limited.get(ids[1]).status,'AVAILABLE');
  await db.$executeRaw`INSERT INTO "SaleLine" SELECT 'many-line-'||g,'sale-1','p','Synthetic',1,0,0,0,NULL,NULL FROM generate_series(1,1001) g`;await checkBatch(descriptors);
  await db.$executeRaw`INSERT INTO "PosSaleActionAudit" ("id","companyId","storeId","saleId","actionType","actorId","createdAt","details") SELECT 'many-event-'||g,'co','store','sale-1','PRICE_CHANGE','operator','2026-11-01T06:15:00Z'::timestamptz,jsonb_build_object('sessionId',${ids[1]}) FROM generate_series(1,2001) g`;await checkBatch(descriptors);
  await db.$executeRaw`INSERT INTO "Sale" SELECT 'overflow-'||g,'co','store','COMPLETED','POS','overflow','2026-11-01T06:05:00Z'::timestamptz,0 FROM generate_series(1,2001) g`;
  const overflowBefore=await snapshot(),overflow=await checkBatch([descriptors[0],shift(ids[2],{openedAt:opened(2),closedAt:closed(2)})]);assert.equal(overflow.get(ids[0]).status,'LIMITED');assert.equal(overflow.get(ids[2]).status,'AVAILABLE');assert.deepEqual(await snapshot(),overflowBefore);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
