import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {audienceLineTotal} from "../../client/src/utils/pos-audience-line-total.js";

const route=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");

test("POS applies configured audience discounts server-side",()=>{
  assert.match(route,/async function applyAudienceDiscounts/);
  assert.match(route,/Math\.ceil\(\(before\*\(1-percent\/100\)-Number\.EPSILON\)\*10\)\/10/);
  assert.match(route,/await applyAudienceDiscounts\(req,store,items,body\.audience\)/);
  assert.match(route,/priceSource=`AUDIENCE_\$\{audience\}`/);
});

test("audience selection is scoped to company store and signed-in actor",()=>{
  assert.match(route,/PRIMARY KEY\("companyId","storeId","actorId"\)/);
  assert.match(route,/currentAudience\(req,req\.params\.storeId\)/);
  assert.match(route,/AUDIENCE.*DOCTOR.*NURSE.*STAFF.*CUSTOMER/s);
});

test("POS has explicit choices and resets after every completed or cleared cart",()=>{
  for(const label of ["Κανονική τιμή","Ιατρός","Νοσηλευτής / Νοσοκόμος","Προσωπικό","Πελάτης"])assert.match(ui,new RegExp(label));
  assert.match(ui,/setAudience\("NORMAL"\)/);
  assert.match(ui,/audience-selection/);
  assert.match(ui,/cart\.reduce\(\(sum,row\)=>sum\+lineTotal\(row\),0\)/);
  assert.match(ui,/απαιτεί Online σύνδεση/);
});

test("discount cards are hashed, tenant scoped and never returned as clear card values",()=>{
  assert.match(route,/audience-card\/scan/);
  assert.match(route,/createHash\("sha256"\)/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}.*"storeId"=\$\{store\.id\}/s);
  assert.match(route,/AUDIENCE_CARD_SCANNED/);
  assert.match(route,/cardLast4/);
  assert.match(ui,/Σκάναρε την κάρτα και πάτησε Enter/);
  assert.match(ui,/οι εκπτώσεις εφαρμόστηκαν αυτόματα/);
});


test("POS preview uses checkout line rounding for multiple quantities and preserves ordinary prices",()=>{
  assert.equal(audienceLineTotal(.50,2,10),.90);
  assert.equal(audienceLineTotal(.50,3,10),1.40);
  assert.equal(audienceLineTotal(1.65,1,0),1.65);
  assert.equal(audienceLineTotal(1.65,1,10),1.50);
  assert.match(ui,/euro\(lineTotal\(row\)\)/);
});
