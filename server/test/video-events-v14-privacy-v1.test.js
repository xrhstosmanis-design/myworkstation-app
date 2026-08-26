import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {videoAdapterFor} from "../src/services/video-adapters.js";

const bootstrap=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");
const platform=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const audit=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/VideoConnectionManager.jsx",import.meta.url),"utf8");

test("V14 enforces event-only processing and disabled audio at database and API layers",()=>{
  assert.match(bootstrap,/"privacyMode"='EVENT_ONLY' AND "audioEnabled"=FALSE/);
  assert.match(platform,/privacyNoticeAcknowledged:z\.literal\(true\)/);
  assert.match(platform,/"privacyMode"='EVENT_ONLY',"audioEnabled"=false/);
  for(const protocol of ["ONVIF","RTSP","VENDOR_API"])assert.equal(videoAdapterFor(protocol).capabilities().audio,false);
});

test("V14 combines restricted access retention and privacy acknowledgement",()=>{
  assert.match(audit,/requireVideoAccess/);
  assert.match(audit,/v\."expiresAt">NOW\(\)/);
  assert.match(ui,/Privacy\/GDPR/);
  assert.match(ui,/ενημέρωση προσωπικού/);
  assert.match(ui,/καταγραφή ήχου παραμένει απενεργοποιημένη/);
});

test("V14 audit contains policy metadata but no media or credentials",()=>{
  assert.match(platform,/privacyMode:"EVENT_ONLY",audioEnabled:false/);
  assert.doesNotMatch(bootstrap,/audioData|audioBlob|videoData|videoBlob|BYTEA/i);
});
