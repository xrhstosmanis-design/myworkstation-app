import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {onlineProductAvailable,onlineStoreOpen} from "../src/routes/kat-online-ordering-modifiers.js";

const admin=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const publicRoute=await readFile(new URL("../src/routes/kat-online-ordering-modifiers.js",import.meta.url),"utf8");
const bootstrap=await readFile(new URL("../src/kat-online-ordering-bootstrap.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/OnlineStoreManager.jsx",import.meta.url),"utf8");
const storefront=await readFile(new URL("../../client/public/kat/app.html",import.meta.url),"utf8");

test("Super Admin persists delivery, pickup, minimum and weekly hours per store",()=>{
  for(const field of ["pickupEnabled","deliveryEnabled","deliveryFee","minimumOrderRetail","cashEnabled","cardOnDeliveryEnabled","timezone","weeklyHours"])assert.match(admin,new RegExp(field));
  assert.match(bootstrap,/"weeklyHours" JSONB/);
  assert.match(bootstrap,/Europe\/Athens/);
  assert.match(admin,/Ενεργοποίησε τουλάχιστον Παραλαβή ή Delivery/);
});

test("weekly opening hours use Greece time and support closed days",()=>{
  const config={timezone:"Europe/Athens",weeklyHours:{MON:{enabled:true,start:"07:00",end:"15:00"}}};
  assert.equal(onlineStoreOpen(config,new Date("2026-08-24T08:00:00Z")),true);
  assert.equal(onlineStoreOpen(config,new Date("2026-08-24T16:00:00Z")),false);
  assert.equal(onlineStoreOpen(config,new Date("2026-08-25T08:00:00Z")),false);
});

test("public order endpoint enforces hours, minimum order and delivery fee",()=>{
  assert.match(publicRoute,/Το Online Store είναι κλειστό αυτή την ώρα/);
  assert.match(publicRoute,/Η ελάχιστη παραγγελία είναι/);
  assert.match(publicRoute,/fulfillmentType==="DELIVERY"\?money\(config\.deliveryFee\):0/);
  assert.match(publicRoute,/OnlineProductVisibility/);
});

test("stock is enforced only when the store setting enables it",()=>{
  const product={name:"ΝΕΡΟ 500ML",trackStock:true,currentStock:-57};
  assert.equal(onlineProductAvailable(product,{stockCheckEnabled:false}),true);
  assert.equal(onlineProductAvailable(product,{stockCheckEnabled:true}),false);
  assert.equal(onlineProductAvailable({...product,currentStock:2},{stockCheckEnabled:true},2),true);
  assert.equal(onlineProductAvailable({...product,currentStock:1},{stockCheckEnabled:true},2),false);
});

test("management and storefront UI expose and respect fulfillment settings",()=>{
  for(const label of ["Παραλαβή από κατάστημα","Χρέωση Delivery","Ελάχιστη παραγγελία","Ωράριο online παραγγελιών","Κάρτα σε ασύρματο POS"])assert.match(ui,new RegExp(label));
  assert.match(storefront,/Το κατάστημα είναι κλειστό/);
  assert.match(storefront,/settings\.pickupEnabled/);
  assert.match(storefront,/settings\.deliveryEnabled/);
});

test("checkout reads order fields explicitly instead of relying on window named properties",()=>{
  assert.match(storefront,/const orderFields=\{name:document\.getElementById\('name'\)/);
  assert.match(storefront,/customerName:orderFields\.name\.value\.trim\(\)/);
  assert.doesNotMatch(storefront,/customerName:name\.value\.trim\(\)/);
});

test("order creation reports a safe transaction stage without exposing database details",()=>{
  assert.match(publicRoute,/createStage="LOCK"/);
  assert.match(publicRoute,/ONLINE_ORDER_\$\{createStage\}/);
  assert.match(publicRoute,/Η καταχώριση online παραγγελίας απέτυχε στο στάδιο/);
});
