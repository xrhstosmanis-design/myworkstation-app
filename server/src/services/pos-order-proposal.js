import {supplierMinimumKey,supplierMinimumSection} from '../lib/proposal-supplier-minimum.js';
import {roundSupplierQuantity} from '../../../shared/order-proposal-quantities.mjs';
import {readWeeklyStockAlarmState} from './weekly-stock-alarm.js';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {greeceDateInput,greeceRangeDate} from '../../../shared/greece-time.mjs';
import {readOrderSuggestions} from '../routes/order-suggestions.js';
export const proposalError=(status,message)=>Object.assign(new Error(message),{status});
const shiftDate=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function parsePosProposalOptions(query={},now=new Date()){
 const raw=z.object({fromDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),toDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),supplierId:z.string().trim().max(200).default(''),coverageDays:z.coerce.number().int().min(1).max(60).default(7),leadDays:z.coerce.number().int().min(0).max(30).default(3),historyDays:z.coerce.number().int().min(7).max(90).default(28)}).parse(query);
 if(Boolean(raw.fromDate)!==Boolean(raw.toDate))throw proposalError(400,'Συμπλήρωσε και τις δύο ημερομηνίες πωλήσεων.');
 const today=greeceDateInput(now),toDate=raw.toDate||today,fromDate=raw.fromDate||shiftDate(today,1-raw.historyDays);
 const from=greeceRangeDate(fromDate),toExclusive=greeceRangeDate(shiftDate(toDate,1));greeceRangeDate(toDate);
 const days=(Date.parse(toDate+'T00:00:00Z')-Date.parse(fromDate+'T00:00:00Z'))/86400000+1;
 if(!Number.isInteger(days)||days<1||days>366||toDate>today)throw proposalError(400,'Επίλεξε περίοδο πωλήσεων 1–366 ημερών, έως σήμερα.');
 return {supplierId:raw.supplierId,options:{historyDays:days,coverageDays:raw.coverageDays,leadDays:raw.leadDays},salesPeriod:{from,toExclusive},period:{fromDate,toDate,days,timeZone:'Europe/Athens'}};
}
// Estimate coverage between deliveries from distinct local receipt days.
export function estimateReceiptCadence(days, today){
 const uniqueDays=[...new Set(days)].sort();
 if(uniqueDays.length<4)return null;
 const toDay=date=>Date.parse(date+'T00:00:00Z')/86400000;
 const gaps=uniqueDays.slice(1).map((day,index)=>toDay(day)-toDay(uniqueDays[index])).sort((a,b)=>a-b);
 const middle=Math.floor(gaps.length/2);
 const coverageDays=Math.ceil(gaps.length%2?gaps[middle]:(gaps[middle-1]+gaps[middle])/2);
 const latestReceipt=uniqueDays.at(-1);
 if(coverageDays<1||coverageDays>60||toDay(today)-toDay(latestReceipt)>Math.max(14,coverageDays*2))return null;
 return {coverageDays,receiptDays:uniqueDays.length,latestReceipt};
}

