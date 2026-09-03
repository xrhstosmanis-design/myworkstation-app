import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd(),"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("new product modal keeps the selected invoice line values",()=>{
  const source=read("client/src/purchase-order-ocr-resolution-bootstrap.js");
  assert.match(source,/Στοιχεία από τη γραμμή του τιμολογίου/);
  assert.match(source,/data-supplier-code value="\$\{esc\(line\.supplierCode\|\|""\)\}"/);
  assert.match(source,/data-cost[^>]+value="\$\{invoiceUnitCost\}"/);
  assert.match(source,/data-invoice-unit/);
  assert.match(source,/data-pack/);
  assert.match(source,/data-piece-cost readonly/);
  assert.match(source,/landedInvoiceUnit\/size/);
  assert.match(source,/Number\(line\.vatRate\?\?candidate\.vatRate\?\?24\)/);
  assert.match(source,/supplierCode:supplierCode\.value\.trim\(\)\|\|null/);
  assert.match(source,/unitCost:Number\(String\(cost\.value\)/);
});

test("create-product persists invoice supplier code and purchase economics",()=>{
  const source=read("server/src/routes/purchase-order-ocr-resolution.js");
  assert.match(source,/supplierCode:z\.string\(\)\.trim\(\)\.max\(100\)/);
  assert.match(source,/unitCost:z\.coerce\.number\(\)\.min\(0\)\.max\(1000000\)/);
  assert.match(source,/invoiceUnit:z\.enum\(\["PIECE","PACKAGE"\]\)/);
  assert.match(source,/pieceCost=\(net\+excise\)\/\(quantity\*packSize\)/);
  assert.match(source,/"supplierCode"=\$\{supplierCode\|\|null\}/);
  assert.match(source,/"unitCost"=\$\{unitCost\}/);
  assert.match(source,/learnSupplierMapping\(tx,\{companyId:req\.user\.companyId,supplierId:line\.supplierId,supplierCode,productId,barcode,description:body\.name,userId:req\.user\.id,unitCost:pieceCost,unitsPerPackage:packSize\}\)/);
});

test("package conversion is learned and reused for later supplier invoices",()=>{
  const resolution=read("server/src/routes/purchase-order-ocr-resolution.js");
  const intake=read("server/src/routes/commerce-pos-v244-core.js");
  const posting=read("server/src/routes/purchase-order-unresolved-guard.js");
  assert.match(resolution,/"unitsPerPackage"=COALESCE\(EXCLUDED\."unitsPerPackage"/);
  assert.match(intake,/SELECT "supplierItemCode","productId","unitsPerPackage" FROM "SupplierProductMapping"/);
  assert.match(intake,/useLearnedPack\?\{unit:"PACKAGE",unitsPerPackage:learnedPack/);
  assert.match(intake,/invoiceIsPackage=.*PACKAGE\|PACK\|BOX\|CASE\|ΚΙΒ\|ΚΒ\|ΠΑΚ/);
  assert.match(posting,/if\(hasExplicit\)return \{size:selected/);
  assert.match(posting,/stockPackSize\(row\.description,row\.stockUnitsPerInvoiceUnit\)/);
});
