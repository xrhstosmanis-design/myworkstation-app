import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  calculateBundlePromotion,
  roundRetailToTenCents,
  storeAmountOfferPrice,
  storePercentageOfferPrice,
} from "../src/bundle-promotion-pricing.js";

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (file) => fs.readFileSync(path.join(repo, file), "utf8");

const promotion = {
  productId: "iqos",
  saleQuantity: 1,
  bonusQuantity: 3,
  discountPercent: 20,
  giftDiscountPercent: 100,
  giftProductIds: ["terea-a", "terea-b", "terea-c"],
};
const cartItems = [
  { productId: "iqos", quantity: 1, unitPrice: 50 },
  { productId: "terea-a", quantity: 2, unitPrice: 4 },
  { productId: "terea-b", quantity: 1, unitPrice: 4 },
];

test("Task 20 supports a discounted base product plus mixed gift products", () => {
  const result = calculateBundlePromotion({
    promotion,
    cartItems,
    selectedGiftQuantities: { "terea-a": 2, "terea-b": 1 },
  });
  assert.equal(result.eligible, true);
  assert.equal(result.giftLimit, 3);
  assert.equal(result.remainingGiftQuantity, 0);
  assert.deepEqual(
    result.adjustments.map((x) => [
      x.kind,
      x.productId,
      x.quantity,
      x.discount,
    ]),
    [
      ["BASE_DISCOUNT", "iqos", 1, 10],
      ["GIFT_DISCOUNT", "terea-a", 2, 8],
      ["GIFT_DISCOUNT", "terea-b", 1, 4],
    ],
  );
});

test("Task 20 supports one or five gifts without a hard-coded product family", () => {
  const one = calculateBundlePromotion({
    promotion: { ...promotion, bonusQuantity: 1, discountPercent: 0 },
    cartItems,
    selectedGiftQuantities: { "terea-b": 1 },
  });
  assert.equal(one.giftLimit, 1);
  assert.equal(one.adjustments.length, 1);
  const five = calculateBundlePromotion({
    promotion: { ...promotion, bonusQuantity: 5, discountPercent: 0 },
    cartItems: [
      ...cartItems,
      { productId: "terea-c", quantity: 2, unitPrice: 4 },
    ],
    selectedGiftQuantities: { "terea-a": 2, "terea-b": 1, "terea-c": 2 },
  });
  assert.equal(five.giftLimit, 5);
  assert.equal(five.selectedGiftQuantity, 5);
});

test("Task 20 rejects gifts outside the cart or above the earned limit", () => {
  assert.equal(
    calculateBundlePromotion({
      promotion,
      cartItems,
      selectedGiftQuantities: { "terea-c": 1 },
    }).reason,
    "GIFT_NOT_IN_CART",
  );
  assert.equal(
    calculateBundlePromotion({
      promotion,
      cartItems,
      selectedGiftQuantities: { "terea-a": 2, "terea-b": 2 },
    }).reason,
    "GIFT_NOT_IN_CART",
  );
  const largerCart = [
    { productId: "iqos", quantity: 1, unitPrice: 50 },
    { productId: "terea-a", quantity: 4, unitPrice: 4 },
  ];
  assert.equal(
    calculateBundlePromotion({
      promotion,
      cartItems: largerCart,
      selectedGiftQuantities: { "terea-a": 4 },
    }).reason,
    "GIFT_LIMIT_EXCEEDED",
  );
});

test("Task 20 calculates percentage offers from each store retail price", () => {
  assert.equal(storePercentageOfferPrice(1.55, 20), 1.2);
  assert.equal(storePercentageOfferPrice(1.58, 20), 1.3);
  assert.equal(storePercentageOfferPrice(2, 20), 1.6);
});

test("Task 20 rounds the discounted result to the nearest ten cents with halves upward", () => {
  assert.equal(roundRetailToTenCents(1.24), 1.2);
  assert.equal(roundRetailToTenCents(1.25), 1.3);
  assert.equal(roundRetailToTenCents(1.26), 1.3);
});

test("Task 20 supports a variable fixed amount off each store retail price", () => {
  assert.equal(storeAmountOfferPrice(3.24, 0.4), 2.8);
  assert.equal(storeAmountOfferPrice(3.24, 0.5), 2.7);
  assert.equal(storeAmountOfferPrice(0.3, 0.5), 0);
});

test("Task 20 persists percentage mode and POS prices it from the selected store", () => {
  const platform = read("server/src/routes/platform-bulk-catalog.js"),
    pos = read("server/src/routes/store-pos.js"),
    bootstrap = read("server/src/pos-pricing-bootstrap.js");
  assert.match(
    bootstrap,
    /ADD COLUMN IF NOT EXISTS "offerMode" TEXT NOT NULL DEFAULT 'FIXED_PRICE'/,
  );
  assert.match(platform, /"offerMode"/);
  assert.match(
    platform,
    /body\.promotionType==="LEAFLET"\?body\.offerMode:"FIXED_PRICE"/,
  );
  assert.match(pos, /pr\."offerMode"/);
  assert.match(pos, /promotion\.offerMode==="DISCOUNT_PERCENT"/);
  assert.match(
    pos,
    /storePercentageOfferPrice\(retailPrice,promotion\.discountPercent\)/,
  );
});

