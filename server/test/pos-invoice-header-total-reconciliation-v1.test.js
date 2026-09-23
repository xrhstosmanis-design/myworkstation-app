import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {reconcileInvoiceLines,reviewablePrintedTableForPersistence,verifiedPrintedTableForPersistence} from "../src/invoice-line-reconciliation.js";

test("a complete 20-row invoice may retain two identified uncertain rows for review",()=>{
  const rows=Array.from({length:20},(_,index)=>({rawText:`${10000+index} PRODUCT ${index+1}`,code:String(10000+index),description:`PRODUCT ${index+1}`,quantity:1,unitCost:index>=18?2:1,netAmount:index>=18?2:1,vatRate:13,grossAmount:index>=18?2.26:1.13,sourceColumnsVerified:index<18}));
  const result=reviewablePrintedTableForPersistence(rows,25);
  assert.equal(result?.length,20);
  assert.equal(result.filter(row=>row.sourceColumnsVerified===false).length,2);
  assert.equal(reviewablePrintedTableForPersistence(rows.slice(0,2),25),null,"an incomplete read cannot masquerade as two corrections");
  assert.equal(reviewablePrintedTableForPersistence(rows.map((row,index)=>({...row,sourceColumnsVerified:index<17})),25),null,"three uncertain lines exceed the accepted limit");
  assert.equal(reviewablePrintedTableForPersistence(rows.map((row,index)=>index===0?{...row,netAmount:13}:row),25),null,"a verified row with corrupt economics remains blocked");
});

test("header total wins when it equals the sum of net OCR lines",()=>{
  const lines=[
    {description:"TEREA YELLOW",netAmount:74.06,vatRate:100,grossAmount:1372.23},
    {description:"MARLBORO GOLD",netAmount:137.10,vatRate:100,grossAmount:2817.41},
    {description:"OTHER",netAmount:703.53,vatRate:0,grossAmount:703.53}
  ];
  const result=reconcileInvoiceLines(lines,914.69);
  assert.equal(result.strategy,"HEADER_TOTAL_EQUALS_NET");
  assert.equal(result.netTotal,914.69);
  assert.equal(result.grossTotal,914.69);
  assert.equal(result.difference,0);
  assert.deepEqual(result.normalizedLines.map(line=>line.vatRate),[0,0,0]);
  assert.deepEqual(result.normalizedLines.map(line=>line.grossAmount),[74.06,137.1,703.53]);
});

test("canonical VAT is rebuilt and non-canonical OCR VAT cannot inflate totals",()=>{
  const result=reconcileInvoiceLines([{netAmount:100,vatRate:24,grossAmount:999},{netAmount:50,vatRate:83,grossAmount:5000}],174);
  assert.equal(result.strategy,"NET_PLUS_CANONICAL_VAT");
  assert.equal(result.grossTotal,174);
  assert.deepEqual(result.normalizedLines.map(line=>line.grossAmount),[124,50]);
});


