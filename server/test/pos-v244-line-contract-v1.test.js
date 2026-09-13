import test from "node:test";
import assert from "node:assert/strict";
import {finalizeV244ProductLines} from "../../client/src/lib/invoice-v244-safe.js";

test("normalizes AI lines to the server V2.4.4 contract",()=>{
  const [line]=finalizeV244ProductLines([{rawText:"X".repeat(5000),code:"1".repeat(100),barcode:"2".repeat(100),description:"ΔΟΚΙΜΗ ".repeat(100),quantity:2,unit:"ΜΟΝΑΔΑ".repeat(20),unitsPerPackage:200000,unitCost:3,initialAmount:6,discount1:914.69,discount1Amount:2,discount2:Infinity,discount2Amount:0,discount3:0,discount3Amount:0,netAmount:4,vatRate:124,grossAmount:8.96,confidence:180,packRule:"R".repeat(200)}]);
  assert.equal(line.rawText.length,4000);
  assert.equal(line.code.length,80);
  assert.equal(line.barcode.length,80);
  assert.equal(line.description.length,500);
  assert.equal(line.unit.length,40);
  assert.equal(line.discount1,100);
  assert.equal(line.discount2,0);
  assert.equal(line.vatRate,100);
  assert.equal(line.confidence,100);
  assert.equal(line.unitsPerPackage,100000);
  assert.ok(line.packRule.length<=120);
});

test("keeps invoice retail separate from purchase cost and sends it as the Backoffice proposal",async()=>{
  const [line]=finalizeV244ProductLines([{rawText:"01740 TEREA",code:"01740",description:"TEREA TURQUOISE",quantity:30,unit:"ΤΕΜ",unitCost:3.70278,retailPrice:4,netAmount:111.08,vatRate:0,grossAmount:111.08}]);
  assert.equal(line.unitCost,3.70278);
  assert.equal(line.retailPrice,4);
  const fs=await import("node:fs/promises");
  const source=await fs.readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
  const ai=await fs.readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
  assert.match(source,/retailPrice:z\.coerce\.number/);
  assert.match(source,/Number\(line\.retailPrice\|\|line\.product\?\.salePrice\|\|0\)/);
  assert.match(ai,/ΛΙΑΝΙΚΗ ΤΙΜΗ=retailPrice/);
});

test("does not restore shifted retail as quantity over a verified reader line",()=>{
  const rows=[
    {rawText:"01669 MARLBORO 4,80 TEM 20 4,56991 91,40 0 0 91,40 0",code:"01669",description:"MARLBORO",quantity:4.8,unit:"TEM",unitCost:4.56991,retailPrice:0,netAmount:91.4,vatRate:0,grossAmount:91.4},
    {rawText:"01669 MARLBORO 4,80 TEM 20 4,56991 91,40 0 0 91,40 0",code:"01669",description:"MARLBORO",quantity:20,unit:"TEM",unitCost:4.56991,retailPrice:4.8,netAmount:91.4,vatRate:0,grossAmount:91.4,sourceColumnsVerified:true}
  ];
  const [line]=finalizeV244ProductLines(rows);
  assert.equal(line.quantity,20);assert.equal(line.retailPrice,4.8);
});
