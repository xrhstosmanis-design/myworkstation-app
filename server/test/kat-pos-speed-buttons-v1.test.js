import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Store Mode uses a lightweight access endpoint instead of reloading the full catalog",async()=>{
  const operator=await read("../../client/src/components/store/StoreOperatorApp.jsx");
  const payments=await read("../../client/src/components/store/StorePosPaymentsModal.jsx");
  const route=await read("../src/routes/store-pos-catalog.js");
  assert.match(operator,/stores\/\$\{session\.store\.id\}\/access/);
  assert.match(payments,/pos-runtime-access/);
  assert.match(payments,/stores\/\$\{store\.id\}\/access/);
  assert.match(route,/router\.get\("\/stores\/:storeId\/access"/);
  assert.match(operator,/12000/);
});

test("cash and total stay together at the right edge",async()=>{
  const panel=await read("../../client/src/components/store/StorePosPanel.jsx");
  const css=await read("../../client/src/components/store/store-pos-viewport-fit.css");
  assert.match(panel,/standard-payment-end/);
  assert.match(css,/grid-column:\s*-2 \/ -1/);
  assert.match(css,/width:\s*100%/);
  assert.match(css,/min-height:\s*100dvh/);
});

test("authorized operators can edit quick keys and hierarchical bottom categories",async()=>{
  const editor=await read("../../client/src/components/store/StorePosButtonEditor.jsx");
  const route=await read("../src/routes/store-pos-catalog.js");
  const management=await read("../../client/src/components/commerce/OperatorManagementPanel.jsx");
  assert.match(editor,/ΣΥΝΔΕΣΗ ΓΡΗΓΟΡΟΥ ΚΟΥΜΠΙΟΥ/);
  assert.match(editor,/Barcode, κωδικός ή περιγραφή προϊόντος/);
  assert.match(editor,/Νέα υποκατηγορία/);
  assert.match(editor,/κατηγορία → υποκατηγορία → προϊόντα/);
  assert.match(route,/POS_BUTTON_LAYOUT_UPDATE/);
  assert.match(route,/editPosButtons/);
  assert.match(management,/Ρύθμιση πλήκτρων, κατηγοριών και υποκατηγοριών/);
});
