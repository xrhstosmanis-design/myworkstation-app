import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import XLSX from 'xlsx';
import {readInventoryReconciliation} from '../src/services/inventory-reconciliation-source.js';
import {inventoryReconciliationWorkbook} from '../src/services/inventory-reconciliation-export.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native evidence reader: accepted consumption, exact postings, audited returns, invoices, late facts, scope and unchanged sources',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`inventory_evidence_test_${randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  const definitions={
    Store:'"id" text primary key,"companyId" text',User:'"id" text primary key,"companyId" text,"fullName" text',Employee:'"id" text primary key,"companyId" text,"fullName" text',
    Product:'"id" text primary key,"companyId" text,"name" text,"sku" text',
    Stocktake:'"id" text primary key,"companyId" text,"storeId" text,"name" text,"status" text,"startedAt" timestamp,"finalizedAt" timestamp',
    StocktakeLine:'"id" text primary key,"stocktakeId" text,"productId" text,"countedAt" timestamp,"countedQuantity" numeric,"unitCost" numeric',
    InventoryCountEvent:'"id" text primary key,"companyId" text,"storeId" text,"stocktakeId" text,"lineId" text,"eventType" text,"previousQuantity" numeric,"countedQuantity" numeric,"expectedQuantity" numeric,"actorName" text,"source" text,"createdAt" timestamptz',
    StockMovement:'"id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"idempotencyKey" text,"note" text,"createdByUserId" text,"createdAt" timestamp',
    PurchaseOrder:'"id" text primary key,"companyId" text,"storeId" text,"sourceDocumentId" text',
    PurchaseDocument:'"id" text primary key,"companyId" text,"storeId" text,"supplierId" text,"documentNumber" text,"documentType" text,"documentDate" timestamp,"status" text,"sourceType" text,"createdAt" timestamp,"updatedAt" timestamp,"purchaseOrderId" text',
    PurchaseDocumentLine:'"id" text primary key,"purchaseDocumentId" text,"productId" text,"quantity" numeric,"unit" text,"unitsPerPackage" numeric,"unitCost" numeric,"netAmount" numeric',
    Supplier:'"id" text primary key,"companyId" text,"name" text,"taxId" text',
    InvoiceStockPosting:'"companyId" text,"storeId" text,"sourceDocumentId" text,"postedDocumentId" text,"orderId" text,"path" text',
    InvoiceDraftAlias:'"companyId" text,"storeId" text,"aliasDocumentId" text,"canonicalDocumentId" text',
    Sale:'"id" text primary key,"companyId" text,"storeId" text,"status" text,"source" text,"occurredAt" timestamp,"createdAt" timestamp,"originalSaleId" text,"reversalKind" text,"operatorEmployeeId" text',
    SaleLine:'"id" text primary key,"saleId" text,"productId" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"lineTotal" numeric',
    PosSaleActionAudit:'"id" text primary key,"companyId" text,"storeId" text,"saleId" text,"relatedSaleId" text,"actionType" text,"actorName" text,"reason" text,"details" jsonb,"createdAt" timestamptz',
    StoreOperatorAudit:'"id" text primary key,"companyId" text,"storeId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz,"actorId" text',
    ProductPriceHistory:'"id" text primary key,"companyId" text,"storeId" text,"productId" text,"oldPrice" numeric,"newPrice" numeric,"changeType" text,"createdByUserId" text,"createdAt" timestamp'
  };
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const [name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
    for(const sql of [
      `INSERT INTO "Store" VALUES('s','c'),('control','c'),('foreign','other')`,
      `INSERT INTO "User" VALUES('owner','c','Ελεγκτής')`,
      `INSERT INTO "Employee" VALUES('operator','c','Χειριστής')`,
      `INSERT INTO "Product" VALUES('p','c','LAB TEST','LAB-01')`,
      `INSERT INTO "Stocktake" VALUES('old','c','s','Παλιά','FINALIZED','2026-10-01 01:00','2026-10-01 04:00'),('new','c','s','Νέα','FINALIZED','2026-10-01 08:00','2026-10-01 12:00')`,
      `INSERT INTO "StocktakeLine" VALUES('a','old','p','2026-10-01 02:00',10,2),('b','new','p','2026-10-01 10:00',4,2)`,
      `INSERT INTO "InventoryCountEvent" VALUES('ea','c','s','old','a','COUNT',NULL,10,10,'Ελεγκτής','BACKOFFICE','2026-10-01 02:00Z'),('eb','c','s','new','b','COUNT',NULL,4,5,'Ελεγκτής','BACKOFFICE','2026-10-01 10:00Z')`,
      `INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId","createdAt") VALUES('baseline','s','p','STOCKTAKE_ADJUSTMENT',-1,'INVENTORY_V2','old','2026-10-01 04:00'),('waste','s','p','WASTE',-4,'PRODUCT_CARD','p','2026-10-01 06:00')`,
      `INSERT INTO "Sale" VALUES('self','c','s','COMPLETED','SELF_CONSUMPTION','2026-10-01 07:00','2026-10-01 07:00',NULL,NULL,'operator'),('foreign-sale','other','foreign','COMPLETED','SELF_CONSUMPTION','2026-10-01 07:00','2026-10-01 07:00',NULL,NULL,NULL)`,
      `INSERT INTO "SaleLine" VALUES('self-line','self','p',1,2,0,0),('foreign-line','foreign-sale','p',999,2,0,0)`,
      `INSERT INTO "PosSaleActionAudit" VALUES('self-audit','c','s','self',NULL,'SELF_CONSUMPTION','Ελεγκτής','Αποδοχή','{"items":[{"productId":"p","quantity":1}]}','2026-10-01 07:00Z')`,
      `INSERT INTO "StoreOperatorAudit" VALUES('cart','c','s','CART_ITEM_REMOVE','{"productId":"p","quantity":244,"customerSecret":"NEVER EXPORT"}','2026-10-01 07:00Z','owner'),('foreign-audit','c','control','PRICE_CHANGE','{"productId":"p","quantity":999}','2026-10-01 07:00Z','owner')`,
      `INSERT INTO "ProductPriceHistory" VALUES('price','c','s','p',2,3,'STORE_PRICE','owner','2026-10-01 07:00')`
    ])await db.$executeRawUnsafe(sql);
    const current=(await db.$queryRaw`SELECT * FROM "Stocktake" WHERE "id"='new'`)[0];
    const snapshot=async()=>{const result={};for(const name of Object.keys(definitions))result[name]=await db.$queryRawUnsafe(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM "${name}" t`);return result;};
    const read=async()=>{const before=await snapshot(),r=await readInventoryReconciliation(db,current,'old');assert.deepEqual(await snapshot(),before);return r;};
    let report=await read();assert.equal(report.rows[0].expectedQuantity,5);assert.equal(report.rows[0].difference,-1);assert.equal(report.summary.shortageValue,2);assert.equal(report.sourceEvidence.checkedCounts.transactions,1);assert.equal(report.rows[0].movements.filter(x=>x.id==='sale-line:self-line').length,1);assert.equal(report.rows[0].findings.includes('LEDGER_COUNT_EXPECTED_MISMATCH'),false);
    assert.equal(report.sourceEvidence.systemEvents.find(x=>x.id==='cart').stockImpact,'NONE');assert.equal(report.sourceEvidence.systemEvents.find(x=>x.id==='price').changes.newPrice,3);assert.doesNotMatch(JSON.stringify(report),/NEVER EXPORT|foreign-sale|foreign-audit/);
    for(const sql of [
      `INSERT INTO "Sale" VALUES('normal','c','s','COMPLETED','POS','2026-10-01 06:30','2026-10-01 06:30',NULL,NULL,'operator'),('reverse','c','s','COMPLETED','POS_REVERSAL','2026-10-01 08:30','2026-10-01 08:30','normal','RETURN','operator')`,
      `INSERT INTO "SaleLine" VALUES('normal-line','normal','p',2,3,1,5),('reverse-line','reverse','p',-2,3,-1,-5)`,
      `INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId","createdAt") VALUES('normal-posting','s','p','SALE',-2,'POS_SALE','normal','2026-10-01 06:30')`,
      `INSERT INTO "PosSaleActionAudit" VALUES('return-audit','c','s','reverse','normal','RETURN','Ελεγκτής','Επιστροφή','{"stockRestoredProductIds":["p"]}','2026-10-01 08:30Z'),('return-audit-copy','c','s','reverse','normal','RETURN','Ελεγκτής','Δεύτερο audit','{"stockRestoredProductIds":["p"]}','2026-10-01 08:30Z')`
    ])await db.$executeRawUnsafe(sql);
    report=await read();assert.equal(report.rows[0].difference,-1);assert.equal(report.rows[0].movements.filter(x=>x.sourceId==='normal').length,1);assert.equal(report.rows[0].movements.filter(x=>x.sourceId==='reverse').length,1);
    for(const sql of [
      `INSERT INTO "Supplier" VALUES('supplier','c','Προμηθευτής','123456789')`,
      `INSERT INTO "PurchaseDocument" VALUES('gift','c','s','supplier','N1','INVOICE','2026-10-01 09:00','APPROVED','MANUAL','2026-10-01 09:00','2026-10-01 09:00',NULL),('ocr-alias','c','s','supplier','N1','INVOICE','2026-10-01 09:00','MERGED','OCR','2026-10-01 09:00','2026-10-01 09:00',NULL),('value-credit','c','s','supplier','C1','CREDIT_NOTE','2026-10-01 09:00','APPROVED','MANUAL','2026-10-01 09:00','2026-10-01 09:00',NULL)`,
      `INSERT INTO "PurchaseDocumentLine" VALUES('gift-line','gift','p',2,'PACKAGE',12,0,0),('alias-line','ocr-alias','p',2,'PACKAGE',12,0,0),('value-line','value-credit','p',0,'PIECE',NULL,0,-20)`,
      `INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId","createdAt") VALUES('gift-posting','s','p','PURCHASE',24,'PURCHASE_DOCUMENT','gift','2026-10-01 09:00')`,
      `INSERT INTO "InvoiceStockPosting" VALUES('c','s','gift','gift',NULL,'DOCUMENT_APPROVAL')`,
      `INSERT INTO "InvoiceDraftAlias" VALUES('c','s','ocr-alias','gift')`
    ])await db.$executeRawUnsafe(sql);
    report=await read();assert.equal(report.rows[0].expectedQuantity,29);assert.equal(report.rows[0].difference,-25);assert.equal(report.rows[0].unitCost,2);assert.equal(report.sourceEvidence.invoices.find(x=>x.id==='gift').lines[0].baseQuantity,24);assert.equal(report.sourceEvidence.invoices.find(x=>x.id==='gift').findings.includes('POSSIBLE_DUPLICATE_INVOICE_IDENTITY'),false);assert.ok(report.sourceEvidence.invoices.find(x=>x.id==='value-credit').findings.includes('VALUE_CREDIT_NO_MERCHANDISE_QUANTITY'));
    const wb=XLSX.read(inventoryReconciliationWorkbook(report),{type:'buffer'});assert.equal(wb.SheetNames.length,10);assert.equal(wb.Sheets['Καταμετρήσεις'].F2.v,10);assert.equal(wb.Sheets['Γραμμές παραστατικών'].G2.v,24);assert.equal(wb.Sheets['Συμβάντα πηγών'].I2.v,'NONE');
    await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('late','c','s','supplier','L1','INVOICE','2026-09-01','APPROVED','MANUAL','2026-10-01 09:00','2026-10-01 09:00',NULL)`);
    await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine" VALUES('late-line','late','p',1,'PIECE',NULL,2,2)`);
    await db.$executeRawUnsafe(`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId","createdAt") VALUES('late-posting','s','p','PURCHASE',1,'PURCHASE_DOCUMENT','late','2026-10-01 09:00')`);
    report=await read();assert.equal(report.rows[0].expectedQuantity,null);assert.equal(report.rows[0].recordedExpectedQuantity,30);assert.equal(report.summary.netValue,null);assert.ok(report.rows[0].findings.includes('LATE_DOCUMENT_PHYSICAL_TIME_UNKNOWN'));
    await db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('late-sync','c','s','COMPLETED','SELF_CONSUMPTION','2026-10-01 09:00','2026-10-01 13:00',NULL,NULL,'operator')`);
    await db.$executeRawUnsafe(`INSERT INTO "SaleLine" VALUES('late-sync-line','late-sync','p',1,3,0,0)`);
    await db.$executeRawUnsafe(`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId","createdAt") VALUES('late-sync-posting','s','p','SALE',-1,'POS_SALE','late-sync','2026-10-01 13:00')`);
    report=await read();assert.equal(report.rows[0].recordedExpectedQuantity,30);assert.equal(report.rows[0].movements.some(x=>x.id==='sale-line:late-sync-line'),false);assert.deepEqual(report.sourceEvidence.transactions.find(x=>x.id==='late-sync').postingIds,['late-sync-posting']);assert.ok(report.rows[0].findings.includes('TRANSACTION_CROSSES_COUNT_TIME'));
    await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" SELECT 'cap-'||n,'c','s','CART_CANCEL','{}','2026-10-01 07:00Z','owner' FROM generate_series(1,10001) n`);
    await assert.rejects(readInventoryReconciliation(db,current,'old'),{status:413,code:'INVENTORY_EVIDENCE_LIMIT'});
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
