import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const modal=fs.readFileSync(new URL("../../client/src/components/store/PosAttendanceCardModal.jsx",import.meta.url),"utf8");

test("POS colleague card is store-scoped, hashed and toggles attendance",()=>{
  assert.ok(source.includes('attendance-card/scan'));
  assert.ok(source.includes("attendanceCardHash"));
  assert.ok(source.includes('"cardCodeHash"=${hash}'));
  assert.ok(source.includes('syncOperatorWorkforceAttendance(tx,req,store.id,"TOGGLE"'));
  assert.ok(source.includes('method:"POS_CARD"'));
  assert.ok(source.includes("now-new Date(open.startedAt)<60000"));
});

test("POS exposes a compact card-work launcher without replacing the cashier",()=>{
  assert.ok(panel.includes("PosAttendanceCardModal"));
  assert.ok(panel.includes("Κάρτα εργασίας"));
  assert.ok(panel.includes("> Barcode</button>"));
});

test("POS colleague can use a protected personal PIN without changing the cashier",()=>{
  assert.ok(source.includes('attendance-pin/submit'));
  assert.ok(source.includes('method:"POS_PIN"'));
  assert.ok(source.includes('bcrypt.compare(body.pin,credential.pinHash)'));
  assert.ok(source.includes('c."companyId"=${req.user.companyId} AND c."storeId"=${store.id} AND c."employeeId"=${body.employeeId}'));
  assert.ok(source.includes('e."id"=c."employeeId" AND e."storeId"=c."storeId"'));
  assert.ok(!source.includes('e."id"=c."employeeId" AND e."companyId"=c."companyId"'));
  assert.ok(source.includes('"StoreOperatorLoginGuard"'));
  assert.ok(source.includes('nextCount>=5'));
  assert.ok(modal.includes("PIN"));
  assert.ok(modal.includes("employeeId,pin"));
});

test("raw query failures are not mislabeled as an existing cash shift",()=>{
  assert.ok(source.includes('error?.meta?.code==="23505"'));
  assert.ok(!source.includes('error?.code==="P2010"||error?.code==="23505"'));
});
