import {createHash} from 'node:crypto';
import {readInventoryReconciliation} from './inventory-reconciliation-source.js';
export const INVENTORY_RESULT_PAYLOAD_FORMAT='MWS_INVENTORY_RESULT_PAYLOAD_V1';
const hold=()=>{throw Object.assign(new Error('Inventory result source is incomplete.'),{code:'REPORT_DISPATCH_HOLD',status:409})};
const iso=value=>{if(value==null||!Number.isFinite(new Date(value).getTime()))hold();return new Date(value).toISOString()};
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200);
export async function listDueInventoryResultEvents(db,{companyId,storeId,now,limit=5,afterEventId=''}){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new TypeError('Bounded event limit required');
  return db.$queryRaw`SELECT s."id" AS "eventId" FROM "Stocktake" s
    JOIN "AutomaticReportAutomationGrant" g ON g."companyId"=s."companyId" AND g."storeId"=s."storeId"
      AND g."reportType"='INVENTORY_RESULT' AND g."active"=true AND g."revokedAt" IS NULL
    WHERE s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."id">${afterEventId}
      AND s."status"='FINALIZED' AND s."startedAt">=g."notBefore" AND s."finalizedAt"<${new Date(now)}
    ORDER BY s."id" LIMIT ${limit}`;
}
export async function readInventoryResultEvent(db,{companyId,storeId,eventId,now}){
  const rows=await db.$queryRaw`SELECT * FROM "Stocktake" WHERE "id"=${eventId} AND "companyId"=${companyId}
    AND "storeId"=${storeId} AND "status"='FINALIZED' FOR SHARE NOWAIT`;
  if(rows.length!==1)hold();
  const current=rows[0],from=iso(current.startedAt),to=iso(new Date(Date.parse(iso(current.finalizedAt))+1));
  if(from>=to||to>iso(now))hold();
  return {eventId,from,to,current};
}
export async function buildAutomaticInventoryPayload(tx,{companyId,storeId,storeName,eventId,settingsVersion,period,now=new Date()},{readReport=readInventoryReconciliation}={}){
  const event=await readInventoryResultEvent(tx,{companyId,storeId,eventId,now});
  if(event.from!==period.from||event.to!==period.to)hold();
  const report=await readReport({$transaction:fn=>fn(tx)},event.current);
  if(!report.previous?.id||report.current?.id!==eventId||!report.fingerprint||!report.summary||!report.sourceEvidence?.checkedCounts||!Array.isArray(report.rows))hold();
  if(report.summary.uncomputedItems!==0||report.coverage?.transactionSourcesAvailable!==true||report.sourceEvidence.coverage?.invoices!==true)hold();
  const counts=report.sourceEvidence.checkedCounts,summary=report.summary;
  if(!['transactions','invoices','systemEvents'].every(key=>Number.isSafeInteger(counts[key])&&counts[key]>=0))hold();
  const number=value=>value===null?'Άγνωστο':Number.isFinite(value)?String(value):hold();
  const lines=[`Κατάστημα: ${clean(storeName||storeId)}`,`Απογραφή: ${clean(event.current.name||eventId)}`,`Προηγούμενη απογραφή: ${clean(report.previous.name||report.previous.id)}`,
    `Έλλειμμα ποσότητας: ${number(summary.shortageQuantity)}`,`Πλεόνασμα ποσότητας: ${number(summary.surplusQuantity)}`,`Καθαρή διαφορά ποσότητας: ${number(summary.netQuantity)}`,
    `Αξία ελλείμματος EUR: ${number(summary.shortageValue)}`,`Αξία πλεονάσματος EUR: ${number(summary.surplusValue)}`,`Καθαρή αξία EUR: ${number(summary.netValue)}`,
    `Είδη χωρίς γνωστό κόστος: ${number(summary.missingCostItems)}`,`Πωλήσεις/αντιλογισμοί: ${counts.transactions}`,`Παραστατικά: ${counts.invoices}`,`Συμβάντα συστήματος: ${counts.systemEvents}`,''];
  if(report.version===2){
    if(!Array.isArray(report.groups))hold();
    for(const group of report.groups){
      if(!Array.isArray(group.productIds))hold();
      lines.push(`${clean(group.sku||group.canonicalProductId||group.id)} · ${clean(group.name)} · Κωδικοί ${group.productIds.map(clean).join(', ')} · Τελική διαφορά ${number(group.finalDifference)} · Τελική αξία EUR ${number(group.finalValue)}`);
    }
  }else{
    for(const row of report.rows)lines.push(`${clean(row.sku||row.productId)} · ${clean(row.name)} · Διαφορά ${number(row.difference)} · Αξία EUR ${number(row.differenceValue)}`);
  }
  const unavailable=['posActions','operatorEvents','productEvents','priceHistory'].filter(key=>report.sourceEvidence.coverage?.[key]!==true);
  const warnings=[...(unavailable.length?[`Μη διαθέσιμες πρόσθετες πηγές συμβάντων: ${unavailable.join(', ')}`]:[]),'Αποτελέσματα από καταχωρισμένα παραστατικά, πωλήσεις και συμβάντα. Απαιτείται έλεγχος φυσικού χρόνου παραλαβής και πρωτοτύπων.',clean(report.explanation)];
  lines.push('',...warnings);
  const sourceFingerprint=createHash('sha256').update(JSON.stringify([event.current,report.previous.id,report.fingerprint])).digest('hex');
  const content={format:INVENTORY_RESULT_PAYLOAD_FORMAT,scope:{companyId,storeId},frequency:'EVENT',eventId,previousStocktakeId:report.previous.id,period,settingsVersion,sourceFingerprint,
    financialFinality:'PROVISIONAL',financialLimitations:warnings,financialReconciliationComplete:false,employeeLiabilityAdjusted:false,
    subject:`Αποτελέσματα απογραφής · ${clean(storeName||storeId)} · ${clean(event.current.name||eventId)}`,text:lines.join('\n')};
  const body=JSON.stringify(content),byteLength=Buffer.byteLength(body);if(byteLength>2097152)hold();
  const {format,scope,frequency,financialFinality,financialLimitations}=content;
  return {format,scope,frequency,period,sourceFingerprint,financialFinality,financialLimitations,contentType:'application/json; charset=utf-8',body,byteLength,payloadFingerprint:createHash('sha256').update(body).digest('hex')};
}
