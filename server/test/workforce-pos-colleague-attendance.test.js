import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");

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
