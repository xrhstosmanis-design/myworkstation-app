import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lab=fs.readFileSync(new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");
const reader=fs.readFileSync(new URL("../../client/src/invoice-learning-azure-only-reader.js",import.meta.url),"utf8");
const platformRoute=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url),"utf8");
const mobileRoute=fs.readFileSync(new URL("../src/routes/mobile-invoice-upload.js",import.meta.url),"utf8");

test("Invoice Learning Lab exposes camera and mobile QR intake",()=>{
  assert.match(lab,/id="camera"/);
  assert.match(lab,/Λήψη από κάμερα/);
  assert.match(lab,/id="mobileQr"/);
  assert.match(lab,/QR από κινητό/);
  assert.match(lab,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(lab,/QRCode\.toDataURL/);
  assert.match(lab,/invoice-learning\/mobile-upload-sessions/);
});

test("camera and QR files use the same Azure and AI reader path",()=>{
  assert.match(lab,/__MWS_INVOICE_LEARNING_ACCEPT_FILE__/);
  assert.match(reader,/window\.__MWS_INVOICE_LEARNING_ACCEPT_FILE__=acceptFile/);
  assert.match(reader,/setTimeout\(\(\)=>run\(b\),0\)/);
  assert.match(reader,/\/api\/platform\/invoice-learning\/ai-recheck/);
});

test("mobile QR upload is short-lived and scoped to the signed-in Platform Super Admin",()=>{
  assert.match(platformRoute,/isPlatformSuper/);
  assert.match(platformRoute,/ownerKey/);
  assert.match(platformRoute,/source:"INVOICE_LEARNING_LAB"/);
  assert.match(platformRoute,/expires:Date\.now\(\)\+600000/);
  assert.match(mobileRoute,/x\.token!==req\.params\.token/);
  assert.match(mobileRoute,/capture=environment/);
});
