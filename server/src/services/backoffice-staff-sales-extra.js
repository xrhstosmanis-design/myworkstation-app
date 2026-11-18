import {requireStaffGrant,staffError} from './backoffice-staff-access.js';
import {staffRequestCapability} from '../../../shared/backoffice-staff.mjs';
import {greeceRangeDate} from '../../../shared/greece-time.mjs';
const invalid=()=>{throw staffError(400,'STAFF_SALES_QUERY_INVALID','Έλεγξε το ακριβές διάστημα ημερομηνιών.')};
const bad=()=>{throw staffError(503,'STAFF_SALES_DATA_INVALID')};
const scalar=value=>{if(typeof value!=='number'||!Number.isFinite(value))bad();return value};
const text=(value,nullable=false)=>{if(nullable&&value===null)return value;if(typeof value!=='string')bad();return value};
const iso=value=>{if(value===null||value===undefined||!(value instanceof Date)&&typeof value!=='string')bad();const d=new Date(value);if(!Number.isFinite(d.getTime()))bad();return d.toISOString()};
const pick=(row,keys)=>{if(!row||keys.some(key=>!Object.hasOwn(row,key)))bad();return Object.fromEntries(keys.map(key=>[key,row[key]]))};
function calendar(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid();const d=new Date(value+'T00:00:00.000Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)invalid();return value}
function instant(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))invalid();calendar(value.slice(0,10));const d=new Date(value);if(!Number.isFinite(d.getTime()))invalid();return d}
export async function readStaffSalesExtra(db,req){
 const path=String(req.originalUrl||'').split('?')[0],capability=staffRequestCapability(req.method,path),companyId=req.user?.companyId,storeId=req.user?.storeId;
 if(req.method!=='GET'||req.user?.staffAccess!==true||!['unsold-products.read','sales-journal.read'].includes(capability)||req.staffGrant?.capability!==capability||req.get('x-backoffice-store-id')!==storeId||req.get('x-backoffice-company-id')!==undefined||req.headers?.['transfer-encoding']||Number(req.headers?.['content-length']||0)>0||req.body&&Object.keys(req.body).length)throw staffError();
 const query=req.query;if(!query||typeof query!=='object'||Array.isArray(query)||Reflect.ownKeys(query).length!==3||!['storeId','from','to'].every(k=>Object.hasOwn(query,k)&&typeof query[k]==='string')||query.storeId!==storeId)invalid();
 const from=capability==='unsold-products.read'?greeceRangeDate(calendar(query.from)):instant(query.from),to=capability==='unsold-products.read'?greeceRangeDate(calendar(query.to),true):instant(query.to);
 if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)invalid();
 const before=await requireStaffGrant(db,req.user,storeId,capability);let payload;
 if(capability==='unsold-products.read'){
  const raw=await db.$queryRaw`SELECT p."id",p."sku",p."name" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId} JOIN "Store" st ON st."id"=sp."storeId" AND st."companyId"=p."companyId" AND st."active"=true WHERE sp."storeId"=${storeId} AND sp."active"=true AND p."active"=true AND NOT EXISTS(SELECT 1 FROM "SaleLine" l JOIN "Sale" s ON s."id"=l."saleId" WHERE l."productId"=p."id" AND s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."status"='COMPLETED' AND s."occurredAt">=${from} AND s."occurredAt"<=${to}) ORDER BY p."name",p."sku",p."id" LIMIT 10001`;
  if(raw.length>10000)throw staffError(503,'STAFF_SALES_LIMIT','Το πλήρες αποτέλεσμα υπερβαίνει το όριο προβολής.');
  const products=raw.map(row=>{const v=pick(row,['id','sku','name']);text(v.id);text(v.sku,true);text(v.name);return v});
  payload={from:query.from,to:query.to,products,complete:true,limit:10000};
 }else payload=await journal(db,companyId,storeId,from,to);
 const after=await requireStaffGrant(db,req.user,storeId,capability);if(before.account.revision!==after.account.revision||before.grant.revision!==after.grant.revision)throw staffError();
 return {scope:'STORE',companyId,storeId,...payload};
}
const money=value=>Number(value||0),methodLabel=method=>method==='CASH'?'ΜΕΤΡΗΤΑ':method==='CARD'?'ΚΑΡΤΑ':method==='IRIS'?'IRIS':String(method||'ΠΛΗΡΩΜΗ');
const audienceLabel=value=>({NORMAL:'Κανονική τιμή',DOCTOR:'Ιατρός',NURSE:'Νοσηλευτής / Νοσοκόμος',STAFF:'Προσωπικό',CUSTOMER:'Πελάτης'}[value]||value);
const euro=value=>`${Number(value||0).toFixed(2).replace('.',',')} €`;
async function journal(db,companyId,storeId,from,to){
 const raw=await db.$queryRaw`SELECT s."id",s."receiptNumber",s."total"::double precision AS total,s."subtotal"::double precision AS subtotal,s."discount"::double precision AS discount,s."audience",s."occurredAt",s."createdAt",s."status",s."transactionMode",s."delayedReason",s."reversalState",s."reversalKind",original."id" AS "originalSaleId",(s."originalSaleId" IS NOT NULL AND original."id" IS NULL) AS "originalSaleUnavailable",s."fiscalStatus",s."source",st."name" AS "storeName",c."name" AS "customerName",COALESCE((SELECT tx."actorName" FROM "StoreTransaction" tx WHERE tx."companyId"=s."companyId" AND tx."storeId"=s."storeId" AND COALESCE(tx."description",'') LIKE ('%'||s."id"||'%') ORDER BY tx."occurredAt",tx."id" LIMIT 1),'Πωλητής') AS "actorName",COALESCE((SELECT json_agg(json_build_object('method',p."method",'amount',p."amount"::double precision) ORDER BY p."createdAt",p."id") FROM "Payment" p WHERE p."saleId"=s."id"),'[]'::json) AS payments,COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',product."id",'productUnavailable',l."productId" IS NOT NULL AND product."id" IS NULL,'description',l."description",'quantity',l."quantity"::double precision,'unitPrice',l."unitPrice"::double precision,'lineTotal',l."lineTotal"::double precision) ORDER BY l."createdAt",l."id") FROM "SaleLine" l LEFT JOIN "Product" product ON product."id"=l."productId" AND product."companyId"=s."companyId" WHERE l."saleId"=s."id"),'[]'::json) AS lines FROM "Sale" s JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId" LEFT JOIN "Customer" c ON c."id"=s."customerId" AND c."companyId"=s."companyId" LEFT JOIN "Sale" original ON original."id"=s."originalSaleId" AND original."companyId"=s."companyId" AND original."storeId"=s."storeId" WHERE s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."occurredAt">=${from} AND s."occurredAt"<=${to} AND s."source" IN ('POS','EXCHANGE','POS_REVERSAL') ORDER BY s."occurredAt" DESC,s."id" LIMIT 500`;
 if(raw.length>500)bad();const rows=raw.map(row=>{
  const v=pick(row,['id','receiptNumber','total','subtotal','discount','audience','occurredAt','createdAt','status','transactionMode','delayedReason','reversalState','reversalKind','originalSaleId','originalSaleUnavailable','fiscalStatus','source','storeName','customerName','actorName','payments','lines']);
  for(const k of ['id','status','source','storeName','actorName'])text(v[k]);for(const k of ['receiptNumber','transactionMode','delayedReason','reversalState','reversalKind','originalSaleId','fiscalStatus','customerName'])text(v[k],true);
  if(!['POS','EXCHANGE','POS_REVERSAL'].includes(v.source)||typeof v.originalSaleUnavailable!=='boolean'||v.originalSaleUnavailable&&v.originalSaleId!==null)bad();
  for(const k of ['total','subtotal','discount'])v[k]=v[k]===null?0:scalar(v[k]);v.occurredAt=iso(v.occurredAt);v.createdAt=iso(v.createdAt);v.audience=text(v.audience||'NORMAL');
  if(!Array.isArray(v.payments)||!Array.isArray(v.lines)||v.payments.length>10000||v.lines.length>10000)bad();
  v.payments=v.payments.map(row=>{const p=pick(row,['method','amount']);text(p.method);scalar(p.amount);return p});
  v.lines=v.lines.map(row=>{const l=pick(row,['id','productId','productUnavailable','description','quantity','unitPrice','lineTotal']);text(l.id);text(l.productId,true);text(l.description);if(typeof l.productUnavailable!=='boolean'||l.productUnavailable&&l.productId!==null)bad();for(const k of ['quantity','unitPrice','lineTotal'])scalar(l[k]);return l});
  const paymentSummary=v.payments.length>1?`ΜΙΚΤΗ · ${v.payments.map(p=>`${methodLabel(p.method)} ${euro(p.amount)}`).join(' + ')}`:v.payments[0]?`${methodLabel(v.payments[0].method)} ${euro(v.payments[0].amount)}`:'ΧΩΡΙΣ ΠΛΗΡΩΜΗ';
  v.productSummary=v.lines.length?v.lines.map(l=>`${Math.abs(l.quantity)}× ${l.description}`).join(' · '):'Χωρίς προϊόντα';v.audienceLabel=audienceLabel(v.audience);const withAudience=`${v.audienceLabel} · ${paymentSummary}`;v.paymentSummary=v.transactionMode==='INTERNAL_RETURN_PENDING_RBS'?`${withAudience} · Εκκρεμεί φορολογική επιστροφή RBS`:withAudience;v.paymentMethod=`${v.productSummary} · ${withAudience}`;v.movementType=v.source==='POS_REVERSAL'?(v.reversalKind==='CANCEL'?'CANCEL':'RETURN'):v.source==='EXCHANGE'?'EXCHANGE':'SALE';return v;
 });return {from:from.toISOString(),to:to.toISOString(),rows,window:{limit:500,kind:'NATIVE_JOURNAL'}};
}
