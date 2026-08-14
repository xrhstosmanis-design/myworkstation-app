import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/owner-shifts.js",import.meta.url),"utf8");

test("owner shift journal enriches POS sale rows with the real SaleLine products",()=>{
  assert.match(route,/AS "saleLines"/);
  assert.match(route,/json_build_object\('id',l\."id",'productId',l\."productId",'description',l\."description",'quantity',l\."quantity"/);
  assert.match(route,/\["SALE_CASH","SALE_CARD"\]\.includes\(row\.type\)/);
  assert.match(route,/productSummary=saleLines\.map\(line=>`\$\{Math\.abs\(n\(line\.quantity\)\)\}× \$\{line\.description\|\|"Προϊόν"\}`\)\.join\(" · "\)/);
  assert.match(route,/auditDescription:saleType&&productSummary\?row\.description:null/);
  assert.match(route,/description:saleType&&productSummary\?productSummary:row\.description/);
});
