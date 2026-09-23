import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("POS attendance card modal supports camera Code 128 scanning",()=>{
  const source=read("client/src/components/store/PosAttendanceCardModal.jsx");
  assert.match(source,/Σάρωση με κάμερα/);
  assert.match(source,/navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(source,/new window\.BarcodeDetector\(\{formats:\["code_128"\]\}\)/);
  assert.match(source,/BrowserMultiFormatReader/);
  assert.match(source,/decodeFromVideoElement/);
  assert.match(source,/attendance-card\/scan/);
  assert.match(source,/recordCard\(value\)/);
  assert.match(source,/getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
});

test("camera scan keeps scanner and PIN fallbacks",()=>{
  const source=read("client/src/components/store/PosAttendanceCardModal.jsx");
  assert.match(source,/placeholder="Σάρωση κάρτας και Enter"/);
  assert.match(source,/attendance-pin\/submit/);
  assert.match(source,/Η κάμερα δεν είναι διαθέσιμη/);
  assert.match(source,/Δεν δόθηκε άδεια χρήσης της κάμερας/);
});