test("Task 20 exposes all pricing modes to Super Admin Owner and Manager UI", () => {
  const platform = read(
      "client/src/components/platform/PlatformPromotionCenter.jsx",
    ),
    backoffice = read(
      "client/src/components/commerce/installPriceCatalogControllerV2.js",
    ),
    guard = read(
      "client/src/components/commerce/installPromotionStoreGuard.js",
    );
  for (const mode of ["DISCOUNT_PERCENT", "DISCOUNT_AMOUNT", "FIXED_PRICE"]) {
    assert.ok(platform.includes(mode), `platform ${mode}`);
    assert.ok(backoffice.includes(mode), `backoffice ${mode}`);
  }
  assert.match(backoffice, /data-pc-promo-form/);
  assert.match(guard, /\.pcv2-footer \[data-new\]/);
  assert.match(guard, /\.pc-modal-overlay,\.pcv2-overlay/);
  assert.match(guard, /discountAmount/);
});

test("Task 20 sends one offer to many selected products from Owner and Manager", () => {
  const route = read("server/src/routes/price-catalog-promotion-guard.js"),
    owner = read("client/src/components/commerce/OwnerProductCenter.jsx");
  assert.match(route, /router\.post\("\/promotions\/scoped\/bulk"/);
  assert.match(
    route,
    /productIds:\s*z\.array\(z\.string\(\)\.min\(1\)\)\.min\(1\)\.max\(200\)/,
  );
  assert.match(route, /productIds\.length\s*\*\s*stores\.length\s*>\s*10000/);
  assert.match(route, /await prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(route, /for \(const product of products\).*lockScope\(tx/s);
  assert.match(owner, /promotionProducts/);
  assert.match(owner, /Όλα τα εμφανιζόμενα/);
  assert.match(owner, /\/api\/price-catalog\/promotions\/scoped\/bulk/);
  assert.match(
    owner,
    /Αποστολή σε\s*\{promotionProducts\.length\s*\|\|\s*0\}\s*προϊόντα/,
  );
});

test("Task 20 gift picker exposes only administrator-approved products to POS",()=>{
  const bootstrap=read("server/src/pos-pricing-bootstrap.js"),pos=read("server/src/routes/store-pos.js"),panel=read("client/src/components/store/StorePosPanel.jsx");
  assert.match(bootstrap,/PriceCatalogPromotionGiftProduct/);
  assert.match(pos,/router\.get\("\/stores\/:storeId\/gift-offers"/);
  assert.match(pos,/JOIN "PriceCatalogPromotionGiftProduct" gp/);
  assert.match(pos,/JOIN "StoreProduct" sp/);
  assert.match(panel,/gift-offers\?triggerProductId/);
  assert.match(panel,/Εμφανίζονται μόνο τα προϊόντα που όρισε ο διαχειριστής/);
  assert.match(panel,/giftOffer\.products\.map/);
});

test("Task 20 validates selected gifts server-side and stocks real gift lines",()=>{
  const pos=read("server/src/routes/store-pos.js");
  assert.match(pos,/Επιλέχθηκε προϊόν που δεν ανήκει στην επιτρεπόμενη λίστα δώρων/);
  assert.match(pos,/Η επιλογή δώρων ξεπερνά το επιτρεπόμενο όριο/);
  assert.match(pos,/Δεν επιτρέπεται δεύτερη προσφορά πάνω στο ίδιο προϊόν δώρου/);
  assert.match(pos,/item\.priceSource="GIFT"/);
  assert.match(pos,/reserveSharedStock\(tx,\{companyId:req\.user\.companyId,storeId:store\.id,productId:item\.productId,quantity:item\.quantity/);
});

test("Task 20 configures the same approved gift pool from Super Admin Owner and Manager",()=>{
  const platformRoute=read("server/src/routes/platform-bulk-catalog.js"),tenantRoute=read("server/src/routes/price-catalog-promotion-guard.js"),platform=read("client/src/components/platform/PlatformPromotionCenter.jsx"),owner=read("client/src/components/commerce/OwnerProductCenter.jsx");
  assert.match(platformRoute,/giftMasterProductIds/);
  assert.match(platformRoute,/INSERT INTO "PriceCatalogPromotionGiftProduct"/);
  assert.match(tenantRoute,/giftProductIds/);
  assert.match(tenantRoute,/replaceGiftProducts/);
  assert.match(platform,/Επιτρεπόμενα δώρα/);
  assert.match(owner,/Επιτρεπόμενα προϊόντα δώρου/);
});
