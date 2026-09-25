import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Invoice Learning confirms only reconciled economics and completed central profile sync",async()=>{
  const client=await fs.readFile(new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");
  const route=await fs.readFile(new URL("../src/routes/platform-invoice-learning-workspace.js",import.meta.url),"utf8");
  assert.match(client,/Math\.abs\(calculated-declared\)>\.05/);
  assert.match(client,/Math\.abs\(expected-actual\)>Math\.max\(\.05,actual\*\.002\)/);
  assert.match(client,/await persistWorkspaceNow\(\{syncProfiles:true\}\);save\(\)/);
  assert.match(client,/const syncConfirmedInvoiceIdentity=.*current\.invoiceNo=.*current\.invoiceDate=/);
  assert.match(client,/\$\('#learn'\)\.addEventListener\('click',syncConfirmedInvoiceIdentity,true\)/);
  assert.match(client,/Η εκμάθηση και το προφίλ αποθηκεύτηκαν κεντρικά για όλα τα καταστήματα/);
  assert.match(client,/state\.documents=before\.documents;state\.profiles=before\.profiles/);
  assert.match(client,/p\.mappings=p\.mappings\|\|\{\}/);
  assert.match(client,/AbortSignal\.timeout\(30000\)/);
  assert.match(route,/const syncProfiles=req\.body\?\.syncProfiles!==false/);
  assert.match(route,/if\(syncProfiles\)await upsertSupplierProfiles/);
});
