import {Prisma} from '@prisma/client';
import {staffError} from './backoffice-staff-access.js';
import {companyOwnerReportRequest,ownerShiftFields,ownerShiftSummaryFields,ownerShiftTransactionFields,ownerSaleLineFields,ownerShiftDifferenceFields,ownerPaymentSummaryFields,ownerPaymentMovementFields,businessPictureFields,businessPictureMissingCostFields,businessPictureMissingExpenseFields} from '../../../shared/backoffice-staff-company-owner-reports.mjs';
import {readOwnerDashboard} from '../routes/api.js';
import {readOwnerMasterCatalog} from '../routes/owner-products.js';
import {readOwnerShiftReport,readOwnerShiftDetail} from '../routes/owner-shifts.js';
import {readOwnerPaymentReport,readOwnerBusinessPicture} from '../routes/owner-payments.js';
import {greeceRangeDate} from '../../../shared/greece-time.mjs';
import {businessPictureCalendarRange} from '../business-picture-dates.js';
import {readCompanyOwnerAudit} from './backoffice-staff-company-owner-audit.js';
const bad=()=>{throw staffError(503,'STAFF_OWNER_REPORT_DATA_INVALID')};
const invalid=()=>{throw staffError(400,'STAFF_OWNER_REPORT_QUERY_INVALID')};
const text=(v,nullable=false)=>{if(nullable&&v===null)return null;if(typeof v!=='string'||v.length>40000)bad();return v};
const number=(v,nullable=false,integer=false)=>{if(nullable&&v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER||integer&&(!Number.isSafeInteger(v)||v<0))bad();return v};
const date=(v,nullable=false)=>{if(nullable&&v===null)return null;if(!(v instanceof Date)&&typeof v!=='string')bad();const d=new Date(v);if(!Number.isFinite(d.getTime()))bad();return d.toISOString()};
const bool=v=>{if(typeof v!=='boolean')bad();return v};
const bound=(r,n=10000)=>{if(!Array.isArray(r)||r.length>n)throw staffError(503,'STAFF_OWNER_REPORT_LIMIT');return r};
function project(r,map){if(!r||typeof r!=='object'||Array.isArray(r))bad();return Object.fromEntries(Object.entries(map).map(([key,kind])=>{const nullable=kind.endsWith('?'),type=kind.replace('?',''),v=r[key];return [key,type==='text'?text(v,nullable):type==='date'?date(v,nullable):type==='boolean'?bool(v):number(v,nullable,type==='integer')]}))}
const day=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))invalid();const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v||Number(v.slice(0,4))<2000||Number(v.slice(0,4))>2100)invalid();return v};
const scalar=(q,key,max=160)=>{if(q[key]===undefined)return null;const v=q[key];if(typeof v!=='string'||!v||v.length>max||v.trim()!==v||/[\u0000-\u001f\u007f]/.test(v))invalid();return v};
export function companyOwnerReportFilters(query,route){
 if(!route||!query||typeof query!=='object'||Array.isArray(query))invalid();const cap=route.capability,keys=Reflect.ownKeys(query),simple=['dashboard.read','financial-store-options.read','financial-supplier-options.read'].includes(cap)||route.sessionId;
 if(simple){if(keys.length)invalid();return {}}
 if(cap==='master-catalog.read'){if(keys.length!==1||keys[0]!=='q')invalid();const q=scalar(query,'q',120);if(!q||q.length<2)invalid();return {q}}
 const business=cap==='business-picture.read',audit=cap==='audit-events.read',shift=cap==='owner-shifts.read';
 const allowed=business?['calendarFrom','calendarTo','storeId']:['from','to','storeId','q',...(audit?['timeFrom','timeTo','operatorId','terminalPos','eventType','amountMin','amountMax']:shift?['status']:['supplierId','type'])];
 if(keys.some(k=>!allowed.includes(k)||typeof query[k]!=='string'))invalid();
 const fromDay=day(query[business?'calendarFrom':'from']),toDay=day(query[business?'calendarTo':'to']),from=greeceRangeDate(fromDay),to=greeceRangeDate(toDay,true);if(from>to)invalid();
 const storeId=scalar(query,'storeId'),supplierId=scalar(query,'supplierId'),q=query.q??'';if(q.length>120||q.trim()!==q||/[\u0000-\u001f\u007f]/.test(q))invalid();
 const filters={from,to,toExclusive:new Date(to.getTime()+1),fromDay,toDay,storeId,supplierId,q};
 if(business){businessPictureCalendarRange(fromDay,toDay);return {...filters,calendarFrom:fromDay,calendarTo:toDay}}
 if(audit){for(const key of ['timeFrom','timeTo']){const v=scalar(query,key,5);if(v&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))invalid();filters[key]=v}if(filters.timeFrom&&filters.timeTo&&filters.timeFrom>filters.timeTo)invalid();for(const [key,max]of [['operatorId',160],['terminalPos',40],['eventType',120]])filters[key]=scalar(query,key,max);for(const key of ['amountMin','amountMax']){const v=scalar(query,key,64);if(v!==null&&!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v))invalid();filters[key]=v===null?null:Number(v);if(filters[key]!==null&&(!Number.isFinite(filters[key])||Math.abs(filters[key])>Number.MAX_SAFE_INTEGER))invalid()}if(filters.amountMin!==null&&filters.amountMax!==null&&filters.amountMin>filters.amountMax)invalid();return filters}
 filters.status=query.status??'ALL';filters.type=query.type??'ALL';if(shift?!['ALL','OPEN','CLOSED'].includes(filters.status):!['ALL','SUPPLIER_PAYMENT','OTHER_EXPENSE'].includes(filters.type))invalid();return filters;
}
async function checkFilters(db,c,f){if(f.storeId){const rows=await db.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${f.storeId} AND "companyId"=${c} AND "active"=true LIMIT 1`;if(rows.length!==1)throw staffError(404,'STAFF_OWNER_REPORT_STORE_NOT_FOUND')}if(f.supplierId){const rows=await db.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${f.supplierId} AND "companyId"=${c} AND "active"=true LIMIT 1`;if(rows.length!==1)throw staffError(404,'STAFF_OWNER_REPORT_SUPPLIER_NOT_FOUND')}}
export async function readCompanyOwnerReport(db,c,cap,path,query={}){
 const route=companyOwnerReportRequest('GET',path);if(route?.capability!==cap)throw staffError();const f=companyOwnerReportFilters(query,route);await checkFilters(db,c,f);let data;
 if(cap==='dashboard.read')data=project(await readOwnerDashboard(c,{db}),{stores:'integer',employees:'integer',temporary:'integer',uncovered:'integer'});
 else if(cap==='master-catalog.read')data=await master(db,c,f);
 else if(cap==='financial-store-options.read'||cap==='financial-supplier-options.read')data=await options(db,c,cap);
 else if(cap==='owner-shifts.read')data=route.sessionId?await shiftDetail(db,c,route.sessionId):await shifts(db,c,f);
 else if(cap==='owner-payments-report.read')data=await payments(db,c,f);
 else if(cap==='business-picture.read')data=await business(db,c,f);
 else data=await readCompanyOwnerAudit(db,c,f);
 await checkFilters(db,c,f);return {scope:'COMPANY',companyId:c,...data};
}
async function options(db,c,cap){const raw=cap==='financial-store-options.read'?await db.$queryRaw`SELECT "id","name" FROM "Store" WHERE "companyId"=${c} AND "active"=true ORDER BY "name","id" LIMIT 10001`:await db.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${c} AND "active"=true ORDER BY "name","id" LIMIT 10001`;const items=bound(raw).map(r=>project(r,{id:'text',name:'text',...(cap==='financial-supplier-options.read'?{taxId:'text?'}:{})}));return {items,count:items.length,window:{limit:10000}}}
async function master(db,c,f){const raw=await readOwnerMasterCatalog(c,f.q,{db});const items=bound(raw,100).map(r=>{const normalized={...r};for(const field of ['defaultRetailPrice','defaultCostPrice','vatRate'])if(Prisma.Decimal.isDecimal(normalized[field]))normalized[field]=normalized[field].toNumber();const v=project(normalized,{id:'text',sourceCode:'text',name:'text',categoryName:'text?',subcategoryName:'text?',supplierName:'text?',brandName:'text?',defaultRetailPrice:'number?',defaultCostPrice:'number?',vatRate:'number?',vatVerified:'boolean',duplicateBarcodeCount:'integer',companyProductId:'text?'});v.safeBarcodes=bound(r.safeBarcodes).map(v=>text(v));return v});return {q:f.q,items,count:items.length,window:{limit:100,kind:'NATIVE_WINDOW'},source:'SHARED_OWNER_MASTER_CATALOG'}}
const period=(from,to)=>({from:date(from),toInclusive:date(to),timeZone:'Europe/Athens'});
const reportQuery=f=>({from:f.fromDay,to:f.toDay,...(f.storeId?{storeId:f.storeId}:{}),...(f.supplierId?{supplierId:f.supplierId}:{}),...(f.q?{q:f.q}:{})});
async function shifts(db,c,f){const r=await readOwnerShiftReport(c,{...reportQuery(f),status:f.status},{db});const shifts=bound(r.shifts,1500).map(row=>project(row,ownerShiftFields));return {from:f.fromDay,to:f.toDay,storeId:f.storeId,q:f.q,status:f.status,generatedAt:date(r.generatedAt),period:period(r.from,r.to),summary:project(r.summary,ownerShiftSummaryFields),shifts,window:{limit:1500,kind:'NATIVE_WINDOW'}}}
async function ownedIds(db,c,table,ids){if(!ids.length)return new Set();const unique=[...new Set(ids.filter(v=>typeof v==='string'&&v))];bound(unique);const rows=table==='Product'?await db.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${c} AND "id"=ANY(${unique}::text[])`:table==='Supplier'?await db.$queryRaw`SELECT "id" FROM "Supplier" WHERE "companyId"=${c} AND "id"=ANY(${unique}::text[])`:await db.$queryRaw`SELECT "id","storeId" FROM "PurchaseDocument" WHERE "companyId"=${c} AND "id"=ANY(${unique}::text[])`;return table==='PurchaseDocument'?new Map(rows.map(r=>[r.id,r.storeId])):new Set(rows.map(r=>r.id))}
async function shiftDetail(db,c,id){
 const r=await readOwnerShiftDetail(c,id,{db});
 let lineCount=0;for(const transaction of bound(r.transactions)){lineCount+=bound(transaction.saleLines).length;if(lineCount>10000)throw staffError(503,'STAFF_OWNER_REPORT_LIMIT')}
 const products=await ownedIds(db,c,'Product',r.transactions.flatMap(t=>t.saleLines.map(l=>l.productId))),suppliers=await ownedIds(db,c,'Supplier',r.transactions.map(t=>t.supplierId));
 const shift=project(r.shift,ownerShiftFields),transactions=bound(r.transactions).map(t=>{const v=project({...t,supplierId:suppliers.has(t.supplierId)?t.supplierId:null,supplierName:t.supplierId&&!suppliers.has(t.supplierId)?null:t.supplierName},ownerShiftTransactionFields);v.saleLines=bound(t.saleLines).map(l=>project({...l,productId:products.has(l.productId)?l.productId:null},ownerSaleLineFields));return v});
 const categories=bound(r.categories).map(v=>project(v,{category:'text',quantity:'number',revenue:'number',sales:'integer'})),paymentMethods=bound(r.paymentMethods).map(v=>project(v,{method:'text',amount:'number',count:'integer'})),sales=project(r.sales,{count:'integer',total:'number',average:'number',firstAt:'date?',lastAt:'date?'}),difference=project(r.difference,ownerShiftDifferenceFields),alerts=bound(r.alerts).map(v=>project({...v,transactionId:v.transactionId??null},{kind:'text',amount:'number',label:'text',transactionId:'text?'}));
 return {shift,transactions,categories,paymentMethods,sales,difference,alerts,sourceStatus:{vatFiscal:false,note:text(r.sourceStatus.note)},window:{transactionLimit:10000,lineLimit:10000}};
}
async function payments(db,c,f){
 const r=await readOwnerPaymentReport(c,{...reportQuery(f),type:f.type},{db,strictTenant:true});
 if(r.sourceStatus?.ledger!==true||r.sourceStatus?.sales!==true||r.sourceStatus?.purchases!==true)throw staffError(503,'STAFF_OWNER_REPORT_SOURCE_UNAVAILABLE');
 const supplierIds=[...bound(r.movements,1500).map(v=>v.supplierId),...bound(r.bySupplier).map(v=>v.supplierId)],suppliers=await ownedIds(db,c,'Supplier',supplierIds),documents=await ownedIds(db,c,'PurchaseDocument',r.movements.filter(m=>m.evidenceMode==='DOCUMENT').map(m=>m.purchaseDocumentId));
 const movements=r.movements.map(m=>{const foreignSupplier=Boolean(m.supplierId&&!suppliers.has(m.supplierId)),documentUnavailable=m.evidenceMode==='DOCUMENT'&&documents.get(m.purchaseDocumentId)!==m.storeId;return project({...m,supplierId:suppliers.has(m.supplierId)?m.supplierId:null,supplierName:foreignSupplier?null:m.supplierName,purchaseDocumentId:documentUnavailable?null:m.purchaseDocumentId,attachmentFilename:documentUnavailable?null:m.attachmentFilename,evidenceMode:documentUnavailable?'UNAVAILABLE_DOCUMENT':m.evidenceMode,documentUnavailable},ownerPaymentMovementFields)});
 const byStore=bound(r.byStore).map(v=>project(v,{storeId:'text',name:'text',count:'integer',expenses:'number',sales:'number',purchases:'number'})),bySupplier=r.bySupplier.map(v=>project({...v,supplierId:suppliers.has(v.supplierId)?v.supplierId:null,name:v.supplierId&&!suppliers.has(v.supplierId)?'Μη διαθέσιμος προμηθευτής':v.name},{supplierId:'text?',name:'text',count:'integer',payments:'number',documents:'integer',purchases:'number'}));
 const categories=bound(r.categories).map(v=>project(v,{name:'text',type:'text',count:'integer',amount:'number'})),daily=bound(r.daily).map(v=>project(v,{day:'text',expenses:'number',sales:'number'}));
 return {from:f.fromDay,to:f.toDay,storeId:f.storeId,supplierId:f.supplierId,q:f.q,type:f.type,generatedAt:date(r.generatedAt),period:period(r.from,r.to),previousPeriod:{from:date(r.previousFrom),toInclusive:date(r.previousTo),basis:'NATIVE_EQUAL_ELAPSED_RANGE'},summary:project(r.summary,ownerPaymentSummaryFields),byStore,bySupplier,categories,daily,movements,sourceStatus:{ledger:true,sales:true,purchases:true},summaryScope:'COMPLETE_FILTERED_SOURCE',movementsWindow:{limit:1500,kind:'NATIVE_WINDOW'},groupLimit:10000};
}
async function business(db,c,f){
 const r=await readOwnerBusinessPicture(c,{calendarFrom:f.calendarFrom,calendarTo:f.calendarTo,...(f.storeId?{storeId:f.storeId}:{})},{db,strictTenant:true});
 const values=row=>{const v=project(row,businessPictureFields);if(v.profitEstimateBasis!=='CATEGORY_KNOWN_SALES')v.estimatedCostValue=null;return v},daily=bound(r.daily).map(row=>({day:text(row.day),month:text(row.month),...values(row)})),monthly=bound(r.monthly).map(row=>({month:text(row.month),...values(row)})),totals={month:text(r.totals.month),...values(r.totals)};
 const products=await ownedIds(db,c,'Product',bound(r.missingCostDetails).map(v=>v.productId));
 const missingCostDetails=r.missingCostDetails.map((v,i)=>project({...v,id:`missing-cost-${i}`,productId:products.has(v.productId)?v.productId:null},businessPictureMissingCostFields)),missingExpenseVatDetails=bound(r.missingExpenseVatDetails).map(v=>project(v,businessPictureMissingExpenseFields)),calculationNotes=project(r.calculationNotes,{expenses:'text',reversals:'text',costCoverage:'text',units:'text',grossProfit:'text',netProfit:'text'});
 return {calendarFrom:f.calendarFrom,calendarTo:f.calendarTo,storeId:f.storeId,generatedAt:date(r.generatedAt),period:period(r.from,r.to),monthly,daily,totals,missingCostDetails,missingExpenseVatDetails,calculationNotes,window:{limit:10000,kind:'COMPLETE_FILTERED_SOURCE'}};
}