export async function readPosProposalSuppliers(db,{storeId,companyId,includeCadence=false,now=new Date()}){
 const rows=await db.$queryRaw`SELECT s."id",s."name",s."email" FROM "Supplier" s WHERE s."companyId"=${companyId} AND s."active"=TRUE AND (
  EXISTS(SELECT 1 FROM "PurchaseOrder" o WHERE o."companyId"=${companyId} AND o."storeId"=${storeId} AND o."supplierId"=s."id")
  OR EXISTS(SELECT 1 FROM "PurchaseDocument" d WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."supplierId"=s."id" AND d."status"='APPROVED' AND d."documentType"='INVOICE')) ORDER BY s."name",s."id" LIMIT 1001`;
 if(rows.length>1000)throw proposalError(422,'Η λίστα προμηθευτών υπερβαίνει το όριο προβολής.');
 if(!includeCadence||!rows.length)return rows;
 const today=greeceDateInput(now);
 const from=greeceRangeDate(shiftDate(today,-55)).toISOString().slice(0,-1);
 const until=now.toISOString().slice(0,-1);
 const receipts=await db.$queryRaw`
  SELECT DISTINCT o."supplierId", ((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Athens')::date::text AS day
  FROM "PurchaseOrder" o
  JOIN "StockMovement" m ON m."sourceId"=o."id" AND m."storeId"=o."storeId"
  WHERE o."companyId"=${companyId} AND o."storeId"=${storeId}
    AND o."supplierId" IS NOT NULL AND o."status" IN ('FINAL','INVOICED')
    AND m."sourceType"='PURCHASE_ORDER' AND m."movementType"='PURCHASE' AND m."quantity">0
    AND m."createdAt">=${from}::timestamp AND m."createdAt"<=${until}::timestamp`;
 const daysBySupplier=new Map();
 for(const receipt of receipts){
  if(!daysBySupplier.has(receipt.supplierId))daysBySupplier.set(receipt.supplierId,[]);
  daysBySupplier.get(receipt.supplierId).push(receipt.day);
 }
 return rows.map(supplier=>({...supplier,receiptCadence:estimateReceiptCadence(daysBySupplier.get(supplier.id)||[],today)}));
}
export async function readPosOrderProposal(db,scope){
 return db.$transaction(async tx=>{
  const suppliers=await readPosProposalSuppliers(tx,scope),supplier=scope.supplierId?suppliers.find(s=>s.id===scope.supplierId):null;
  if(scope.supplierId&&!supplier)throw proposalError(404,'Δεν βρέθηκε ενεργός προμηθευτής του καταστήματος.');
  const proposal=await readOrderSuggestions(tx,scope);
  let rows=proposal.rows;
  if(supplier){
   const matches=await tx.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${scope.storeId} AND sp."active"=TRUE WHERE p."companyId"=${scope.companyId} AND p."active"=TRUE AND (
    EXISTS(SELECT 1 FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" WHERE l."productId"=p."id" AND d."companyId"=${scope.companyId} AND d."storeId"=${scope.storeId} AND d."supplierId"=${supplier.id} AND d."status"='APPROVED' AND d."documentType"='INVOICE' AND l."quantity">0)
    OR EXISTS(SELECT 1 FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId" WHERE l."productId"=p."id" AND o."companyId"=${scope.companyId} AND o."storeId"=${scope.storeId} AND o."supplierId"=${supplier.id} AND o."status"='FINAL' AND o."awaitingInvoice"=FALSE AND l."quantity">0))`;
   const ids=new Set(matches.map(x=>x.id));rows=rows.filter(r=>ids.has(r.productId));
  }
  const candidates=rows.filter(row=>row.suggestedQuantity>0||row.suggestedQuantity==null);
  const purchases=candidates.length?await tx.$queryRaw`
   WITH receipt_costs AS (
    SELECT l."productId",s."id" AS "supplierId",s."name" AS "supplierName",
     d."documentDate" AS date,d."id" AS document,l."id" AS line,
     CASE WHEN posted.pack>1 THEN posted.pack WHEN l."unit"='PACKAGE' THEN NULLIF(l."unitsPerPackage",0) ELSE 1 END AS pack,
     l."netAmount"/NULLIF(l."quantity",0) AS "invoiceUnitCost"
    FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
    JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" AND s."active"=TRUE
    LEFT JOIN LATERAL (
     SELECT CASE WHEN count(*)=1 AND max(o."quantity")=l."quantity"
      AND bool_and(o."invoiceUnit"='PACKAGE') THEN max(o."stockUnitsPerInvoiceUnit") END AS pack
     FROM "PurchaseOrderPosting" po JOIN "PurchaseOrder" ord ON ord."id"=po."orderId"
     JOIN "PurchaseOrderLine" o ON o."orderId"=ord."id" AND o."productId"=l."productId"
     WHERE po."purchaseDocumentId"=d."id" AND po."companyId"=d."companyId" AND po."supplierId"=s."id"
      AND ord."companyId"=d."companyId" AND ord."storeId"=d."storeId"
    ) posted ON TRUE
    WHERE d."companyId"=${scope.companyId} AND d."storeId"=${scope.storeId} AND d."status"='APPROVED'
     AND d."documentType"='INVOICE' AND l."quantity">0 AND l."productId"=ANY(${candidates.map(row=>row.productId)}::text[])
     AND (${supplier?.id??''}='' OR d."supplierId"=${supplier?.id??''})
   ), ranked AS (
    SELECT *,row_number() OVER (PARTITION BY "productId" ORDER BY date DESC NULLS LAST,document DESC,line DESC) AS latest,
     row_number() OVER (PARTITION BY "productId","supplierId",(pack>1) ORDER BY date DESC NULLS LAST,document DESC,line DESC) AS supplier_rank
    FROM receipt_costs
   )
   SELECT "productId","supplierId","supplierName",pack,"invoiceUnitCost",latest::int
   FROM ranked WHERE latest=1 OR (pack>1 AND supplier_rank=1)`:[];
  const byProduct=new Map(purchases.filter(row=>row.latest===1).map(row=>[row.productId,row]));
  const priorPacks=new Map(purchases.filter(row=>Number(row.pack)>1).map(row=>[supplierMinimumKey(row.supplierId,row.productId),row]));
  const [minimumSchema]=await tx.$queryRaw`SELECT to_regclass('"ManagementParameters"') IS NOT NULL AS ready`;
  const [configuration]=minimumSchema?.ready?await tx.$queryRaw`
   SELECT "settings"->${supplierMinimumSection} AS minimums FROM "ManagementParameters" WHERE "companyId"=${scope.companyId}`:[];
  rows=candidates.map(row=>{
   const purchase=byProduct.get(row.productId);
   const priorPack=purchase?priorPacks.get(supplierMinimumKey(purchase.supplierId,row.productId)):null;
   const conflict=Boolean(purchase&&Number(purchase.pack)===1&&priorPack
    && purchase.invoiceUnitCost!=null&&priorPack.invoiceUnitCost!=null
    && Number(purchase.invoiceUnitCost)===Number(priorPack.invoiceUnitCost));
   const basis=conflict?priorPack:purchase;
   const pack=Number(basis?.pack)>1?Number(basis.pack):null;
   const cost=basis?.invoiceUnitCost!=null&&Number(basis.pack)>0?Number(basis.invoiceUnitCost)/Number(basis.pack):null;
   const supplierId=supplier?.id??purchase?.supplierId??null;
   const configured=supplierId?configuration?.minimums?.[supplierMinimumKey(supplierId,row.productId)]:null;
   const minimum=Number.isFinite(configured)&&configured>0&&configured<=100000000?configured:null;
   return {...row,supplierPack:pack,supplierMinimum:minimum,requiredQuantity:row.suggestedQuantity,
    suggestedQuantity:roundSupplierQuantity(row.suggestedQuantity,pack,minimum??0),
    orderSupplierId:supplierId,
    orderSupplierName:supplier?.name??purchase?.supplierName??null,
    orderUnitCost:Number.isFinite(cost)&&cost>=0?cost:null,
    orderPackageCost:pack&&cost!=null?Number(basis.invoiceUnitCost):null,
    warnings:[...row.warnings,...(conflict?['Η τελευταία αγορά γράφει τεμάχιο με ίδια τιμή κιβωτίου. Η εκτίμηση χρησιμοποιεί την προηγούμενη καταγεγραμμένη συσκευασία. Επιβεβαίωσε πριν την αποστολή.']:[])]};
  });
  const alarmState=await readWeeklyStockAlarmState(tx,scope);
  return {...proposal,supplierMinimumAvailable:minimumSchema?.ready===true,storeName:scope.storeName,period:scope.period,supplier,rows:rows.filter(r=>r.suggestedQuantity>0||r.suggestedQuantity==null),supplierBasis:'STORE_PURCHASE_HISTORY',automaticAlarm:alarmState.enabled,alarmState};
 },{isolationLevel:'RepeatableRead',timeout:30000});
}
export function createPosProposalSnapshots({now=()=>Date.now(),ttl=600000,maxEntries=20,maxBytes=16777216}={}){
 const entries=new Map();let bytes=0;
 const remove=id=>{const x=entries.get(id);if(x){bytes-=x.bytes;entries.delete(id)}};
 return {
  create(report,scope){
   for(const [id,x] of entries)if(x.expires<=now())remove(id);
   const copy=JSON.parse(JSON.stringify(report)),size=Buffer.byteLength(JSON.stringify(copy));
   if(size>2097152||size>maxBytes)throw proposalError(422,'Η πρόταση είναι πολύ μεγάλη. Επίλεξε προμηθευτή για μικρότερη προβολή.');
   while(entries.size>=maxEntries||bytes+size>maxBytes){const key=[...entries].find(([,x])=>x.state!=='sending')?.[0];if(!key)throw proposalError(503,'Υπάρχουν αποστολές σε εξέλιξη. Προσπάθησε αργότερα.');remove(key)}
   const id=randomUUID(),entry={report:copy,...scope,expires:now()+ttl,state:'ready',bytes:size};entries.set(id,entry);bytes+=size;return {id,report:copy};
  },
  get(id,scope){const x=entries.get(id);if(!x||x.expires<=now()||['companyId','storeId','actorId'].some(k=>x[k]!==scope[k]))throw proposalError(409,'Η πρόταση έληξε ή δεν ανήκει σε αυτή τη συνεδρία. Υπολόγισέ την ξανά.');return x;}
 };
}
