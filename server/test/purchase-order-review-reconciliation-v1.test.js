import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd(),"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("OCR review API exposes economic purchase rows as PRODUCT",()=>{
  const source=read("server/src/routes/purchase-order-ocr-resolution.js");
  assert.match(source,/economicProduct/);
  assert.match(source,/ocrLineType:economicProduct\?"PRODUCT":"INFO"/);
  assert.match(source,/ORDER BY COALESCE\(l\."ocrSequence",l\."ocrLineIndex",2147483647\),l\."createdAt",l\."id"/);
  assert.match(source,/ocrSequence:Number\(r\.ocrSequence\|\|r\.ocrLineIndex\|\|index\+1\)/);
});

test("BackOffice review shows invoice total reconciliation with 0.05 tolerance",()=>{
  const source=read("client/src/purchase-order-review-reconciliation-bootstrap.js");
  assert.match(source,/const TOLERANCE=0\.05/);
  assert.match(source,/Σύνολο τιμολογίου/);
  assert.match(source,/Σύνολο .*γραμμών/);
  assert.match(source,/Διαφορά/);
  assert.match(source,/Ανοχή/);
  assert.match(source,/ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟ/);
});

test("review reconciliation bootstrap is loaded after OCR resolution bootstrap",()=>{
  const html=read("client/index.html");
  const review=html.indexOf("purchase-order-ocr-resolution-bootstrap.js");
  const reconciliation=html.indexOf("purchase-order-review-reconciliation-bootstrap.js");
  assert.ok(review>=0);
  assert.ok(reconciliation>review);
});
