import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildVendorClientFallback} from "../src/services/video-adapters.js";

const route=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");

test("V13 builds a credential-free vendor client link for the mapped camera and NVR time",()=>{
  const result=buildVendorClientFallback({endpoint:"https://user:secret@nvr.local/client?mode=playback",cameraKey:"CAM-2",streamReference:"channel-02",nvrEventAt:"2026-08-26T09:10:11.000Z"});
  const url=new URL(result.launchUrl);
  assert.equal(url.username,"");assert.equal(url.password,"");
  assert.equal(url.searchParams.get("camera"),"channel-02");
  assert.equal(url.searchParams.get("at"),"2026-08-26T09:10:11.000Z");
  assert.equal(result.realVideoOpened,false);
});

test("V13 only offers fallback for a mapped VENDOR_CLIENT event",()=>{
  assert.match(route,/event\.protocol==="VENDOR_CLIENT"&&event\.cameraKey/);
  assert.match(route,/streamReference:event\.streamReference,nvrEventAt:event\.nvrEventAt/);
  assert.match(ui,/vendorClientFallback/);
});

test("V13 rejects non HTTP launch endpoints",()=>{
  assert.throws(()=>buildVendorClientFallback({endpoint:"rtsp://nvr.local/live",cameraKey:"1",nvrEventAt:new Date()}),/HTTP\(S\)/);
});
