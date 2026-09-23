import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");

test("POS colleague card is store-scoped, hashed and toggles attendance",()=>{
  assert.match(source,/attendance-card\\/scan/);
  assert.match(source,/attendanceCardHash/);
  assert.match(source,/"cardCodeHash"=\\$\\{hash\\}/);
  assert.match(source,/syncOperatorWorkforceAttendance\\(tx,req,store.id,"TOGGLE"/);
  assert.match(source,/method:"POS_CARD"/);
  assert.match(source,/now-new Date\\(open.startedAt\\)<60000/);
});

test("POS exposes a compact card-work launcher without replacing the cashier",()=>{
  assert.match(panel,/PosAttendanceCardModal/);
  assert.match(panel,/Κάρτα εργασίας/);
  assert.match(panel,/Barcode<\\/button>/);
});
