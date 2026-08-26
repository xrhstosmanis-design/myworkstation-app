import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const bootstrap=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");

test("V06 stores the exact 30 second before and 60 second after clip window",()=>{
  assert.match(bootstrap,/clipStartAt=new Date\(nvrEventAt\.getTime\(\)-30000\)/);
  assert.match(bootstrap,/clipEndAt=new Date\(nvrEventAt\.getTime\(\)\+60000\)/);
  assert.match(route,/secondsBefore:30,secondsAfter:60/);
  assert.match(ui,/30″ πριν · 60″ μετά/);
});

test("V06 only advertises clip support for a capable adapter",()=>{
  assert.match(route,/clipSupported=event\.protocol==="VENDOR_API"/);
  assert.match(route,/clipCreated:false/);
  assert.match(route,/πραγματικός adapter του καταγραφικού/);
  assert.match(ui,/δεν δημιουργήθηκε clip σε αυτό το στάδιο/);
});
