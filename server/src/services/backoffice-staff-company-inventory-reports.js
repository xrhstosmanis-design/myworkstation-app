import {staffError} from './backoffice-staff-access.js';
import {staffCompanyReportProductId} from '../../../shared/backoffice-staff-company.mjs';
import {greeceRangeDate} from '../../../shared/greece-time.mjs';
import {salesReportCalendar} from './sales-report-calendar.js';
import {readStockAnalysisReport} from '../routes/kiosk-reports-stock-v3.js';
import {readSalesAnalysisReport,readSalesAnalysisProductReport} from '../routes/kiosk-reports-sales-v4.js';
import {readSalesReportComparison} from './sales-report-comparison.js';
import {readDelegatedRecordedPayrollExpenseReport} from './recorded-payroll-expense-report.js';
const invalid=()=>{throw staffError(400,'STAFF_REPORT_QUERY_INVALID')};
const bad=()=>{throw staffError(503,'STAFF_REPORT_DATA_INVALID')};
const text=(v,nullable=true)=>{if(nullable&&v===null)return null;if(typeof v!=='string'||v.length>10000)bad();return v};
const num=(v,nullable=true)=>{if(nullable&&v===null)return null;if(typeof v!=='number'||!Number.isFinite(v))bad();return v};
const iso=(v,nullable=true)=>{if(nullable&&v===null)return null;if(!(v instanceof Date)&&typeof v!=='string')bad();const d=new Date(v);if(!Number.isFinite(d.getTime()))bad();return d.toISOString()};
const dto=(r,strings,numbers=[],dates=[])=>Object.fromEntries([...strings.map(k=>[k,text(r[k],!['id','name','productId','storeId','storeName','stocktakeId','stocktakeName','status'].includes(k))]),...numbers.map(k=>[k,num(r[k])]),...dates.map(k=>[k,iso(r[k],k!=='startedAt'&&k!=='createdAt')])]);
const bound=(rows,max)=>{if(!Array.isArray(rows)||rows.length>max)throw staffError(503,'STAFF_REPORT_LIMIT');return rows};
const sum=(rows,key)=>rows.some(r=>r[key]===null)?null:num(rows.reduce((s,r)=>s+r[key],0),false);
export const inventoryReportCapabilities=Object.freeze(['reports-stocktakes.read','reports-stock-snapshot.read','reports-item-snapshot.read','reports-stock-analysis.read','reports-sales-analysis.read','reports-payroll-expenses.read']);
function day(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))invalid();const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)invalid();return v}
export function inventoryReportFilters(query,capability,path){
 const snapshot=capability==='reports-stock-snapshot.read'||capability==='reports-item-snapshot.read',sales=capability==='reports-sales-analysis.read',payroll=capability==='reports-payroll-expenses.read',detail=staffCompanyReportProductId(path,'stock-analysis')??staffCompanyReportProductId(path,'sales-analysis');
 if(!query||typeof query!=='object'||Array.isArray(query))invalid();
 const allowed=[...(snapshot?[]:['from']),'to','storeId',...(!payroll&&!detail?['q']:[]),...(sales?['timeZone',...(!detail?['compareFrom','compareTo','includeHourly']:[])]:payroll?['timeZone']:[])];
 if(Reflect.ownKeys(query).some(k=>!allowed.includes(k)||typeof query[k]!=='string'))invalid();
 const toDay=day(query.to),fromDay=snapshot?null:day(query.from),storeId=query.storeId??null,q=query.q??'';
 if(storeId!==null&&(!storeId||storeId.length>160||storeId.trim()!==storeId||/[\u0000-\u001f\u007f]/.test(storeId))||q.length>120||q.trim()!==q||/[\u0000-\u001f\u007f]/.test(q))invalid();
 if(capability==='reports-item-snapshot.read'&&!q)invalid();
 let calendar=null,from=fromDay?greeceRangeDate(fromDay):null,to=new Date(greeceRangeDate(toDay,true).getTime()+1);
 if(from&&from>=to)invalid();
 if(sales||payroll){if(query.timeZone!=='Europe/Athens')invalid();calendar=salesReportCalendar(fromDay,toDay);from=calendar.from;to=calendar.to}
 if(payroll&&!storeId||query.includeHourly!==undefined&&(query.includeHourly!=='1'||!storeId)||(query.compareFrom!==undefined)!==(query.compareTo!==undefined))invalid();
 if(query.compareFrom!==undefined){day(query.compareFrom);day(query.compareTo);if(!storeId)invalid()}
 return {from,to,fromDay,toDay,storeId,q,text:q?`%${q}%`:null,snapshot,detail,calendar,includeHourly:query.includeHourly==='1',compareFrom:query.compareFrom,compareTo:query.compareTo};
}
export async function readCompanyInventoryReport(db,companyId,capability,path,query,user){
 const f=inventoryReportFilters(query,capability,path);
 const check=async()=>{if(f.storeId&&!await db.store.findFirst({where:{id:f.storeId,companyId,active:true},select:{id:true}}))throw staffError(404,'STAFF_REPORT_STORE_NOT_FOUND')};await check();let data;
 if(capability==='reports-stocktakes.read')data=await stocktakes(db,companyId,f);
 else if(f.snapshot)data=await snapshot(db,companyId,f,capability==='reports-item-snapshot.read');
 else if(capability==='reports-stock-analysis.read')data=f.detail?await stockMovements(db,companyId,f):await stockAnalysis(db,companyId,f);
 else if(capability==='reports-sales-analysis.read')data=f.detail?await salesDetail(db,companyId,f):await salesAnalysis(db,companyId,f);
 else if(capability==='reports-payroll-expenses.read')data=await readDelegatedRecordedPayrollExpenseReport({user,storeId:f.storeId,from:f.fromDay,to:f.toDay,timeZone:'Europe/Athens'},{db});
 else throw staffError();await check();if(capability==='reports-payroll-expenses.read')return data;return {...(!f.snapshot?{from:f.fromDay}:{}),to:f.toDay,storeId:f.storeId,q:f.q,...data};
}
async function stocktakes(db,companyId,f){
 const {from,to,storeId,text}=f;
 const raw=await db.$queryRaw`
    SELECT st."id" AS "stocktakeId",st."name" AS "stocktakeName",st."status",st."startedAt",st."finalizedAt",sl."id",sl."expectedQuantity"::double precision AS "expectedQuantity",sl."countedQuantity"::double precision AS "countedQuantity",sl."unitCost"::double precision AS "unitCost",sl."countedAt",
      p."id" AS "productId",p."sku",p."name",p."salePrice"::double precision AS "salePrice",p."unit",c."name" AS "categoryName",mp."subcategoryName",s."name" AS "storeName",u."fullName" AS "operatorName"
    FROM "StocktakeLine" sl JOIN "Stocktake" st ON st."id"=sl."stocktakeId" AND st."companyId"=${companyId}
    JOIN "Store" s ON s."id"=st."storeId" AND s."companyId"=st."companyId" JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${companyId}
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" AND c."companyId"=p."companyId" LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId" LEFT JOIN "User" u ON u."id"=sl."countedByUserId" AND u."companyId"=st."companyId"
    WHERE st."startedAt">=${from} AND st."startedAt"<${to} AND (${storeId}::text IS NULL OR st."storeId"=${storeId})
      AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    ORDER BY st."startedAt" DESC,p."name" LIMIT 10001`;
 const items=bound(raw,10000).map(r=>{const v=dto(r,['stocktakeId','stocktakeName','status','id','productId','sku','name','unit','categoryName','subcategoryName','storeName','operatorName'],['expectedQuantity','countedQuantity','unitCost','salePrice'],['startedAt','finalizedAt','countedAt']);num(v.expectedQuantity,false);v.difference=v.countedQuantity===null?null:num(v.countedQuantity-v.expectedQuantity,false);v.differenceValue=v.difference===null||v.unitCost===null?null:num(v.difference*v.unitCost,false);v.incomplete=v.differenceValue===null;return v});
 return {items,count:items.length,totalDifferenceValue:sum(items,'differenceValue'),incomplete:items.some(v=>v.incomplete),window:{limit:10000}};
}
async function snapshot(db,companyId,f,itemScoped){
 const {storeId,text}=f,snapshotAt=new Date(f.to.getTime()-1);
 const raw=await db.$queryRaw`
    WITH qty AS (
      SELECT sm."storeId",sm."productId",SUM(sm."quantity") AS "quantity"
      FROM "StockMovement" sm JOIN "Store" sx ON sx."id"=sm."storeId" AND sx."companyId"=${companyId}
      WHERE sm."createdAt"<=${snapshotAt} AND (${storeId}::text IS NULL OR sm."storeId"=${storeId}) GROUP BY sm."storeId",sm."productId"
    )
    SELECT p."id" AS "productId",p."sku",p."name",p."salePrice"::double precision AS "salePrice",p."vatRate"::double precision AS "vatRate",p."unit",p."costPrice"::double precision AS "costPrice",c."name" AS "categoryName",mp."subcategoryName",
      s."id" AS "storeId",s."name" AS "storeName",COALESCE(qty."quantity",0)::double precision AS "quantity",
      COALESCE(lp."unitCost",p."costPrice")::double precision AS "purchasePrice",lp."supplierName",lp."documentDate" AS "lastPurchaseAt"
    FROM "Product" p CROSS JOIN "Store" s
    LEFT JOIN qty ON qty."productId"=p."id" AND qty."storeId"=s."id"
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" AND c."companyId"=p."companyId" LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    LEFT JOIN LATERAL (
      SELECT CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "unitCost",d."documentDate",sup."name" AS "supplierName"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId" AND sup."companyId"=d."companyId"
      WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId"=p."id" AND d."documentDate"<=${snapshotAt}
      ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1
    ) lp ON true
    WHERE p."companyId"=${companyId} AND s."companyId"=${companyId} AND (${storeId}::text IS NULL OR s."id"=${storeId})
      AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    ORDER BY p."name",s."name" LIMIT 10001`;
 const items=bound(raw,10000).map(r=>{const v=dto(r,['productId','sku','name','unit','categoryName','subcategoryName','storeId','storeName','supplierName'],['salePrice','vatRate','costPrice','quantity','purchasePrice'],['lastPurchaseAt']);num(v.quantity,false);v.saleValue=v.salePrice===null?null:num(v.quantity*v.salePrice,false);v.costValue=v.purchasePrice===null?null:num(v.quantity*v.purchasePrice,false);const net=v.salePrice===null||v.vatRate===null?null:v.salePrice/(1+v.vatRate/100);v.marginNet=net===null||net===0||v.purchasePrice===null?null:num((net-v.purchasePrice)/net*100,false);v.incomplete=v.salePrice===null||v.purchasePrice===null||v.vatRate===null;return v});
 return {snapshotAt:snapshotAt.toISOString(),items,count:items.length,totalSaleValue:sum(items,'saleValue'),totalCostValue:sum(items,'costValue'),incomplete:items.some(v=>v.incomplete),ledgerBased:true,itemScoped,window:{limit:10000}};
}
async function stockAnalysis(db,companyId,f){
 const raw=await readStockAnalysisReport({companyId,...f},{db,strictRead:true});
 const items=bound(raw.items,10000).map(r=>{for(const k of ['_salePriceUnavailable','_purchasePriceUnavailable','_vatUnavailable'])if(typeof r[k]!=='boolean')bad();const v=dto(r,['productId','sku','name','unit','categoryName','subcategoryName','storeId','storeName','supplierName'],['currentStock','salesQuantity','reversalQuantity','salePrice','purchasePrice','vatRate','retailValue','purchaseValue','margin'],['lastSaleAt','lastPurchaseAt']);for(const k of ['currentStock','salesQuantity','reversalQuantity'])num(v[k],false);if(r._salePriceUnavailable)v.salePrice=v.retailValue=null;if(r._purchasePriceUnavailable)v.purchasePrice=v.purchaseValue=null;if(r._vatUnavailable)v.vatRate=null;v.incomplete=r._salePriceUnavailable||r._purchasePriceUnavailable||r._vatUnavailable;if(v.incomplete||v.salePrice===0)v.margin=null;return v});
 return {items,count:items.length,totalStockQuantity:sum(items,'currentStock'),totalSalesQuantity:sum(items,'salesQuantity'),totalReversalQuantity:sum(items,'reversalQuantity'),totalRetailValue:sum(items,'retailValue'),totalPurchaseValue:sum(items,'purchaseValue'),incomplete:items.some(v=>v.incomplete),reversalAware:true,window:{limit:10000}};
}
async function stockMovements(db,companyId,f){
 const products=await db.$queryRaw`SELECT "id","name","sku" FROM "Product" WHERE "id"=${f.detail} AND "companyId"=${companyId} LIMIT 1`;
 if(products.length!==1)throw staffError(404,'STAFF_REPORT_PRODUCT_NOT_FOUND');const product=dto(products[0],['id','name','sku']);
 const raw=await db.$queryRaw`SELECT sm."id",sm."createdAt",sm."movementType",sm."quantity"::double precision AS quantity,sm."unitCost"::double precision AS "unitCost",sm."sourceType",sm."note",s."name" AS "storeName",u."fullName" AS "operatorName" FROM "StockMovement" sm JOIN "Store" s ON s."id"=sm."storeId" AND s."companyId"=${companyId} LEFT JOIN "User" u ON u."id"=sm."createdByUserId" AND u."companyId"=s."companyId" WHERE sm."productId"=${f.detail} AND sm."createdAt">=${f.from} AND sm."createdAt"<${f.to} AND (${f.storeId}::text IS NULL OR sm."storeId"=${f.storeId}) ORDER BY sm."createdAt" DESC,sm."id" LIMIT 2000`;
 const items=bound(raw,2000).map(r=>{const v=dto(r,['id','movementType','sourceType','note','storeName','operatorName'],['quantity','unitCost'],['createdAt']);num(v.quantity,false);return {...v,value:v.unitCost===null?null:num(Math.abs(v.quantity)*v.unitCost,false),incomplete:v.unitCost===null}});return {product,items,count:items.length,window:{limit:2000}};
}
async function projectedSalesReport(filters,{db}){
 const r=await readSalesAnalysisReport(filters,{db,strictRead:true});
 const items=bound(r.items,10000).map(row=>{if(typeof row._costIncomplete!=='boolean')bad();const v=dto(row,['sku','name','unit','categoryName','subcategoryName','storeId','storeName','supplierName','promotionId','promotionType','promotionName'],['currentStock','salesQuantity','grossSales','netSales','vatValue','costValue','profit','margin','averageGrossPrice','discountValue','normalSaleCount','reversalCount','returnGrossValue'],['lastSaleAt']);v.productId=text(row.productId);for(const k of ['currentStock','salesQuantity','grossSales','netSales','vatValue','averageGrossPrice','discountValue','normalSaleCount','reversalCount','returnGrossValue'])num(v[k],false);for(const k of ['normalSaleCount','reversalCount'])if(!Number.isSafeInteger(v[k])||v[k]<0)bad();v.incomplete=row._costIncomplete;if(v.incomplete)v.costValue=v.profit=v.margin=null;return v});
 const result={items,count:items.length,totalQuantity:sum(items,'salesQuantity'),totalGross:num(r.totalGross,false),totalNet:num(r.totalNet,false),totalVat:num(r.totalVat,false),totalCost:sum(items,'costValue'),totalProfit:sum(items,'profit'),normalSaleCount:num(r.normalSaleCount,false),reversalCount:num(r.reversalCount,false),returnGrossValue:num(r.returnGrossValue,false),reversalAware:true,unattributedPromotionReversal:false,sourceCoverage:r.sourceCoverage,period:r.period,companyId:filters.companyId,storeId:filters.storeId,incomplete:items.some(v=>v.incomplete)};
 if(r.hourlyActivity)result.hourlyActivity=r.hourlyActivity;return result;
}
async function salesAnalysis(db,companyId,f){
 const filters={companyId,from:f.from,to:f.to,storeId:f.storeId,q:f.q||null,calendar:f.calendar,includeHourly:f.includeHourly};
 const r=f.compareFrom!==undefined?await readSalesReportComparison({...filters,compareFrom:f.compareFrom,compareTo:f.compareTo},{db,readReport:projectedSalesReport}):await projectedSalesReport(filters,{db});
 // Top-level report dates stay calendar strings; the canonical period keeps
 // the exact Greek instants, comparison source coverage and provisional status.
 return r;
}
async function salesDetail(db,companyId,f){
 const raw=await readSalesAnalysisProductReport({companyId,productId:f.detail,from:f.from,to:f.to,storeId:f.storeId},{db,strictRead:true});
 const product=dto(raw.product,['id','name']);
 const items=bound(raw.items,5000).map(r=>{if(typeof r._costIncomplete!=='boolean'||typeof r.isReversal!=='boolean')bad();const v=dto(r,['saleId','receiptNumber','source','transactionMode','reversalKind','originalSaleId','storeName','operatorName','customerName','supplierName','paymentMethods'],['quantity','unitPrice','discount','vatRate','lineTotal','netValue','vatValue','unitCost','costValue','profit','margin'],['occurredAt','createdAt']);for(const k of ['quantity','unitPrice','discount','vatRate','lineTotal','netValue','vatValue'])num(v[k],false);v.isReversal=r.isReversal;v.incomplete=r._costIncomplete;if(v.incomplete)v.unitCost=v.costValue=v.profit=v.margin=null;return v});
 return {product,items,count:items.length,reversalAware:true,incomplete:items.some(v=>v.incomplete),window:{limit:5000}};
}
