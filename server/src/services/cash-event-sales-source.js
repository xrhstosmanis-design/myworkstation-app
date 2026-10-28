import {compareCashEventSales,cashEventSalesLimits} from './cash-event-sales.js';
import {hash} from './cash-reconciliation-contract.js';

const unavailable=status=>({status,findings:[],financialAdjustmentCents:0});
// Called only inside the existing authorized, selected-store read transaction.
// No schema bootstrap, mutable catalog lookup, external reader or financial write.
export async function readCashEventSales(db,scope,session){
 if(!scope.companyId||!scope.storeId||session.companyId!==scope.companyId||session.storeId!==scope.storeId||!session.id||session.status!=='CLOSED'||!session.openedAt||!session.closedAt)return unavailable('UNAVAILABLE');
 const openedAt=new Date(session.openedAt),closedAt=new Date(session.closedAt);
 if(!Number.isFinite(openedAt.getTime())||!Number.isFinite(closedAt.getTime())||closedAt<openedAt)return unavailable('UNAVAILABLE');
 const present=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'PosSaleActionAudit'))::text AS "auditTable",to_regclass(format('%I.%I',current_schema(),'StoreOperatorAudit'))::text AS "completionTable"`;
 if(!present[0]?.auditTable||!present[0]?.completionTable)return unavailable('UNAVAILABLE');
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
