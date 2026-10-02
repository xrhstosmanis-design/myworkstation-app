import test from "node:test";
import assert from "node:assert/strict";
import {validPwaStoreId,storeManifest,storeHtmlWithManifest} from "../src/store-pwa.js";

test("Store Mode accepts existing opaque IDs and legacy slug IDs",()=>{
  const opaqueId="cmtpopbgo000trhb5ng9ytiru";
  assert.equal(validPwaStoreId(opaqueId),true);
  assert.equal(validPwaStoreId("kat-store"),true);
  assert.equal(storeManifest("kat-store").start_url,"/store/kat-store");
  assert.equal(
    storeHtmlWithManifest('<link rel="manifest" href="/manifest.webmanifest">',"kat-store"),
    '<link rel="manifest" href="/store/kat-store/manifest.webmanifest">'
  );
});

test("Store Mode still rejects path traversal and malformed IDs",()=>{
  for(const value of ["../platform-admin","/platform-admin","Kat-Store","a",""]){
    assert.equal(validPwaStoreId(value),false,value);
  }
});
