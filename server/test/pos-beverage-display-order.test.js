import test from "node:test";
import assert from "node:assert/strict";
import {orderPosBeverageDisplay} from "../../client/src/utils/pos-beverage-display-order.js";
import {createPosCatalogResolver} from "../../client/src/utils/pos-catalog-resolver.js";

const rows = names => names.map((name, i) => Object.freeze({id: String(i), name, sku: `SKU${i}`, salePrice: i + 1}));
const names = products => products.map(p => p.name);
const beer = {label: "ΜΠΥΡΕΣ"}, soda = {label: "Αναψυκτικά"};

test("interleaved beer brands become adjacent, ascending size and can before bottle", () => {
  const products = rows(["ΑΛΦΑ ΦΙΑΛΗ 500ML", "CORONA ΦΙΑΛΗ 355ML", "ΑΛΦΑ ΚΟΥΤΙ 500ML", "AMSTEL 500ML", "Άλφα ΚΟΥΤΙ 330ML", "CORONA 330ML"]);
  assert.deepEqual(names(orderPosBeverageDisplay(products, beer)), [products[4].name, products[2].name, products[0].name, products[5].name, products[1].name, products[3].name]);
});

test("softdrink flavours and Greek/Latin brand aliases group together with equivalent litre sizes", () => {
  const products = rows(["Coca-Cola ZERO PET 1,5LT", "FANTA ΛΕΜΟΝΙ CAN 330ML", "ΚΟΚΑ ΚΟΛΑ CAN 33CL", "ΦΑΝΤΑ ΠΟΡΤΟΚΑΛΙ PET 0.5L", "COCA COLA ΦΙΑΛΗ 500ΜΛ"]);
  assert.deepEqual(orderPosBeverageDisplay(products, soda).map(p => p.id), ["2", "4", "0", "1", "3"]);
});

test("known sizes precede unknown sizes, equal variants remain stable and IDs are not deduplicated", () => {
  const products = rows(["ΑΛΦΑ EXTRA", "ΑΛΦΑ CAN 500ML", "ΑΛΦΑ CAN 500ML", "ΑΛΦΑ SPECIAL", "ΑΛΦΑ CAN 330ML", "ΑΛΦΑ CAN"]);
  assert.deepEqual(orderPosBeverageDisplay(products, beer).map(p => p.id), ["4", "1", "2", "0", "3", "5"]);
});

test("frozen catalog objects/array remain unchanged and display retains exact product references", () => {
  const products = Object.freeze(rows(["ΑΛΦΑ ΦΙΑΛΗ 500ML", "MYTHOS 330ML", "ALFA CAN 330ML"]));
  const before = JSON.stringify(products), result = orderPosBeverageDisplay(products, beer);
  assert.equal(JSON.stringify(products), before);
  assert.deepEqual(result, [products[2], products[0], products[1]]);
  assert.equal(result[0], products[2]);
});

test("unrelated and missing categories preserve published array identity/order", () => {
  const products = rows(["ΑΛΦΑ 500ML", "ΑΛΦΑ 330ML"]);
  for (const category of [{label: "ΝΕΡΑ"}, {label: "ΤΣΙΓΑΡΑ"}, {label: "ΜΠΥΡΕΣΚΙ"}, null]) assert.equal(orderPosBeverageDisplay(products, category), products);
  assert.equal(orderPosBeverageDisplay([], beer).length, 0);
});

test("stored category metadata, parent subcategories and English labels are supported", () => {
  const products = rows(["ΑΛΦΑ 500ML", "ΑΛΦΑ 330ML"]);
  for (const category of [{label: "Category 5", categoryName: "Μπύρες::MWSMETA::a,b"}, {label: "Κουτιά", parentCategory: beer}, {label: "Soft Drinks"}, {label: "BEERS"}]) assert.deepEqual(orderPosBeverageDisplay(products, category), [products[1], products[0]]);
});

test("display ordering cannot change exact-ID resolution, counts or a new store catalog", () => {
  const products = rows(["ΑΛΦΑ 500ML", "CORONA 330ML", "ΑΛΦΑ 330ML"]), category = {...beer, productCodes: ["0", "1", "2", "0"]};
  const resolver = createPosCatalogResolver(products, true), published = resolver.categoryProducts(category);
  assert.deepEqual(orderPosBeverageDisplay(published, category).map(p => p.id), ["2", "0", "1"]);
  assert.deepEqual(resolver.categoryProducts(category).map(p => p.id), ["0", "1", "2"]);
  assert.equal(resolver.categoryProducts(category), published);
  assert.equal(resolver.categoryCount(category), 3);
  const fresh = createPosCatalogResolver([{id: "0", name: "NEW STORE 250ML"}], true);
  assert.deepEqual(names(orderPosBeverageDisplay(fresh.categoryProducts(category), category)), ["NEW STORE 250ML"]);
});

test("multipack volume and missing names neither lose products nor invent volumes from SKUs", () => {
  const products = rows(["PEPSI 6x330ML", "SPRITE", "ΠΕΨΙ 250ML", "", "", "PEPSI SKU1500"]);
  assert.deepEqual(orderPosBeverageDisplay(products, soda).map(p => p.id), ["2", "0", "5", "1", "3", "4"]);
});
