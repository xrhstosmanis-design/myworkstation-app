import {staffError} from './backoffice-staff-access.js';
import {greeceRangeDate} from '../../../shared/greece-time.mjs';
export const companyPartyReportCapabilities=Object.freeze(['reports-supplier-invoices.read','reports-supplier-payments.read','reports-supplier-purchases.read','reports-customer-turnover.read']);
const invalid=()=>{throw staffError(400,'STAFF_PARTY_REPORT_QUERY_INVALID')};
const bad=()=>{throw staffError(503,'STAFF_PARTY_REPORT_DATA_INVALID')};
const text=(v,nullable=false)=>{if(nullable&&v===null)return null;if(typeof v!=='string'||v.length>10000)bad();return v};
const number=(v,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||integer&&(!Number.isSafeInteger(v)||v<0))bad();return v};
const date=(v,nullable=false)=>{if(nullable&&v===null)return null;if(!(v instanceof Date)&&typeof v!=='string')bad();const d=new Date(v);if(!Number.isFinite(d.getTime()))bad();return d.toISOString()};
const fields=(r,required,nullable=[],numbers=[],dates=[],nullableDates=[])=>Object.fromEntries([...required.map(k=>[k,text(r[k])]),...nullable.map(k=>[k,text(r[k],true)]),...numbers.map(k=>[k,number(r[k])]),...dates.map(k=>[k,date(r[k])]),...nullableDates.map(k=>[k,date(r[k],true)])]);
const bound=(rows,limit)=>{if(!Array.isArray(rows)||rows.length>limit)throw staffError(503,'STAFF_PARTY_REPORT_LIMIT');return rows};
function day(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid();const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)invalid();return value}
export function companyPartyReportFilters(query,capability){
 if(!companyPartyReportCapabilities.includes(capability)||!query||typeof query!=='object'||Array.isArray(query))invalid();
 const customer=capability==='reports-customer-turnover.read',search=['reports-supplier-invoices.read','reports-supplier-payments.read'].includes(capability),partyKey=customer?'customerId':'supplierId',allowed=['from','to',partyKey,...(search?['q']:[])];
 if(Reflect.ownKeys(query).some(k=>!allowed.includes(k)||typeof query[k]!=='string'))invalid();
 const fromDay=day(query.from),toDay=day(query.to),from=greeceRangeDate(fromDay),to=new Date(greeceRangeDate(toDay,true).getTime()+1),partyId=query[partyKey]??null,q=query.q??'';
 if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to||partyId!==null&&(!partyId||partyId.length>160||partyId.trim()!==partyId||/[\u0000-\u001f\u007f]/.test(partyId))||q.length>120||q.trim()!==q||/[\u0000-\u001f\u007f]/.test(q))invalid();
 return {customer,search,partyKey,partyId,fromDay,toDay,from,to,q,text:q?`%${q}%`:null};
}
export async function readCompanyPartyReport(db,c,cap,query){
 const f=companyPartyReportFilters(query,cap);
 const check=async()=>{if(!f.partyId)return;const found=f.customer?await db.$queryRaw`SELECT "id" FROM "Customer" WHERE "id"=${f.partyId} AND "companyId"=${c} LIMIT 1`:await db.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${f.partyId} AND "companyId"=${c} LIMIT 1`;if(found.length!==1||found[0].id!==f.partyId)throw staffError(404,'STAFF_PARTY_REPORT_PARTY_NOT_FOUND')};
 await check();let payload;
 if(cap==='reports-supplier-invoices.read')payload=await invoices(db,c,f);
 else if(cap==='reports-supplier-payments.read')payload=await payments(db,c,f);
 else if(cap==='reports-supplier-purchases.read')payload=await purchases(db,c,f);
 else payload=await turnover(db,c,f);
 await check();return {from:f.fromDay,to:f.toDay,[f.partyKey]:f.partyId,...(f.search?{q:f.q}:{}),...payload};
}
async function invoices(db,c,f){
 const raw=await db.$queryRaw`SELECT d."id",d."documentType",d."documentNumber",d."documentDate",d."totalNet"::double precision AS "totalNet",d."totalVat"::double precision AS "totalVat",d."totalGross"::double precision AS "totalGross",d."status",d."sourceType",s."id" AS "supplierId",s."name" AS "supplierName",s."supplierCategory",st."name" AS "storeName" FROM "PurchaseDocument" d LEFT JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" JOIN "Store" st ON st."id"=d."storeId" AND st."companyId"=d."companyId" WHERE d."companyId"=${c} AND d."documentDate">=${f.from} AND d."documentDate"<${f.to} AND (${f.partyId}::text IS NULL OR d."supplierId"=${f.partyId}) AND (${f.text}::text IS NULL OR COALESCE(d."documentNumber",'') ILIKE ${f.text} OR COALESCE(s."name",'') ILIKE ${f.text}) ORDER BY d."documentDate" DESC,d."id" LIMIT 3000`;
 const items=bound(raw,3000).map(r=>fields(r,['id','documentType','status','sourceType','storeName'],['documentNumber','supplierId','supplierName','supplierCategory'],['totalNet','totalVat','totalGross'],['documentDate']));
 const summary=items.reduce((s,r)=>({count:s.count+1,net:number(s.net+r.totalNet),vat:number(s.vat+r.totalVat),gross:number(s.gross+r.totalGross)}),{count:0,net:0,vat:0,gross:0});return {items,count:items.length,summary,window:{limit:3000,kind:'NATIVE_WINDOW'}};
}
async function payments(db,c,f){
 const raw=await db.$queryRaw`SELECT t."id",t."occurredAt",t."amount"::double precision AS amount,t."description",t."actorName",t."reversedAt",t."attachmentFilename",s."id" AS "supplierId",COALESCE(s."name",t."supplierName") AS "supplierName",s."taxId",st."name" AS "storeName" FROM "StoreTransaction" t JOIN "Store" st ON st."id"=t."storeId" AND st."companyId"=t."companyId" LEFT JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId" WHERE t."companyId"=${c} AND t."type"='SUPPLIER_PAYMENT' AND t."occurredAt">=${f.from} AND t."occurredAt"<${f.to} AND (${f.partyId}::text IS NULL OR t."supplierId"=${f.partyId}) AND (${f.text}::text IS NULL OR COALESCE(t."description",'') ILIKE ${f.text} OR COALESCE(s."name",t."supplierName",'') ILIKE ${f.text}) ORDER BY t."occurredAt" DESC,t."id" LIMIT 3000`;
 const items=bound(raw,3000).map(r=>fields(r,['id','storeName'],['description','actorName','attachmentFilename','supplierId','supplierName','taxId'],['amount'],['occurredAt'],['reversedAt']));
 const summary=items.reduce((s,r)=>({count:s.count+1,total:r.reversedAt===null?number(s.total+r.amount):s.total,reversed:s.reversed+(r.reversedAt===null?0:1)}),{count:0,total:0,reversed:0});return {items,count:items.length,summary,window:{limit:3000,kind:'NATIVE_WINDOW'}};
}
async function purchases(db,c,f){
 const raw=await db.$queryRaw`SELECT s."id" AS "supplierId",s."name" AS "supplierName",COUNT(d."id")::int AS documents,COALESCE(SUM(d."totalNet"),0)::double precision AS net,COALESCE(SUM(d."totalVat"),0)::double precision AS vat,COALESCE(SUM(d."totalGross"),0)::double precision AS gross FROM "PurchaseDocument" d JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" JOIN "Store" st ON st."id"=d."storeId" AND st."companyId"=d."companyId" WHERE d."companyId"=${c} AND d."status"='APPROVED' AND d."documentDate">=${f.from} AND d."documentDate"<${f.to} AND (${f.partyId}::text IS NULL OR d."supplierId"=${f.partyId}) GROUP BY s."id",s."name" ORDER BY gross DESC,s."id" LIMIT 10001`;
 const items=bound(raw,10000).map(r=>{const v=fields(r,['supplierId','supplierName'],[],['documents','net','vat','gross']);number(v.documents,true);return v});
 const summary=items.reduce((s,r)=>({documents:number(s.documents+r.documents,true),net:number(s.net+r.net),vat:number(s.vat+r.vat),gross:number(s.gross+r.gross)}),{documents:0,net:0,vat:0,gross:0});for(const r of items)r.percentOfTotal=summary.gross===0?null:number(r.gross/summary.gross*100);
 return {items,count:items.length,summary,basis:'APPROVED_DOCUMENT_AMOUNTS',note:'Τα ποσά διατηρούν το πρόσημο των εγκεκριμένων παραστατικών της πηγής· δεν αποτελούν συμφωνημένο υπόλοιπο προμηθευτή.',window:{limit:10000,kind:'COMPLETE_FILTERED_GROUPS'}};
}
async function turnover(db,c,f){
 const raw=await db.$queryRaw`SELECT customer."id" AS "customerId",customer."name" AS "customerName",customer."taxId",COUNT(DISTINCT s."id") FILTER(WHERE COALESCE(s."source",'')<>'POS_REVERSAL')::int AS visits,COALESCE(SUM(s."subtotal"),0)::double precision AS subtotal,COALESCE(SUM(s."discount"),0)::double precision AS discount,COALESCE(SUM(s."total"),0)::double precision AS turnover,ABS(COALESCE(SUM(s."total") FILTER(WHERE s."source"='POS_REVERSAL'),0))::double precision AS returns,COUNT(*) FILTER(WHERE s."source"='POS_REVERSAL')::int AS "reversalCount" FROM "Sale" s JOIN "Customer" customer ON customer."id"=s."customerId" AND customer."companyId"=s."companyId" JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId" WHERE s."companyId"=${c} AND s."status"='COMPLETED' AND s."occurredAt">=${f.from} AND s."occurredAt"<${f.to} AND (${f.partyId}::text IS NULL OR customer."id"=${f.partyId}) GROUP BY customer."id",customer."name",customer."taxId" ORDER BY turnover DESC,customer."id" LIMIT 10001`;
 const items=bound(raw,10000).map(r=>{const v=fields(r,['customerId','customerName'],['taxId'],['visits','subtotal','discount','turnover','returns','reversalCount']);number(v.visits,true);number(v.reversalCount,true);return v});
 const summary=items.reduce((s,r)=>({customers:s.customers+1,visits:number(s.visits+r.visits,true),turnover:number(s.turnover+r.turnover),discount:number(s.discount+r.discount),returns:number(s.returns+r.returns),reversalCount:number(s.reversalCount+r.reversalCount,true)}),{customers:0,visits:0,turnover:0,discount:0,returns:0,reversalCount:0});return {items,count:items.length,summary,reversalAware:true,window:{limit:10000,kind:'COMPLETE_FILTERED_GROUPS'}};
}
