import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cloud=fs.readFileSync(new URL("../src/routes/cloud-v1.js",import.meta.url),"utf8");
const api=fs.readFileSync(new URL("../src/routes/connector-observer.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/components/commerce/ConnectorObserverPanel.jsx",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");

test("observer requires technical module activation and device authentication",()=>{
  assert.match(cloud,/requireObserverModule\(req\.device\)/);
  assert.match(cloud,/activeModules\.includes\("CONNECTOR_RBS"\)/);
  assert.match(index,/requireCompanyModule\("CONNECTOR_RBS"\)/);
});

test("observer event input accepts metadata only and deduplicates event keys",()=>{
  const route=cloud.slice(cloud.indexOf('router.post("\/device\/observer\/events"'));
  assert.match(route,/payloadHash:z\.string\(\)\.regex\(\/\^\[a-f0-9\]\{64\}\$\/i\)/);
  assert.match(route,/byteLength:z\.coerce\.number\(\)/);
  assert.match(route,/ON CONFLICT \("connectorDeviceId","eventKey"\)/);
  assert.doesNotMatch(route,/payload:z\./);
  assert.match(route,/rawPayloadStored:false,outboundCommands:false/);
});

test("operator API is tenant scoped and returns no raw payload",()=>{
  assert.match(api,/d\."companyId"=\$\{req\.user\.companyId\}/);
  assert.doesNotMatch(api,/e\."rawPayload"/);
  assert.match(api,/outboundCommands:false,fiscalIssuance:false/);
  assert.match(api,/fiscalConfirmation:false/);
});

test("UI states read-only limits and preserves Kiosk Manager RBS as fiscal path",()=>{
  assert.match(ui,/ΜΟΝΟ ΑΝΑΓΝΩΣΗ/);
  assert.match(ui,/Καμία αποθήκευση raw payload/);
  assert.match(ui,/Καμία εξερχόμενη εντολή/);
  assert.match(ui,/Παρατηρήσεις \(όχι αποδείξεις\)/);
  assert.match(ui,/Παλαιό μη ταξινομημένο συμβάν/);
  assert.match(ui,/Καμία εγγραφή δεν επιβεβαιώνει ότι η απόδειξη εκδόθηκε/);
  assert.match(ui,/Μοναδική φορολογική διαδρομή:<\/b> Kiosk Manager \/ RBS/);
});

test("UI can create a short-lived Observer pairing code without changing fiscal gates",()=>{
  assert.match(ui,/\/api\/cloud\/v1\/stores\/\$\{encodeURIComponent\(storeId\)\}\/pairing-code/);
  assert.match(ui,/JSON\.stringify\(\{minutes:15\}\)/);
  assert.match(ui,/Η δημιουργία κωδικού δεν στέλνει εντολή σε RBS, CapDriver ή ταμειακή/);
  assert.doesNotMatch(ui,/localStorage\.setItem\([^\n]*pair/i);
});
