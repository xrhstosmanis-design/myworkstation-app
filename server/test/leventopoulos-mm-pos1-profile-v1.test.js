import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {recoverLeventopoulosMmPos1Columns} from "../src/lib/invoice-column-reading.js";

test("Λεβεντόπουλος uses ΠΟΣ1, never the numeric ΜΜ, when the printed row balances",()=>{
  const line=recoverLeventopoulosMmPos1Columns({
    code:"e48266",rawText:"e48266 ΣΥΛ MAGIC DBL GOLD CAR 10 20.00 1.00 2.800 0.0 56.00 13",
    quantity:10,unitCost:20,netAmount:56,vatRate:13
  });
  assert.equal(line.quantity,20);
  assert.equal(line.unitCost,2.8);
  assert.equal(line.netAmount,56);
  assert.equal(line.vatRate,13);
  assert.equal(line.sourceColumnsVerified,true);
  assert.equal(line.supplierProfileEvidence.mm,10);
});

test("Λεβεντόπουλος leaves an unbalanced physical row for review",()=>{
  const input={rawText:"e48266 ΣΥΛ MAGIC DBL GOLD CAR 10 20.00 1.00 2.800 0.0 55.90 13",quantity:10,unitCost:20,netAmount:55.9};
  assert.equal(recoverLeventopoulosMmPos1Columns(input),input);
});

test("the supplier rule is central, scoped by ΑΦΜ and does not preserve old invoice economics",async()=>{
  const [seed,runtime]=await Promise.all([
    readFile(new URL("../src/seed-invoice-profile-dimotsios.js",import.meta.url),"utf8"),
    readFile(new URL("../src/lib/invoice-supplier-profile-runtime.js",import.meta.url),"utf8")
  ]);
  assert.match(seed,/LEVENTOPOULOS_MM_POS1_COLUMNS/);
  assert.match(seed,/800503361/);
  assert.match(runtime,/productLines=productLines\.map\(recoverLeventopoulosMmPos1Columns\)/);
  assert.doesNotMatch(seed,/172\.18|194\.55|194\.77/);
});
