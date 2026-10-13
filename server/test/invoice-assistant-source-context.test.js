import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {loadInvoiceAssistantSource} from "../src/lib/invoice-assistant-source.js";
import {invoiceAssistantImageViews} from "../src/lib/invoice-assistant-image-views.js";
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test("explicit myDATA source never falls through to POS receipt photos when PDF linkage fails",async()=>{
 const calls=[];const db={$queryRaw:async(strings,...values)=>{const sql=strings.join("?");calls.push({sql,values});if(sql.includes('FROM "PurchaseOrder"'))return [{id:"doc",storeId:"s"}];if(sql.includes('FROM "MyDataInboundDocument"'))return [];throw Error("unexpected POS photo query")}};
 assert.deepEqual((await loadInvoiceAssistantSource(db,"c","o",{inboxId:"i",storeId:"s"})).pages,[]);
 assert.equal(calls.length,2);assert.deepEqual(calls[1].values,["i","c","s","doc"]);
 assert.deepEqual((await loadInvoiceAssistantSource(db,"c","o",{inboxId:"i",storeId:"foreign"})).pages,[]);
 assert.equal(calls.length,3);
});

test("native PostgreSQL binds exact myDATA original to the same draft/store while default POS retains photos",{skip:!isolated()},async()=>{
 const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="invoice_source_"+randomUUID().replaceAll("-","");
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 const pdf="data:application/pdf;base64,"+Buffer.from("%PDF-1.4 isolated-original").toString("base64"),photo="data:image/jpeg;base64,cGhvdG8=";
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "PurchaseOrder" ("id" text,"companyId" text,"sourceDocumentId" text,"supplierId" text,"status" text,"sourceType" text)',
   'CREATE TABLE "PurchaseDocument" ("id" text,"companyId" text,"storeId" text,"documentNumber" text,"totalGross" numeric,"supplierId" text,"status" text,"sourceType" text)',
   'CREATE TABLE "AiReaderJob" ("id" text,"companyId" text,"storeId" text,"purchaseDocumentId" text,"attachmentId" text,"createdAt" timestamptz,"resultJson" jsonb)',
   'CREATE TABLE "DocumentAttachment" ("id" text,"companyId" text,"storeId" text,"filename" text,"mimeType" text,"contentData" text)',
   'CREATE TABLE "DocumentInbox" ("id" text,"companyId" text,"storeId" text,"attachmentId" text,"status" text)',
   'CREATE TABLE "MyDataInboundDocument" ("inboxId" text,"companyId" text,"storeId" text)'
  ])await db.$executeRawUnsafe(sql);
  for(const sql of `INSERT INTO "PurchaseOrder" VALUES ('o','c','d','supplier','NEW','POS_OCR_DRAFT'),('other','c','other-doc','supplier','NEW','POS_OCR_DRAFT');INSERT INTO "PurchaseDocument" VALUES ('d','c','s','42',12.4,'supplier','DRAFT','POS_OCR_DRAFT'),('other-doc','c','s','43',13,'supplier','DRAFT','POS_OCR_DRAFT')`.split(';'))await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "DocumentAttachment" VALUES ('pdf','c','s','42.pdf','application/pdf',${pdf}),('photo','c','s','POS.jpg','image/jpeg',${photo}),('unlinked','c','s','wrong.pdf','application/pdf',${pdf}),('foreign','foreign','s','foreign.pdf','application/pdf',${pdf}),('store','c','other-store','store.pdf','application/pdf',${pdf})`;
  const resultJson=JSON.stringify({mydataPosReceipt:{attachmentIds:["photo"]}});
  await db.$executeRaw`INSERT INTO "AiReaderJob" VALUES ('j','c','s','d','pdf',NOW(),${resultJson}::jsonb)`;
  for(const sql of `INSERT INTO "DocumentInbox" VALUES ('i','c','s','pdf','IN_REVIEW'),('wrong','c','s','unlinked','IN_REVIEW'),('foreign','foreign','s','foreign','IN_REVIEW'),('store','c','other-store','store','IN_REVIEW'),('deleted','c','s','missing','IN_REVIEW'),('image','c','s','photo','IN_REVIEW');INSERT INTO "MyDataInboundDocument" VALUES ('i','c','s'),('wrong','c','s'),('foreign','foreign','s'),('store','c','other-store'),('deleted','c','s'),('image','c','s')`.split(';'))await db.$executeRawUnsafe(sql);
  const snapshot=async()=>JSON.stringify(await db.$queryRawUnsafe('SELECT row_to_json(j) FROM "AiReaderJob" j UNION ALL SELECT row_to_json(a) FROM "DocumentAttachment" a'));
  const before=await snapshot();
  const pos=await loadInvoiceAssistantSource(db,"c","o");assert.equal(pos.pages[0].contentData,photo);
  const original=await loadInvoiceAssistantSource(db,"c","o",{inboxId:"i",storeId:"s"});assert.equal(original.pages.length,1);assert.equal(original.pages[0].contentData,pdf);
  const inputs=await invoiceAssistantImageViews(original.pages);assert.deepEqual(inputs.filter(x=>x.type==="input_file").map(x=>x.file_data),[pdf]);assert.equal(inputs.some(x=>x.type==="input_image"),false);
  for(const inboxId of ["wrong","foreign","store","deleted","image","missing"])assert.deepEqual((await loadInvoiceAssistantSource(db,"c","o",{inboxId,storeId:"s"})).pages,[],inboxId);
  assert.deepEqual((await loadInvoiceAssistantSource(db,"c","other",{inboxId:"i",storeId:"s"})).pages,[]);
  assert.equal(await loadInvoiceAssistantSource(db,"foreign","o",{inboxId:"i",storeId:"s"}),null);
  assert.deepEqual((await loadInvoiceAssistantSource(db,"c","o",{inboxId:"i",storeId:"other-store"})).pages,[]);
  assert.equal(await snapshot(),before);
  await db.$executeRawUnsafe(`UPDATE "DocumentInbox" SET "status"='PROCESSED' WHERE "id"='i'`);
  assert.deepEqual((await loadInvoiceAssistantSource(db,"c","o",{inboxId:"i",storeId:"s"})).pages,[]);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
