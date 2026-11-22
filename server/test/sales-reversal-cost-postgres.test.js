import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {greeceDateInput,greeceRangeDate} from '../../shared/greece-time.mjs';
import {optionalSalesCalendar,salesReportCalendar} from '../src/services/sales-report-calendar.js';

test('native sales summary and drilldown preserve original-date reversal cost and unknown originals',{
 skip:!process.env.DATABASE_URL,timeout:45000
},async()=>{
 const url=new URL(process.env.DATABASE_URL);
 assert.ok(['localhost','127.0.0.1','[::1]','postgres'].includes(url.hostname));
 assert.match(url.pathname,/test/i);
 assert.equal(process.env.NODE_ENV,'test');
 const {PrismaClient}=await import('@prisma/client');
 const database=new PrismaClient();
 try{
  await database.$transaction(async db=>{
   const tables={
    Store:'"id" text primary key,"companyId" text,"name" text,"active" boolean',
    Product:'"id" text primary key,"companyId" text,"name" text,"sku" text,"unit" text,"categoryId" text,"masterProductId" text,"costPrice" numeric',
    ProductCategory:'"id" text primary key,"companyId" text,"name" text',
    MasterProduct:'"id" text primary key,"subcategoryName" text,"categoryName" text',
    StoreProduct:'"storeId" text,"productId" text,"currentStock" numeric',
    PriceCatalogPromotion:'"id" text primary key,"companyId" text,"active" bool',
    Sale:'"id" text primary key,"companyId" text,"storeId" text,"status" text,"transactionMode" text,"source" text,"occurredAt" timestamp,"originalSaleId" text,"createdAt" timestamp,"receiptNumber" text,"reversalKind" text,"operatorEmployeeId" text,"customerId" text',
    SaleLine:'"id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text',
    PurchaseDocumentLine:'"purchaseDocumentId" text,"productId" text,"unit" text,"unitCost" numeric,"unitsPerPackage" numeric,"createdAt" timestamp,"id" text,"quantity" numeric,"netAmount" numeric',
    PurchaseDocument:'"id" text,"supplierId" text,"companyId" text,"storeId" text,"status" text,"documentDate" timestamp,"createdAt" timestamp,"sourceType" text,"purchaseOrderId" text,"documentNumber" text',
    PurchaseOrder:'"id" text,"companyId" text,"storeId" text,"supplierId" text,"invoiceNumber" text,"status" text',
    PurchaseOrderLine:'"orderId" text,"productId" text,"quantity" numeric,"netAmount" numeric,"resolutionStatus" text,"invoiceUnit" text,"stockUnitsPerInvoiceUnit" numeric',
    StockMovement:'"id" text,"sourceType" text,"sourceId" text,"storeId" text,"productId" text,"movementType" text,"unitCost" numeric,"createdAt" timestamp',
    Supplier:'"id" text,"companyId" text,"name" text',
    Employee:'"id" text,"storeId" text,"fullName" text',
    Customer:'"id" text,"companyId" text,"name" text',
    Payment:'"saleId" text,"method" text'
   };
   for(const [name,columns] of Object.entries(tables)){
    await db.$executeRawUnsafe(`CREATE TEMP TABLE "${name}" (${columns}) ON COMMIT DROP`);
   }
   await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES ('s','c','LAB',true),('other','c','Other',true)`);
   await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES ('p','c','Historical','P','PIECE',NULL,NULL,99),('fallback','c','Catalog only','F','PIECE',NULL,NULL,3)`);
   const purchase=async(id,date,cost)=> {
    await db.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","status","documentDate","createdAt") VALUES (${id},'c','s','APPROVED',${new Date(date)},${new Date(date)})`;
    await db.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","unit","unitCost","createdAt") VALUES (${id},${id},'p','PIECE',${cost},${new Date(date)})`;
   };
   const sale=async(id,day,{source='POS',original=null,company='c',store='s',status='COMPLETED',product='p'}={})=>{
    const date=new Date(day+'T12:00Z');
    await db.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","status","transactionMode","source","occurredAt","createdAt","originalSaleId") VALUES (${id},${company},${store},${status},'NORMAL',${source},${date},${date},${original})`;
    const quantity=source==='POS_REVERSAL'?-1:1;
    await db.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${id},${id},${product},${product},${quantity},10,0,0,${quantity*10})`;
   };
   await purchase('old','2032-01-01',2);
   await sale('original','2032-01-02');
   await purchase('new','2032-01-03',9);
   await sale('return','2032-01-04',{source:'POS_REVERSAL',original:'original'});

   const handlers=new Map(),router={use(){},get(path,handler){handlers.set(path,handler)}};
   const source=await readFile(new URL('../src/routes/kiosk-reports-sales-v4.js',import.meta.url),'utf8');
   const {readSalesAnalysisReport}=new Function('Router','prisma','greeceDateInput','greeceRangeDate','optionalSalesCalendar','salesReportCalendar',
    source.replace(/^import .*;\s*$/gm,'').replace(/export default router;?/,'').replace(/^export /gm,'')+'\nreturn {readSalesAnalysisReport};'
   )(()=>router,db,greeceDateInput,greeceRangeDate,optionalSalesCalendar,salesReportCalendar);
   const summary=day=>readSalesAnalysisReport({
    companyId:'c',storeId:'s',from:new Date(day+'T00:00Z'),to:new Date(new Date(day+'T00:00Z').getTime()+86400000)
   },{db});
   const detail=async(day,product='p')=>{
    let result;
    await handlers.get('/sales-analysis/:productId')({
     user:{companyId:'c',role:'OWNER'},params:{productId:product},
     query:{storeId:'s',from:day,to:day,timeZone:'Europe/Athens'}
    },{json(value){result=value},status(){return this}},error=>{throw error});
    return result;
   };
   const assertCosts=async(day,expected,expectedProfit)=>{
    const report=await summary(day),drill=await detail(day);
    assert.equal(report.items.length,1);
    assert.equal(drill.items.length,1);
    assert.deepEqual({
     summary:report.totalCost,group:report.items[0].costValue,drilldown:drill.items[0].costValue
    },{summary:expected,group:expected,drilldown:expected},'costs '+day);
    assert.equal(report.totalProfit,expectedProfit,'summary profit '+day);
    assert.equal(drill.items[0].profit,expectedProfit,'drilldown profit '+day);
    return {report,drill};
   };
   await assertCosts('2032-01-02',2,8);
   await assertCosts('2032-01-04',-2,-8);
   await sale('normal','2032-01-05');
   await assertCosts('2032-01-05',9,1);

   const invalid=[
    {id:'missing',original:'absent'},
    {id:'unlinked',original:null},
    {id:'foreign',original:'foreign-original',originalOptions:{company:'foreign'}},
    {id:'sibling',original:'sibling-original',originalOptions:{store:'other'}},
    {id:'draft',original:'draft-original',originalOptions:{status:'DRAFT'}},
    {id:'nested',original:'nested-original',originalOptions:{source:'POS_REVERSAL'}},
    {id:'future',original:'future-original',originalDay:'2032-01-25',originalOptions:{}}
   ];
   for(const [index,fixture] of invalid.entries()){
    const day='2032-01-'+String(10+index).padStart(2,'0');
    if(fixture.originalOptions)await sale(fixture.original,fixture.originalDay||'2032-01-02',fixture.originalOptions);
    await sale(fixture.id,day,{source:'POS_REVERSAL',original:fixture.original});
    const {report,drill}=await assertCosts(day,null,null);
    assert.equal(report.items[0].margin,null);
    assert.equal(report.items[0].missingOriginalCostLines,1);
    assert.equal(drill.items[0].unitCost,null);
    assert.equal(drill.items[0].margin,null);
    assert.equal(drill.items[0].supplierName,null);
   }
   await sale('catalog-only','2032-01-20',{product:'fallback'});
   const fallback=await summary('2032-01-20');
   assert.equal(fallback.totalCost,3);
   assert.equal((await detail('2032-01-20','fallback')).items[0].costValue,3);
   const empty=await summary('2032-02-01');
   assert.equal(empty.totalCost,0);
   assert.equal(empty.totalProfit,0);
   const snapshot=()=>Promise.all(Object.keys(tables).map(name=>db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count,md5(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text)) AS digest FROM "${name}" t`
   )));
   const before=await snapshot();
   const mixed=await readSalesAnalysisReport({
    companyId:'c',storeId:'s',from:new Date('2032-01-01'),to:new Date('2032-02-01')
   },{db});
   assert.equal(mixed.totalCost,null);
   assert.equal(mixed.totalProfit,null);
   await detail('2032-01-04');
   assert.deepEqual(await snapshot(),before);
  },{timeout:40000});
 }finally{
  await database.$disconnect();
 }
});
