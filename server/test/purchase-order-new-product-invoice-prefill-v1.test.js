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
  assert.match(source,/data-discount1/);
  assert.match(source,/data-discount2/);
  assert.match(source,/data-discount3/);
  assert.match(source,/data-excise/);
  assert.match(source,/data-markup/);
  assert.match(source,/factor=\(1-clampDiscount\(discount1\)\/100\)\*\(1-clampDiscount\(discount2\)\/100\)\*\(1-clampDiscount\(discount3\)\/100\)/);
  assert.match(source,/grossPieceCost\(\)\*\(1\+num\(markup\)\/100\)/);
  assert.match(source,/Number\(line\.vatRate\?\?candidate\.vatRate\?\?24\)/);
  assert.match(source,/supplierCode:supplierCode\.value\.trim\(\)\|\|null/);
  assert.match(source,/unitCost:num\(cost\)/);
});

test("invoice order review formats money and discounts and permits description correction",()=>{
  const source=fs.readFileSync(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js",import.meta.url),"utf8");
  assert.match(source,/const roundMoney=value=>Math\.round\(\(Number\(value\|\|0\)\+Number\.EPSILON\)\*100\)\/100/);
  assert.match(source,/const compactNumber=/);
  assert.match(source,/compactNumber\(l\.discount1\)/);
  assert.doesNotMatch(source,/l\.discount1\.toFixed\(8\)/);
  assert.match(source,/name="description" maxlength="250" value="\$\{esc\(l\.description\)\}"/);
  assert.match(source,/description:String\(f\.get\("description"\)\|\|""\)\.trim\(\)/);
});

test("invoice detail subtotal adds the same rounded net values shown per line",()=>{
  const source=read("server/src/routes/purchase-orders.js");
  assert.match(source,/const money2=value=>Math\.round/);
  assert.match(source,/a\.net=money2\(a\.net\+money2\(r\.netAmount\)\)/);
});

test("create-product persists invoice supplier code and purchase economics",()=>{
  const source=read("server/src/routes/purchase-order-ocr-resolution.js");
  assert.match(source,/supplierCode:z\.string\(\)\.trim\(\)\.max\(100\)/);
  assert.match(source,/unitCost:z\.coerce\.number\(\)\.min\(0\)\.max\(1000000\)/);
  assert.match(source,/invoiceUnit:z\.enum\(\["PIECE","PACKAGE"\]\)/);
  assert.match(source,/discount1:z\.coerce\.number\(\)\.min\(0\)\.max\(100\)/);
  assert.match(source,/exciseTotal:z\.coerce\.number\(\)\.min\(0\)/);
  assert.match(source,/markupPercent:z\.coerce\.number\(\)\.min\(-100\)\.max\(10000\)/);
  assert.match(source,/pieceCost=\(net\+excise\)\/\(quantity\*packSize\)/);
  assert.match(source,/"discount1"=\$\{body\.discount1\}/);
  assert.match(source,/"exciseTotal"=\$\{excise\}/);
  assert.match(source,/"markupPercent"=\$\{body\.markupPercent\}/);
  assert.match(source,/"supplierCode"=\$\{supplierCode\|\|null\}/);
  assert.match(source,/"unitCost"=\$\{unitCost\}/);
  assert.match(source,/learnSupplierMapping\(tx,\{companyId:req\.user\.companyId,supplierId:line\.supplierId,supplierCode,productId,barcode,description:body\.name,userId:req\.user\.id,unitCost:pieceCost,unitsPerPackage:packSize,discount1:body\.discount1,discount2:body\.discount2,discount3:body\.discount3,excisePerInvoiceUnit:excise\/quantity,markupPercent:body\.markupPercent\}\)/);
  assert.match(source,/"lastDiscount1"=EXCLUDED\."lastDiscount1"/);
  assert.match(source,/"lastExcisePerInvoiceUnit"=EXCLUDED\."lastExcisePerInvoiceUnit"/);
  assert.match(source,/"lastMarkupPercent"=EXCLUDED\."lastMarkupPercent"/);
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

test("confirmed edits of matched invoice lines update supplier learning",()=>{
  const source=read("server/src/routes/purchase-orders.js");
  assert.match(source,/async function learnConfirmedLineCorrection/);
  assert.match(source,/ON CONFLICT \("companyId","supplierId","supplierItemCode"\) DO UPDATE SET/);
  assert.match(source,/"lastDiscount1"=EXCLUDED\."lastDiscount1"/);
  assert.match(source,/"lastDiscount2"=EXCLUDED\."lastDiscount2"/);
  assert.match(source,/"lastDiscount3"=EXCLUDED\."lastDiscount3"/);
  assert.match(source,/learnConfirmedLineCorrection\(tx,\{companyId,supplierId:found\.supplierId,line:corrected,userId:req\.user\.id\}\)/);
  assert.match(source,/res\.json\(\{ok:true,\.\.\.c,mappingLearned\}\)/);
});
