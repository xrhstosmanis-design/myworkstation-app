import {randomUUID} from "node:crypto";
import {ensureInvoiceCommonDraftSchema} from "../../src/lib/invoice-common-draft.js";
export const isolatedInvoiceDb=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
export async function invoiceDbFixture(){
 const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="invoice_common_"+randomUUID().replaceAll("-","");
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const definitions={
  PurchaseOrder:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"supplierId" text,"status" text,"invoiceNumber" text,"description" text,"sourceType" text,"sourceDocumentId" text,"createdAt" timestamptz DEFAULT NOW(),"updatedAt" timestamptz DEFAULT NOW(),"finalizedAt" timestamptz,"invoicedAt" timestamptz,"createdByUserId" text,"createdByName" text,"updatedByName" text',
  PurchaseDocument:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"supplierId" text,"documentType" text,"documentNumber" text,"documentDate" timestamptz,"totalNet" numeric DEFAULT 0,"totalVat" numeric DEFAULT 0,"totalGross" numeric,"status" text,"sourceType" text,"purchaseOrderId" text,"paymentTransactionId" text,"settlementMode" text,"createdByUserId" text,"updatedAt" timestamptz DEFAULT NOW()',
  PurchaseOrderLine:'"id" text PRIMARY KEY,"orderId" text,"productId" text,"supplierCode" text,"description" text,"quantity" numeric,"unitCost" numeric,"netAmount" numeric,"exciseTotal" numeric DEFAULT 0,"vatRate" numeric,"vatAmount" numeric,"grossAmount" numeric,"proposedSalePrice" numeric DEFAULT 0,"invoiceUnit" text DEFAULT \'PIECE\',"stockUnitsPerInvoiceUnit" numeric DEFAULT 1,"discount1" numeric DEFAULT 0,"discount2" numeric DEFAULT 0,"discount3" numeric DEFAULT 0,"ocrSequence" int,"ocrRawText" text,"createdAt" timestamptz DEFAULT NOW()',
  PurchaseDocumentLine:'"id" text PRIMARY KEY,"purchaseDocumentId" text,"productId" text,"supplierItemCode" text,"supplierBarcode" text,"description" text,"quantity" numeric,"unit" text,"unitsPerPackage" numeric DEFAULT 1,"unitCost" numeric,"netAmount" numeric,"vatRate" numeric,"vatAmount" numeric,"grossAmount" numeric',
  Supplier:'"id" text PRIMARY KEY,"companyId" text,"taxId" text,"name" text,"active" boolean DEFAULT true',
  Store:'"id" text PRIMARY KEY,"companyId" text,"name" text',
  StoreTransaction:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"supplierId" text,"type" text,"amount" numeric,"occurredAt" timestamptz DEFAULT NOW(),"invoiceDocumentNumber" text,"invoicePaymentKey" text,"attachmentFilename" text,"reversedAt" timestamptz,"description" text',
  DocumentInbox:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"attachmentId" text,"status" text,"note" text,"updatedAt" timestamptz DEFAULT NOW()',
  DocumentAttachment:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"filename" text,"mimeType" text,"contentData" text,"checksum" text',
  AiReaderJob:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"purchaseDocumentId" text,"attachmentId" text,"createdAt" timestamptz DEFAULT NOW(),"updatedAt" timestamptz DEFAULT NOW(),"resultJson" jsonb DEFAULT \'{}\',"status" text DEFAULT \'AWAITING_APPROVAL\',"stage" text DEFAULT \'READY\'',
  MyDataInboundDocument:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"inboxId" text UNIQUE,"mark" text,"issuerVat" text,"counterpartVat" text,"series" text,"documentNumber" text,"issueDate" timestamptz,"invoiceType" text DEFAULT \'1.1\',"totalGross" numeric,"rawPayload" jsonb DEFAULT \'{}\',"fetchedAt" timestamptz DEFAULT NOW()',
  Product:'"id" text PRIMARY KEY,"companyId" text,"trackStock" boolean DEFAULT true,"costPrice" numeric,"salePrice" numeric,"updatedAt" timestamptz DEFAULT NOW()',
  StoreProduct:'"id" text PRIMARY KEY,"storeId" text,"productId" text,"currentStock" numeric,"salePrice" numeric,"updatedAt" timestamptz DEFAULT NOW(),UNIQUE("storeId","productId")',
  StockMovement:'"id" text PRIMARY KEY,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text',
  SupplierProductLink:'"id" text PRIMARY KEY,"companyId" text,"supplierId" text,"productId" text,"supplierCode" text,"active" boolean,"source" text,"updatedBy" text,"updatedByName" text,"updatedAt" timestamptz DEFAULT NOW(),UNIQUE("companyId","supplierId","productId")',
  SupplierProductMapping:'"id" text PRIMARY KEY,"companyId" text,"supplierId" text,"supplierItemCode" text,"productId" text,"supplierBarcode" text,"lastDescription" text,"unitsPerPackage" numeric,"lastUnitCost" numeric,"usageCount" int,"confirmedByUserId" text,"confirmedAt" timestamptz,"lastSeenAt" timestamptz,"updatedAt" timestamptz,UNIQUE("companyId","supplierId","supplierItemCode")'
 };
 for(const[name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
 await ensureInvoiceCommonDraftSchema(db);
 await db.$executeRawUnsafe(`INSERT INTO "Supplier"("id","companyId","taxId","name") VALUES('sup','c','099999999','Isolated supplier')`);
 await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','Isolated'),('control','c','Control')`);
 await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId") VALUES('p','c');`);
 await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES('stock','s','p',10),('control-stock','control','p',20)`);
 const seed=async({pos=true,mydata=true,wrong=false,payment=true,posLines=0,mydataLines=0}={})=>{
  const posNumber=wrong?'21-1AA 006836':'21-ΤΔΑ 006836',posDate=wrong?'2023-10-12':'2026-10-12',posGross=wrong?5.39:3.39;
  await db.$executeRawUnsafe(`INSERT INTO "DocumentAttachment" VALUES('pdf','c','s','original.pdf','application/pdf','data:application/pdf;base64,JVBERi0xLjQ=','pdf-hash'),('photo','c','s','POS.jpg','image/jpeg','data:image/jpeg;base64,cGhvdG8=','photo-hash')`);
  await db.$executeRawUnsafe(`INSERT INTO "DocumentInbox"("id","companyId","storeId","attachmentId","status") VALUES('inbox','c','s','pdf','IN_REVIEW')`);
  const raw=JSON.stringify(mydata?{mydataDraftOrderId:'mydata',mydataDraftDocumentId:'d-mydata'}:{});
  await db.$executeRaw`INSERT INTO "MyDataInboundDocument"("id","companyId","storeId","inboxId","mark","issuerVat","counterpartVat","series","documentNumber","issueDate","totalGross","rawPayload") VALUES('m','c','s','inbox','400015624303633','099999999','088888888','21-ΤΔΑ','6836',${new Date('2026-10-12')},3.39,${raw}::jsonb)`;
  if(payment)await db.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber","invoicePaymentKey","attachmentFilename") VALUES('payment','c','s','sup','SUPPLIER_PAYMENT',${posGross},${posNumber},'original-key','d-pos')`;
  for(const [enabled,id,number,docDate,gross,lineCount,pay]of [[pos,'pos',posNumber,posDate,posGross,posLines,payment],[mydata,'mydata','21-ΤΔΑ 6836','2026-10-12',3.39,mydataLines,false]])if(enabled){
   await db.$executeRaw`INSERT INTO "PurchaseDocument"("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross","status","sourceType","purchaseOrderId","paymentTransactionId","settlementMode") VALUES(${'d-'+id},'c','s','sup','INVOICE',${number},${new Date(docDate)},${gross},'DRAFT','POS_OCR_DRAFT',${id},${pay?'payment':null},${pay?'PAID':'CREDIT'})`;
   await db.$executeRaw`INSERT INTO "PurchaseOrder"("id","companyId","storeId","supplierId","status","invoiceNumber","description","sourceType","sourceDocumentId") VALUES(${id},'c','s','sup','NEW',${number},'isolated','POS_OCR_DRAFT',${'d-'+id})`;
   if(lineCount)await db.$executeRaw`INSERT INTO "PurchaseOrderLine"("id","orderId","productId","supplierCode","description","quantity","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES(${'line-'+id},${id},'p','CODE','Isolated printed row',3,1,3,13,.39,3.39)`;
  }
  const handoff=JSON.stringify({posHandoff:{pageJobIds:['j-pos'],documentNumber:posNumber,documentDate:posDate,totalGross:posGross}});
  await db.$executeRaw`INSERT INTO "AiReaderJob"("id","companyId","storeId","purchaseDocumentId","attachmentId","createdAt","resultJson") VALUES('j-pdf','c','s',${mydata?'d-mydata':null},'pdf',${new Date(mydata?'2026-10-12T04:36Z':'2026-10-12T04:56Z')},'{}'),('j-pos','c','s',${pos?'d-pos':null},'photo',${new Date('2026-10-12T04:46Z')},${handoff}::jsonb)`;
 };
 const snapshot=async()=>{
  const data={};for(const table of ['StoreProduct','StoreTransaction','StockMovement'])data[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY t."id"`);return JSON.stringify(data);
 };
 return {db,seed,snapshot,close:async()=>{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}};
}