test("a complete verified printed table persists without a second heuristic reinterpretation",()=>{
  const lines=[
    {code:"00206",description:"RED BULL SUGAR FREE 0,355LT ΚΟΥΤΙ",quantity:24,unit:"TEM",unitCost:1.10,initialAmount:26.40,discount1:0,discount1Amount:0,netAmount:26.40,exciseTotal:0,vatRate:13,grossAmount:29.83,sourceColumnsVerified:true,quantitySource:"AI_COMPLETE_PRINTED_TABLE_VERIFIED"},
    {code:"11",description:"RED BULL 0,25LT ΚΟΥΤΙ",quantity:24,unit:"TEM",unitCost:.95,initialAmount:22.80,discount1:0,discount1Amount:0,netAmount:22.80,exciseTotal:0,vatRate:13,grossAmount:25.76,sourceColumnsVerified:true,quantitySource:"AI_COMPLETE_PRINTED_TABLE_VERIFIED"},
    {code:"12798",description:"ΛΟΥΞ Π/Α Λ ΜΠΛΕ 0,33LT PET (10+2)",quantity:1,unit:"PACKAGE",unitsPerPackage:12,unitCost:6.82,initialAmount:6.82,discount1:19,discount1Amount:1.30,netAmount:5.52,exciseTotal:0,vatRate:13,grossAmount:6.24,sourceColumnsVerified:true,quantitySource:"AI_COMPLETE_PRINTED_TABLE_VERIFIED"}
  ];
  const persisted=verifiedPrintedTableForPersistence(lines,61.83);
  assert.ok(persisted);
  assert.deepEqual(persisted.map(line=>[line.code,line.quantity,line.unit,line.unitsPerPackage,line.discount1,line.discount1Amount,line.netAmount]),[
    ["00206",24,"TEM",undefined,0,0,26.4],
    ["11",24,"TEM",undefined,0,0,22.8],
    ["12798",1,"PACKAGE",12,19,1.3,5.52]
  ]);
  assert.equal(verifiedPrintedTableForPersistence(lines,62),null,"the independent invoice total remains mandatory");
  assert.equal(verifiedPrintedTableForPersistence([{...lines[0],sourceColumnsVerified:false}],29.83),null,"partial OCR rows still use the guarded finalizer");
});

test("existing POS OCR drafts have an idempotent safe repair route",()=>{
  const source=fs.readFileSync(new URL("../src/routes/purchase-orders.js",import.meta.url),"utf8");
  assert.match(source,/\/:orderId\/reconcile-ocr-total/);
  assert.match(source,/Math\.abs\(headerTotal-netTotal\)>0\.05/);
  assert.match(source,/"grossAmount"="netAmount"/);
  assert.match(source,/found\.sourceType!=="POS_OCR_DRAFT"/);
});

test("supplier reading knowledge is global by VAT while product ids stay tenant-safe",()=>{
  const intake=fs.readFileSync(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
  const posting=fs.readFileSync(new URL("../src/routes/purchase-order-posting-guard.js",import.meta.url),"utf8");
  const learning=fs.readFileSync(new URL("../src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");
  const knowledge=fs.readFileSync(new URL("../src/lib/invoice-learning-product-knowledge.js",import.meta.url),"utf8");
  const profileTable=learning.match(/CREATE TABLE IF NOT EXISTS "SupplierInvoiceLearningProfile"[\s\S]*?\)`/u)?.[0]||"";
  assert.doesNotMatch(profileTable,/"companyId"|"storeId"/);
  assert.match(knowledge,/WHERE \(\$1<>'' AND "supplierTaxId"=\$1\)/);
  assert.match(intake,/FROM "SupplierProductMapping" WHERE "companyId"=\$\{companyId\} AND "supplierId"=\$\{supplierId\}/);
  assert.match(posting,/ON CONFLICT \("companyId","supplierId","productId"\) DO UPDATE/);
});

test("POS full OCR cannot lose the confirmed supplier's fail-closed verifier",()=>{
  const reader=fs.readFileSync(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
  assert.match(reader,/SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=\$\{posHandoff\.supplierId\}/);
  assert.match(reader,/trustedHandoffSupplier=supplierRows\[0\]\|\|null/);
  assert.match(reader,/parsed\.supplier=\{\.\.\.\(parsed\.supplier&&typeof parsed\.supplier==="object"\?parsed\.supplier:\{\}\),name:trustedHandoffSupplier\.name\|\|"",taxId:trustedHandoffSupplier\.taxId\|\|""\}/);
  assert.ok(reader.indexOf("parsed.posHandoffSupplierApplied=true")<reader.indexOf('failureStage="apply-supplier-profile-initial"'));
  assert.match(reader,/if\(mantzilasInvoice&&pageJobs\.length===1&&invoiceTotal>0&&Math\.abs\(parsed\.productLinesTotalDifference\)>0\.05\)/);
});
