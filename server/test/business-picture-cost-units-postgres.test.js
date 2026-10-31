import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {businessPictureCalendarRange} from '../src/business-picture-dates.js';
import {finishBusinessPictureRow} from '../src/business-picture-totals.js';
import {applyBusinessPictureCostEstimates,collectBusinessPictureMissingCosts} from '../src/business-picture-cost-estimates.js';

test('actual profit SQL reconciles package discounts and units, original return dates and read-only estimates',{skip:!process.env.DATABASE_URL,timeout:45000},async()=>{
 const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.match(url.pathname,/_test$/);assert.equal(process.env.NODE_ENV,'test');
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{await db.$transaction(async tx=>{
  const tables={
   Product:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"categoryId" TEXT,"unit" TEXT DEFAULT \'PIECE\',"name" TEXT,"sku" TEXT,"costPrice" NUMERIC',
   Sale:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT DEFAULT \'COMPLETED\',"source" TEXT DEFAULT \'POS\',"reversalKind" TEXT,"originalSaleId" TEXT,"occurredAt" TIMESTAMP',
   SaleLine:'"id" TEXT PRIMARY KEY,"saleId" TEXT,"productId" TEXT,"description" TEXT,"quantity" NUMERIC,"vatRate" NUMERIC DEFAULT 0,"lineTotal" NUMERIC',
   PurchaseDocument:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"sourceType" TEXT DEFAULT \'PURCHASE_ORDER\',"purchaseOrderId" TEXT,"documentNumber" TEXT,"documentDate" TIMESTAMP,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"status" TEXT DEFAULT \'APPROVED\'',
   PurchaseDocumentLine:'"id" TEXT PRIMARY KEY,"purchaseDocumentId" TEXT,"productId" TEXT,"quantity" NUMERIC,"unit" TEXT DEFAULT \'PIECE\',"unitsPerPackage" NUMERIC,"unitCost" NUMERIC,"netAmount" NUMERIC,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
   PurchaseOrder:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"invoiceNumber" TEXT,"status" TEXT DEFAULT \'INVOICED\'',
   PurchaseOrderLine:'"id" TEXT PRIMARY KEY,"orderId" TEXT,"productId" TEXT,"quantity" NUMERIC,"unitCost" NUMERIC,"netAmount" NUMERIC,"exciseTotal" NUMERIC DEFAULT 0,"invoiceUnit" TEXT DEFAULT \'PACKAGE\',"stockUnitsPerInvoiceUnit" NUMERIC,"resolutionStatus" TEXT DEFAULT \'MATCHED\''
  };
  for(const [name,columns]of Object.entries(tables))await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${name}" (${columns}) ON COMMIT DROP`);
  const product=async(id,cost,category='water')=>tx.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","costPrice","categoryId") VALUES (${id},'a',${id},${id},${cost},${category})`;
  const purchase=async(id,p,qty,raw,net,factor,date='2032-01-01T12:00Z',sourceCompany='a',postedNet=net,excise=0)=>{
   await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id","companyId","storeId","supplierId","invoiceNumber") VALUES (${id},${sourceCompany},'a1','supplier',${id})`;
   await tx.$executeRaw`INSERT INTO "PurchaseOrderLine" ("id","orderId","productId","quantity","unitCost","netAmount","stockUnitsPerInvoiceUnit","exciseTotal") VALUES (${id},${id},${p},${qty},${raw},${net},${factor},${excise})`;
   await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentNumber","documentDate") VALUES (${id},'a','a1','supplier',${id},${new Date(date)})`;
   await tx.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","quantity","unitCost","netAmount") VALUES (${id},${id},${p},${qty},${raw},${postedNet})`;
  };
  const sale=async(id,date='2032-01-02T12:00Z',original=null,store='a1',company='a')=>tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","occurredAt","source","reversalKind","originalSaleId") VALUES (${id},${company},${store},${new Date(date)},${original?'POS_REVERSAL':'POS'},${original?'RETURN':null},${original})`;
  const line=async(id,s,p,qty,total)=>tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","quantity","lineTotal") VALUES (${id},${s},${p},${qty},${total})`;
  const source=await readFile(new URL('../src/routes/owner-payments.js',import.meta.url),'utf8'),handlers=new Map(),router=Object.fromEntries(['get','post','patch','put','delete','use'].map(method=>[method,(path,...args)=>{if(method==='get')handlers.set(path,args.at(-1));}]));
  const prisma={store:{findFirst:async({where})=>where.companyId==='a'&&where.id==='a1'?{id:'a1'}:null,findMany:async()=>[{id:'a1',name:'Isolated LAB'}]},$queryRaw:(parts,...values)=>parts.join('').includes('WITH "postedCostGroups"')?tx.$queryRaw(parts,...values):Promise.resolve([])};
  new Function('Router','z','prisma','businessPictureCalendarRange','finishBusinessPictureRow','applyBusinessPictureCostEstimates','collectBusinessPictureMissingCosts',source.replace(/^import .*;\s*$/gm,'').replace(/export default router;?/,''))(()=>router,z,prisma,businessPictureCalendarRange,finishBusinessPictureRow,applyBusinessPictureCostEstimates,collectBusinessPictureMissingCosts);
  const report=async(from,to=from,role='OWNER',storeId='a1')=>{let r;await handlers.get('/business-picture')({user:{companyId:'a',role},query:{storeId,calendarFrom:from,calendarTo:to}},{set(){},json(value){r=value;}},e=>{throw e});return r};
  await product('small',3);await product('large',1.5);await product('bar',9.73,'candy');await product('missing',0);await product('already-piece',.125);await product('weighted',30,'other');await product('foreign',4,'other');await product('mismatch',5,'other');
  await purchase('p-small','small',10,3,30,24);await purchase('p-large','large',7,1.5,10.5,6);await purchase('p-bar','bar',1,13.25,9.73,20);
  await purchase('p-piece','already-piece',10,3,30,24);await purchase('p-weight','weighted',1,30,10,10);
  await tx.$executeRaw`INSERT INTO "PurchaseOrderLine" ("id","orderId","productId","quantity","unitCost","netAmount","stockUnitsPerInvoiceUnit") VALUES ('weight-extra','p-weight','weighted',2,10,20,20)`;
  await tx.$executeRaw`UPDATE "PurchaseDocumentLine" SET "quantity"=3,"netAmount"=30 WHERE "id"='p-weight'`;
  await purchase('p-foreign','foreign',1,4,4,20,'2032-01-01T12:00Z','b');await purchase('p-mismatch','mismatch',1,5,4,20,'2032-01-01T12:00Z','a',5);
  await sale('basket');await line('s1','basket','small',2,1);await line('s2','basket','large',1,1);await line('s3','basket','missing',1,.5);await line('s4','basket','missing',1,0);
  let r=await report('2032-01-02');assert.equal(r.totals.transactions,1);assert.equal(r.totals.costValue,.5);assert.equal(r.totals.grossProfit,null);assert.equal(r.totals.margin,null);assert.equal(r.totals.missingCostLines,2);assert.equal(r.totals.unestimatedCostLines,0);assert.equal(r.totals.normalizedPurchaseCostLines,2);assert.ok(Math.abs(r.totals.estimatedCostValue-(.5+.125+1/6))<1e-8);assert.equal(r.totals.costCoveragePercent,80);assert.equal(r.missingCostDetails[0].lines,2);
  await sale('pre','2031-12-31T12:00Z');await line('pre-small','pre','small',1,1);await line('pre-piece','pre','already-piece',1,1);r=await report('2031-12-31');assert.equal(r.totals.costValue,.25);assert.equal(r.totals.normalizedCatalogCostLines,1);
  await sale('discount','2032-01-04T12:00Z');await line('discount-line','discount','bar',1,1);await line('weighted-line','discount','weighted',1,1);r=await report('2032-01-04');assert.equal(r.totals.costValue,1.0865);
  await product('excise',12,'other');await purchase('p-excise','excise',2,10,20,10,'2032-01-01T12:00Z','a',20,4);
  await product('unknown-unit',7,'other');await purchase('p-unknown','unknown-unit',1,7,7,10);await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "invoiceUnit"=NULL WHERE "id"='p-unknown'`;
  await sale('excise-sale','2032-01-07T12:00Z');await line('excise-line','excise-sale','excise',1,2);await line('unknown-unit-line','excise-sale','unknown-unit',1,8);r=await report('2032-01-07');assert.equal(r.totals.costValue,8.2);assert.equal(r.totals.normalizedPurchaseCostLines,1);
  await sale('guards','2032-01-05T12:00Z');await line('foreign-line','guards','foreign',1,8);await line('mismatch-line','guards','mismatch',1,8);r=await report('2032-01-05');assert.equal(r.totals.costValue,9);assert.equal(r.totals.normalizedPurchaseCostLines,0);
  await purchase('later','small',1,24,24,24,'2032-01-03T09:00Z');await sale('return','2032-01-03T12:00Z','basket');await line('return-line','return','small',-1,-.5);r=await report('2032-01-03');assert.equal(r.totals.costValue,-.125);assert.equal(r.totals.returnTransactions,1);
  await sale('orphan','2032-01-06T12:00Z','absent');await line('orphan-line','orphan','small',-1,-.5);r=await report('2032-01-06');assert.equal(r.totals.grossProfit,null);assert.equal(r.totals.estimatedGrossProfit,null);assert.equal(r.totals.unestimatedCostLines,1);
  await sale('sibling','2032-01-02T12:00Z',null,'a2');await line('sibling-line','sibling','small',1,999);await sale('other-company','2032-01-02T12:00Z',null,'a1','b');await line('other-line','other-company','small',1,999);assert.equal((await report('2032-01-02')).totals.salesGross,2.5);
  await assert.rejects(report('2032-01-02','2032-01-02','EMPLOYEE'),/διαθέσιμη/);await assert.rejects(report('2032-01-02','2032-01-02','OWNER','a2'),/κατάστημα/);
  const digest=async()=>Promise.all(Object.keys(tables).map(name=>tx.$queryRawUnsafe(`SELECT md5(string_agg(row_to_json(t)::text,',' ORDER BY "id")) AS digest FROM "${name}" t`)));const before=await digest();await report('2031-12-31','2032-01-06');await report('2031-12-31','2032-01-06');assert.deepEqual(await digest(),before);
 },{timeout:40000});}finally{await db.$disconnect()}
});
