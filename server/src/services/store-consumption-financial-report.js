import {Prisma} from '@prisma/client';
import {financialReportFilters} from './store-financial-reports.js';
import {operationalFinancialReports} from '../../../shared/financial-consumption.mjs';

const fail=()=>{throw Object.assign(new Error('Μη έγκυρη πηγή καταστροφών / ιδιοκατανάλωσης.'),{status:503})};
const decimal=value=>{
  if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()==='')return null;
  try{const n=new Prisma.Decimal(String(value));return n.isFinite()&&n.gte(0)?n:null}catch{return null}
};
const amount=value=>{if(value===null)return null;const result=value.toDecimalPlaces(2).toNumber();if(!Number.isFinite(result)||Math.abs(result)>Number.MAX_SAFE_INTEGER/100)fail();return result};
const sum=(rows,key)=>rows.some(r=>r[key]===null)?null:amount(rows.reduce((a,r)=>a.plus(r[key]),new Prisma.Decimal(0)));
const text=v=>typeof v==='string'?v.slice(0,500):null;
export function consumptionFinancialFilters(query){
  const f=financialReportFilters({...query,report:'monthly'});
  return {...f,fromDay:query.from,toDay:query.to};
}

// Read only. Immutable POS sale lines and separately identified product-card
// WASTE movements are disjoint sources. Never value old events at today's price.
export async function readStoreConsumptionFinancialReport(db,{companyId,storeId,report,filters,now=new Date()}){
  const kind=operationalFinancialReports[report]?.source;
  if(!companyId||!storeId||!kind)throw Object.assign(new Error('Επίλεξε κατάστημα και αναφορά.'),{status:400});
  const {start,end,fromDay,toDay,search=''}=filters;
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail();
  const raw=await db.$queryRaw`
    WITH entries AS (
      SELECT sl."id",sa."companyId",sa."storeId",sa."occurredAt" AS "createdAt",
        sl."productId",sl."description" AS name,p."sku",p."unit",sl."quantity",
        sl."unitPrice" AS "salePrice",NULL::numeric AS "recordedCost",
        audit."actorName" AS "operatorName",audit."reason" AS note,'POS'::text AS source
      FROM "Sale" sa JOIN "SaleLine" sl ON sl."saleId"=sa."id"
      LEFT JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=sa."companyId"
      LEFT JOIN LATERAL (
        SELECT a."actorName",a."reason" FROM "PosSaleActionAudit" a
        WHERE a."companyId"=sa."companyId" AND a."storeId"=sa."storeId"
          AND a."saleId"=sa."id" AND a."actionType"=${kind}
        ORDER BY a."createdAt" DESC,a."id" DESC LIMIT 1
      ) audit ON true
      WHERE sa."companyId"=${companyId} AND sa."storeId"=${storeId}
        AND sa."status"='COMPLETED' AND sa."source"=${kind}
        AND sa."occurredAt">=${start} AND sa."occurredAt"<${end} AND sa."occurredAt"<=${now}
      UNION ALL
      SELECT sm."id",s."companyId",sm."storeId",sm."createdAt",sm."productId",
        p."name",p."sku",p."unit",-sm."quantity",NULL::numeric,sm."unitCost",
        u."fullName",sm."note",'PRODUCT_CARD'::text
      FROM "StockMovement" sm JOIN "Store" s ON s."id"=sm."storeId" AND s."companyId"=${companyId}
      JOIN "Product" p ON p."id"=sm."productId" AND p."companyId"=s."companyId"
      LEFT JOIN "User" u ON u."id"=sm."createdByUserId" AND u."companyId"=s."companyId"
      WHERE ${kind}='PRODUCT_DESTRUCTION' AND sm."storeId"=${storeId}
        AND sm."movementType"='WASTE' AND sm."sourceType"='PRODUCT_CARD' AND sm."quantity"<0
        AND sm."createdAt">=${start} AND sm."createdAt"<${end} AND sm."createdAt"<=${now}
    )
    SELECT entries.*,CASE WHEN source='PRODUCT_CARD' THEN "recordedCost" ELSE lp.cost END AS "purchasePrice",
      lp."documentId" AS "purchaseDocumentId",lp."documentDate" AS "purchaseDate"
    FROM entries
    LEFT JOIN LATERAL (
      SELECT d."id" AS "documentId",d."documentDate",
        CASE WHEN bool_and(COALESCE(l."quantity">0 AND l."netAmount">=0 AND
          (l."unit"<>'PACKAGE' OR l."unitsPerPackage">0),false))
        THEN SUM(l."netAmount")/NULLIF(SUM(l."quantity"*CASE WHEN l."unit"='PACKAGE' THEN l."unitsPerPackage" ELSE 1 END),0)
        ELSE NULL END AS cost
      FROM "PurchaseDocument" d JOIN "PurchaseDocumentLine" l ON l."purchaseDocumentId"=d."id"
      WHERE d."companyId"=entries."companyId" AND d."storeId"=entries."storeId"
        AND d."status"='APPROVED' AND d."documentType"='INVOICE' AND l."productId"=entries."productId"
        AND d."documentDate"<=entries."createdAt" AND d."createdAt"<=entries."createdAt"
      GROUP BY d."id",d."documentDate",d."createdAt"
      ORDER BY d."documentDate" DESC,d."createdAt" DESC,d."id" DESC LIMIT 1
    ) lp ON entries.source='POS'
    WHERE (${search}='' OR strpos(lower(entries.name),lower(${search}))>0 OR entries."sku"=${search})
    ORDER BY entries."createdAt" DESC,entries.source,entries."id" LIMIT 1001`;
  if(!Array.isArray(raw))fail();
  const truncated=raw.length>1000,seen=new Set();
  const rows=raw.slice(0,1000).map(r=>{
    const quantity=decimal(r.quantity),purchase=decimal(r.purchasePrice),sale=decimal(r.salePrice),at=new Date(r.createdAt);
    const id=`${r.source}:${r.id}`;
    if(r.companyId!==companyId||r.storeId!==storeId||!['POS','PRODUCT_CARD'].includes(r.source)||
      report==='self-consumption'&&r.source!=='POS'||typeof r.id!=='string'||!r.id||seen.has(id)||
      !quantity?.gt(0)||!Number.isFinite(at.getTime())||at<start||at>=end||at>now||!text(r.name))fail();
    seen.add(id);
    const purchaseTotal=amount(purchase?.mul(quantity)??null),saleTotal=amount(sale?.mul(quantity)??null);
    if([quantity.toNumber(),purchaseTotal,saleTotal].some(v=>v!==null&&(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER/100)))fail();
    return {id,createdAt:at.toISOString(),productId:text(r.productId),name:text(r.name),sku:text(r.sku),unit:text(r.unit),
      quantity:quantity.toNumber(),purchasePrice:purchase?.toNumber()??null,salePrice:sale?.toNumber()??null,purchaseTotal,saleTotal,
      operatorName:text(r.operatorName),note:text(r.note),source:r.source,
      purchaseDocumentId:text(r.purchaseDocumentId),purchaseDate:r.purchaseDate?new Date(r.purchaseDate).toISOString():null};
  });
  const missingPurchase=rows.filter(r=>r.purchaseTotal===null).length,missingSale=rows.filter(r=>r.saleTotal===null).length;
  return {companyId,storeId,report,from:fromDay,to:toDay,timeZone:'Europe/Athens',asOf:now.toISOString(),periodComplete:end<=now,rows,truncated,limit:1000,
    missingPurchase,missingSale,totalPurchase:truncated?null:sum(rows,'purchaseTotal'),totalSale:truncated?null:sum(rows,'saleTotal'),
    purchaseBasis:'Τελευταίο διαθέσιμο εγκεκριμένο τιμολόγιο πριν την κίνηση, καθαρή αξία μετά εκπτώσεων ανά μονάδα. Για καταστροφή καρτέλας: καταγεγραμμένο κόστος κίνησης.',
    saleBasis:'Καταγεγραμμένη τιμή POS κατά την κίνηση. Η αξία αναφοράς δεν αποτελεί τζίρο ή είσπραξη.'};
}
