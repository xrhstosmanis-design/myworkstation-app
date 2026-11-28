import {prisma} from '../prisma.js';
import {readSalesAnalysisReport} from '../routes/kiosk-reports-sales-v4.js';
import {salesReportCalendar} from './sales-report-calendar.js';
import {salesProductSearch,matchesSalesProductSearch} from '../lib/sales-product-search.js';

const invalid=(message,status=400)=>Object.assign(new Error(message),{status});
const value=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;

// Read-only adapter for the existing authorized sales report. Never infer costs
// from retail prices or descriptions; preserve the native historical cost rules.
export async function readSalesItemDetails({companyId,storeId,from,to,timeZone,q},{db=prisma,readSource=readSalesAnalysisReport}={}){
  const search=salesProductSearch(q);
  if(!companyId||!storeId||timeZone!=='Europe/Athens')throw invalid('Επίλεξε συγκεκριμένο κατάστημα και ημερομηνίες Ελλάδας.');
  const calendar=salesReportCalendar(from,to);
  const owned=await db.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${companyId} AND "active"=true`;
  if(owned.length!==1)throw invalid('Δεν βρέθηκε ενεργό κατάστημα.',404);
  const source=await readSource({companyId,storeId,from:calendar.from,to:calendar.to,calendar},{db,strictRead:true});
  if(source.sourceCoverage?.complete!==true)throw invalid('Η αναφορά υπερβαίνει το διαθέσιμο όριο. Επίλεξε μικρότερο διάστημα για πλήρη αποτελέσματα.',422);
  if(source.items.some(row=>row.storeId!==storeId))throw invalid('Δεν επιβεβαιώθηκε το κατάστημα της ανάλυσης.',502);
  const ids=[...new Set(source.items.map(row=>row.productId).filter(Boolean))];
  const metadata=ids.length?await db.$queryRaw`
    SELECT p."id",p."sku",p."unit",COALESCE(sp."salePrice",p."salePrice") AS "currentRetail",
      c."name" AS "categoryName",sc."name" AS "subcategoryName",mp."brandName",
      to_jsonb(p)->>'productCompanyId' AS "productCompanyId",
      COALESCE((SELECT json_agg(pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]'::json) AS "barcodes"
    FROM "Product" p
    LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId}
    LEFT JOIN "ProductCategory" c ON c."id"=COALESCE(sp."categoryIdOverride",p."categoryId") AND c."companyId"=p."companyId"
    LEFT JOIN "ProductSubcategory" sc ON sc."id"=CASE WHEN sp."categoryIdOverride" IS NULL THEN p."subcategoryId" ELSE sp."subcategoryIdOverride" END AND sc."companyId"=p."companyId"
    LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    WHERE p."companyId"=${companyId} AND p."id"=ANY(${ids}::text[])`:[];
  const meta=new Map(metadata.map(row=>[row.id,row])),companyIds=[...new Set(metadata.map(row=>row.productCompanyId).filter(Boolean))];
  const available=companyIds.length?await db.$queryRaw`SELECT to_regclass('"ManagementProductCompany"') IS NOT NULL AS "available"`:[];
  const companies=available[0]?.available?await db.$queryRaw`SELECT "id","name" FROM "ManagementProductCompany" WHERE "companyId"=${companyId} AND "id"=ANY(${companyIds}::text[])`:[];
  const companyNames=new Map(companies.map(row=>[row.id,row.name]));
  const days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1;
  const products=source.items.filter(row=>matchesSalesProductSearch(search,row.name,row.description,row.sku,meta.get(row.productId)?.sku,meta.get(row.productId)?.barcodes??[])).map(row=>{
    if(row.storeId!==storeId)throw invalid('Δεν επιβεβαιώθηκε το κατάστημα της ανάλυσης.',502);
    const m=meta.get(row.productId),quantity=value(row.salesQuantity)??0,revenue=value(row.grossSales)??0,netSales=value(row.netSales)??0;
    const costValue=row._costIncomplete===true?null:value(row.costValue),profit=costValue===null?null:netSales-costValue;
    return {productId:row.productId,storeId,sku:m?.sku??row.sku??null,description:row.name||row.description||'Χωρίς περιγραφή',
      category:m?m.categoryName:row.categoryName??null,subcategory:m?m.subcategoryName:row.subcategoryName??null,
      companyName:companyNames.get(m?.productCompanyId)||m?.brandName||null,unit:m?.unit??row.unit??null,
      quantity,revenue,netSales,discounts:value(row.discountValue)??0,costValue,profit,margin:profit===null||netSales===0?null:profit/netSales*100,
      currentRetail:value(m?.currentRetail),averageGrossPrice:quantity?revenue/quantity:null,
      unitCost:costValue===null||quantity===0?null:costValue/quantity,supplierName:row.supplierName||null,
      dailyQuantity:quantity/days,dailyRevenue:revenue/days,costUnavailable:costValue===null};
  });
  const categories=new Map();
  for(const row of products){const key=row.category||'Χωρίς κατηγορία';const c=categories.get(key)||{category:key,quantity:0,revenue:0,netSales:0,costValue:0};c.quantity+=row.quantity;c.revenue+=row.revenue;c.netSales+=row.netSales;c.costValue=c.costValue===null||row.costValue===null?null:c.costValue+row.costValue;categories.set(key,c);}
  const sum=key=>products.reduce((total,row)=>total+row[key],0),totalCost=products.some(row=>row.costValue===null)?null:sum('costValue'),net=sum('netSales');
  const units=[...new Set(products.map(row=>row.unit))];
  return {storeId,period:{...source.period,calendarFrom:from,calendarTo:to,timeZone:'Europe/Athens',days},sourceCoverage:source.sourceCoverage,nonFiscal:true,
    search:search.text,products,categories:[...categories.values()].map(c=>({...c,profit:c.costValue===null?null:c.netSales-c.costValue,margin:c.costValue===null||!c.netSales?null:(c.netSales-c.costValue)/c.netSales*100})),
    summary:{productCount:products.length,quantity:sum('quantity'),revenue:sum('revenue'),netSales:net,discounts:sum('discounts'),costValue:totalCost,profit:totalCost===null?null:net-totalCost,
      margin:totalCost===null||!net?null:(net-totalCost)/net*100,days,dailyQuantity:units.length>1?null:sum('quantity')/days,dailyRevenue:sum('revenue')/days,mixedUnits:units.length>1,missingCostProducts:products.filter(row=>row.costUnavailable).length}};
}
