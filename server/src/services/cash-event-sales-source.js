import {Prisma} from '@prisma/client';
import {compareCashEventSales,cashEventSalesLimits} from './cash-event-sales.js';
import {hash} from './cash-reconciliation-contract.js';

const unavailable=status=>({status,findings:[],financialAdjustmentCents:0});
// Called only inside the existing authorized, selected-store read transaction.
// No schema bootstrap, mutable catalog lookup, external reader or financial write.
export async function readCashEventSales(db,scope,session){
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
 return eventSalesResult(scope,session,sales,records);
}

function eventSalesResult(scope,session,sales,records){
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

// Internal stable-snapshot caller only. One invocation is bounded, with no
// cache beyond its current transaction, company/store/schema/generation scope.
export const cashEventSessionBatchLimit=16;
export async function readCashEventSalesBatch(db,scope,sessions){
 if(!Array.isArray(sessions)||sessions.length>cashEventSessionBatchLimit||new Set(sessions.map(s=>s?.id)).size!==sessions.length)throw new TypeError('Invalid cash event batch');
 const results=new Map(),valid=[];
 for(const session of sessions){
  const openedAt=new Date(session?.openedAt),closedAt=new Date(session?.closedAt);
  if(!scope.companyId||!scope.storeId||session?.companyId!==scope.companyId||session?.storeId!==scope.storeId||!session?.id||session.status!=='CLOSED'||!session.openedAt||!session.closedAt||!Number.isFinite(+openedAt)||!Number.isFinite(+closedAt)||closedAt<openedAt){results.set(session?.id,unavailable('UNAVAILABLE'));continue;}
  valid.push({session,openedAt,closedAt});
 }
 if(!valid.length)return results;
 const present=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'PosSaleActionAudit'))::text AS "auditTable",to_regclass(format('%I.%I',current_schema(),'StoreOperatorAudit'))::text AS "completionTable",
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='StoreOperatorAudit' AND column_name='actorName') AS "completionActorName"`;
 if(!present[0]?.auditTable||!present[0]?.completionTable){for(const {session}of valid)results.set(session.id,unavailable('UNAVAILABLE'));return results;}

 const prepared=[];
 for(const descriptor of valid){
  const {session,openedAt,closedAt}=descriptor;
  const candidates=await db.$queryRaw`SELECT s."id" FROM "Sale" s WHERE s."companyId"=${scope.companyId} AND s."storeId"=${scope.storeId} AND s."status"='COMPLETED' AND s."source"='POS'
   AND s."occurredAt">=${openedAt} AND s."occurredAt"<=${closedAt} ORDER BY s."occurredAt",s."id" LIMIT 2001`;
  if(candidates.length>cashEventSalesLimits.sales||candidates.some(s=>typeof s.id!=='string'||!/^[A-Za-z0-9-]{1,180}$/.test(s.id))||new Set(candidates.map(s=>s.id)).size!==candidates.length){results.set(session.id,unavailable('LIMITED'));continue;}
  prepared.push({...descriptor,candidateIds:new Set(candidates.map(s=>s.id))});
 }
 const candidateIds=[...new Set(prepared.flatMap(d=>[...d.candidateIds]))],sessionIds=prepared.map(d=>d.session.id);
 const completionActorName=present[0].completionActorName===true?Prisma.sql`COALESCE(a."actorName",a."details"->>'actorName')`:Prisma.sql`a."details"->>'actorName'`;
 // Unique candidate identities prevent overlapping windows from multiplying
 // link rows. All-date link ambiguity remains intact before distribution.
 const sales=candidateIds.length?await db.$queryRaw`
  WITH candidate_sales AS MATERIALIZED (
   SELECT s."id",s."companyId",s."storeId",s."status",s."source",s."receiptNumber",s."occurredAt",s."total"
   FROM "Sale" s WHERE s."companyId"=${scope.companyId} AND s."storeId"=${scope.storeId} AND s."id"=ANY(${candidateIds}::text[])
    AND s."status"='COMPLETED' AND s."source"='POS'
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
   FROM link_rows t GROUP BY t."saleId" HAVING COUNT(*)>0 AND COUNT(DISTINCT t."sessionId")=1 AND MIN(t."sessionId")=ANY(${sessionIds}::text[])
  ), ranked_completions AS MATERIALIZED (
   SELECT a."id",a."saleId",a."sessionId",row_number() OVER(PARTITION BY a."saleId",a."sessionId" ORDER BY a."id") AS position FROM candidate_completions a WHERE a."sessionId"=ANY(${sessionIds}::text[])
  ), completion_groups AS MATERIALIZED (
   SELECT a."saleId",a."sessionId",jsonb_agg(jsonb_build_object('eventId',raw."id",'items',raw."items") ORDER BY raw."id") AS "completions"
   FROM ranked_completions a JOIN LATERAL (
    SELECT raw."id",raw."details"->'items' AS "items" FROM "StoreOperatorAudit" raw WHERE raw."id"=a."id" AND raw."companyId"=${scope.companyId} AND raw."storeId"=${scope.storeId} AND raw."eventType"='POS_SALE_COMPLETED' LIMIT 1
   ) raw ON TRUE WHERE a.position<=1001 GROUP BY a."saleId",a."sessionId"
  )
  SELECT s."id" AS "saleId",s."companyId",s."storeId",s."status",s."source",s."receiptNumber",s."occurredAt",s."total",link."sessionId",link."actorId",link."actorName",TRUE AS "linked",
   (SELECT jsonb_agg(jsonb_build_object('lineId',l."id",'productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'discount',l."discount",'lineTotal',l."lineTotal",'promotionId',to_jsonb(l)->>'promotionId','promotionType',to_jsonb(l)->>'promotionType') ORDER BY l."id")
    FROM (SELECT * FROM "SaleLine" sl WHERE sl."saleId"=s."id" ORDER BY sl."id" LIMIT 1001) l) AS "lines",completed."completions"
  FROM candidate_sales s JOIN links link ON link."saleId"=s."id" LEFT JOIN completion_groups completed ON completed."saleId"=s."id" AND completed."sessionId"=link."sessionId"
  ORDER BY s."occurredAt",s."id"`:[];

 for(const {session,openedAt,closedAt,candidateIds}of prepared){
 const records=await db.$queryRaw`
  SELECT a."id",a."companyId",a."storeId",a."saleId",a."actionType",a."actorId",a."actorName",a."createdAt",a."details"
  FROM "PosSaleActionAudit" a WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId}
   AND a."details"->>'sessionId'=${session.id} AND a."createdAt">=${openedAt} AND a."createdAt"<=${closedAt}
   AND a."actionType" IN ('PRICE_CHANGE','PERMANENT_PRICE_CHANGE','DISCOUNT','DISCOUNT_SET') ORDER BY a."createdAt",a."id" LIMIT 2001`;

  const selected=sales.filter(s=>s.sessionId===session.id&&candidateIds.has(s.saleId));
  results.set(session.id,eventSalesResult(scope,session,selected,records));
 }
 return results;
}
