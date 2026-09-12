import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const bootstrap=fs.readFileSync(new URL("../src/owner-product-bootstrap.js",import.meta.url),"utf8");
const route=fs.readFileSync(new URL("../src/routes/owner-products.js",import.meta.url),"utf8");
const activeCatalog=fs.readFileSync(new URL("../src/routes/owner-products-active-catalog.js",import.meta.url),"utf8");
const smartEntry=fs.readFileSync(new URL("../src/routes/owner-product-smart-entry.js",import.meta.url),"utf8");
const serverIndex=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/commerce/OwnerProductCenter.jsx",import.meta.url),"utf8");
const launcher=fs.readFileSync(new URL("../../client/src/components/commerce/CommerceLauncher.jsx",import.meta.url),"utf8");
const inventoryCard=fs.readFileSync(new URL("../../client/src/components/commerce/InventoryArchivePanel.jsx",import.meta.url),"utf8");
const invoiceResolution=fs.readFileSync(new URL("../src/routes/purchase-order-ocr-resolution.js",import.meta.url),"utf8");
const supplierLearningBootstrap=fs.readFileSync(new URL("../src/supplier-item-learning-bootstrap.js",import.meta.url),"utf8");

test("owner product schema is additive",()=>{
  assert.doesNotMatch(bootstrap,/\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i);
  for(const table of ["ProductPriceHistory","Promotion","PromotionStore","Stocktake","StocktakeLine"])assert.match(bootstrap,new RegExp(`CREATE TABLE IF NOT EXISTS \\\"${table}\\\"`));
});

test("owner product flow preserves master catalog and store pricing rules",()=>{
  assert.match(route,/MasterProduct/);
  assert.match(route,/"scanEnabled"=true/);
  assert.match(route,/ProductPriceHistory/);
  assert.match(route,/promotionType/);
  assert.match(route,/BUY_X_GET_Y/);
  assert.match(route,/STOCKTAKE_ADJUSTMENT/);
  assert.match(route,/vatVerified/);
});

test("full product card is tenant scoped and keeps commercial history",()=>{
  assert.match(route,/router\.patch\("\/:productId\/card"/);
  assert.match(route,/ownedProduct\(company,req\.params\.productId\)/);
  assert.match(route,/companyId"=\$\{company\}/);
  assert.match(route,/PRODUCT_CARD/);
  assert.match(route,/ProductBarcode/);
  assert.match(route,/"subcategoryName"/);
  assert.match(route,/"supplierName"/);
  assert.match(route,/unitMultiplier/);
  assert.match(route,/minStock/);
  assert.match(route,/Ο κωδικός\/SKU χρησιμοποιείται ήδη/);
  assert.match(route,/ανήκει ήδη σε άλλο προϊόν/);
  assert.match(route,/Η υποκατηγορία δεν ανήκει στην επιλεγμένη κατηγορία/);
  assert.match(route,/SupplierProductLink/);
  assert.match(route,/PRODUCT_CARD_UPDATED/);
  assert.match(route,/changes:storeChanges,actorName/);
  assert.match(route,/Λιανική καταστήματος/);
  assert.match(route,/oldRow\?\.salePrice\?\?product\.salePrice/);
});

test("owner UI exposes the complete central product card",()=>{
  for(const label of ["Κεντρική καρτέλα προϊόντος","Κωδικός / SKU","Μονάδα μέτρησης","Τιμή αγοράς €","Barcodes","Alarm stock","Παρακολούθηση αποθήκης","Αποθήκευση καρτέλας προϊόντος"])assert.match(client,new RegExp(label));
  assert.match(client,/saveProductCard/);
  assert.match(client,/unitMultiplier/);
  assert.match(client,/minStock/);
});

test("active catalog reloads every editable product-card switch",()=>{
  for(const field of ["allowDiscount","allowPosPriceChange","freeSalePrice","negativeStockWarning","isSet","isRecipe"]){
    assert.match(activeCatalog,new RegExp(`p\\.\"${field}\"`));
    assert.match(smartEntry,new RegExp(`p\\.\"${field}\"`));
  }
  assert.match(activeCatalog,/p\."subcategoryId"/);
  assert.match(activeCatalog,/ProductSubcategory/);
  assert.match(serverIndex,/app\.use\([^\n]+ownerProductSmartEntryRoutes\);[\s\S]*app\.use\([^\n]+ownerProductsActiveCatalogRoutes\);/);
});

test("owner UI exposes a read-only LAB product quality audit",()=>{
  for(const label of ["Έλεγχος ποιότητας LAB","Μόνο προβλήματα","Αναμονή πρώτης αγοράς","Μη έγκυρο barcode","Barcode μέσα στο SKU","Κόστος ≥ λιανική","Χωρίς υποκατηγορία","Χωρίς προμηθευτή","Μονάδα μη ορισμένη"])assert.match(client,new RegExp(label));
  assert.match(client,/productQualityIssues/);
  assert.match(client,/^const barcodeLooksValid=/m);
  assert.match(client,/activeStoreSalePrices/);
  assert.match(client,/effectiveSalePrice/);
  assert.match(client,/money\(effectiveSalePrice\(row\)\)/);
  assert.match(client,/product\.hasSupplier/);
  assert.match(route,/SupplierProductLink[\s\S]*"hasSupplier"/);
  assert.match(client,/encodeURIComponent\(catalogQuery\.trim\(\)\).*setCatalog\(fresh\)/);
});

test("store pricing opens the complete warehouse product card",()=>{
  assert.match(client,/onOpenFullProduct/);
  assert.match(client,/onClick=\{\(\)=>openProduct\(row\)\}/);
  assert.match(launcher,/initialProduct=\{inventoryInitialProduct\}/);
  assert.match(inventoryCard,/openEdit\(initialProduct\)/);
});

test("invoice-created products retain their supplier relationship",()=>{
  assert.match(invoiceResolution,/INSERT INTO "SupplierProductLink"/);
  assert.match(invoiceResolution,/"source"='INVOICE'/);
  assert.match(route,/PurchaseOrderLine/);
  assert.match(route,/SupplierProductMapping/);
  assert.match(route,/lp\."supplierName" IS NOT NULL/);
  assert.match(route,/SupplierProductMapping[\s\S]*history\.priority/);
  assert.match(supplierLearningBootstrap,/INSERT INTO "SupplierProductLink"[\s\S]*FROM "SupplierProductMapping"/);
  assert.match(supplierLearningBootstrap,/ON CONFLICT \("companyId","supplierId","productId"\) DO UPDATE/);
  assert.doesNotMatch(supplierLearningBootstrap,/\b(?:DELETE\s+FROM|TRUNCATE)\s+"SupplierProductLink"/i);
});
