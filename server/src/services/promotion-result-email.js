import {createHash} from 'node:crypto';
import {readSalesAnalysisReport} from '../routes/kiosk-reports-sales-v4.js';

export const PROMOTION_RESULT_PAYLOAD_FORMAT='MWS_PROMOTION_RESULT_PAYLOAD_V1';
const hold=()=>{throw Object.assign(new Error('Promotion result source is incomplete.'),{code:'REPORT_DISPATCH_HOLD',status:409})};
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cents=value=>{
  if(!Number.isFinite(value))hold();
  const rounded=Math.sign(value)*Math.round((Math.abs(value)+Number.EPSILON)*100);
  if(!Number.isSafeInteger(rounded))hold();
  return rounded;
};
const instant=value=>{const date=new Date(value);if(value==null||!Number.isFinite(date.getTime()))hold();return date.toISOString()};

export async function listDuePromotionResultEvents(db,{companyId,storeId,now,limit=5,afterEventId=''}){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new TypeError('Bounded event limit required');
  return db.$queryRaw`SELECT p."id" AS "eventId" FROM "PriceCatalogPromotion" p
    JOIN "AutomaticReportAutomationGrant" g ON g."companyId"=p."companyId" AND g."storeId"=${storeId}
      AND g."reportType"='PROMOTION_RESULT' AND g."active"=true AND g."revokedAt" IS NULL
    WHERE p."companyId"=${companyId} AND p."id">${afterEventId}
      AND p."validUntil"<${new Date(now)} AND p."validFrom"<p."validUntil" AND p."validFrom">=g."notBefore"
      AND EXISTS(SELECT 1 FROM "PriceCatalogPromotionStore" ps WHERE ps."companyId"=p."companyId" AND ps."promotionId"=p."id" AND ps."storeId"=${storeId})
    ORDER BY p."id" LIMIT ${limit}`;
}

export async function readPromotionResultEvent(db,{companyId,storeId,eventId,now}){
  const rows=await db.$queryRaw`SELECT p.* FROM "PriceCatalogPromotion" p
    WHERE p."companyId"=${companyId} AND p."id"=${eventId}
      AND EXISTS(SELECT 1 FROM "PriceCatalogPromotionStore" ps WHERE ps."companyId"=p."companyId" AND ps."promotionId"=p."id" AND ps."storeId"=${storeId})
    FOR SHARE OF p NOWAIT`;
  if(rows.length!==1)hold();
  const promotion=rows[0],from=instant(promotion.validFrom),inclusiveEnd=instant(promotion.validUntil);
  // POS accepts the validUntil millisecond. Sales reports use an exclusive end.
  const to=instant(new Date(Date.parse(inclusiveEnd)+1));
  if(from>=inclusiveEnd||to>instant(now))hold();
  return {eventId,from,to,promotion};
}

export async function buildAutomaticPromotionPayload(db,{companyId,storeId,storeName,eventId,settingsVersion,period,now=new Date()}, {readReport=readSalesAnalysisReport}={}){
  const event=await readPromotionResultEvent(db,{companyId,storeId,eventId,now});
  if(event.from!==period.from||event.to!==period.to)hold();
  // The canonical reader retains promotion attribution, reversals and source coverage.
  const report=await readReport({companyId,storeId,from:new Date(period.from),to:new Date(period.to),promotionsOnly:true,q:null},{db});
  if(report.sourceCoverage?.complete!==true||report.unattributedPromotionReversal!==false||!Array.isArray(report.items))hold();
  const items=report.items.filter(item=>item.promotionId===eventId).map(item=>({productId:item.productId,sku:item.sku,name:item.name,unit:item.unit,salesQuantity:item.salesQuantity,grossSales:item.grossSales,discountValue:item.discountValue}));
  const grossCents=items.map(item=>cents(item.grossSales)),discountCents=items.map(item=>cents(item.discountValue));
  const totalCents=grossCents.reduce((sum,value)=>{const result=sum+value;if(!Number.isSafeInteger(result))hold();return result;},0);
  const totalDiscountCents=discountCents.reduce((sum,value)=>{const result=sum+value;if(!Number.isSafeInteger(result))hold();return result;},0);
  const money=new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'});
  const lines=[`Κατάστημα: ${clean(storeName||storeId)}`,`Προσφορά: ${clean(eventId)}`,`Περίοδος: ${period.from} — ${period.to}`,''];
  for(const [index,item] of items.entries()){
    if(![item.salesQuantity,item.grossSales,item.discountValue].every(Number.isFinite))hold();
    lines.push(`${clean(item.sku||item.productId)} · ${clean(item.name)} · ${item.salesQuantity} ${clean(item.unit)} · Πωλήσεις ${money.format(grossCents[index]/100)} · Έκπτωση ${money.format(discountCents[index]/100)}`);
  }
  lines.push('',`Σύνολο πωλήσεων: ${money.format(totalCents/100)}`,`Σύνολο εκπτώσεων: ${money.format(totalDiscountCents/100)}`);
  const sourceFingerprint=digest({companyId,storeId,event:event.promotion,items});
  const content={format:PROMOTION_RESULT_PAYLOAD_FORMAT,scope:{companyId,storeId},frequency:'EVENT',period,settingsVersion,eventId,sourceFingerprint,
    financialFinality:'PROVISIONAL',financialLimitations:['Αποτελέσματα από καταχωρισμένες πωλήσεις και αντιλογισμούς της περιόδου.'],
    financialReconciliationComplete:false,employeeLiabilityAdjusted:false,
    subject:`Αποτελέσματα προσφοράς · ${clean(storeName||storeId)} · ${clean(eventId)}`,text:lines.join('\n')};
  const body=JSON.stringify(content),byteLength=Buffer.byteLength(body);
  if(byteLength>2097152)hold();
  const {format,scope,frequency,financialFinality,financialLimitations}=content;
  return {format,scope,frequency,period,sourceFingerprint,financialFinality,financialLimitations,contentType:'application/json; charset=utf-8',body,
    byteLength,payloadFingerprint:createHash('sha256').update(body).digest('hex')};
}
