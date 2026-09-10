import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {normalizeViesResult} from "../src/routes/commerce-vat-lookup.js";

test("normalizes verified VIES supplier data without writing it",()=>{
  assert.deepEqual(normalizeViesResult({isValid:true,name:"  ΔΟΚΙΜΗ ΑΕ ",address:"ΑΘΗΝΑ\nΕΛΛΑΔΑ",requestDate:"2026-09-10"},"123456789"),{valid:true,taxId:"123456789",name:"ΔΟΚΙΜΗ ΑΕ",address:"ΑΘΗΝΑ ΕΛΛΑΔΑ",source:"EU_VIES",requestDate:"2026-09-10"});
});

test("VAT lookup is read-only and tenant/store scoped",()=>{
  const source=fs.readFileSync(new URL("../src/routes/commerce-vat-lookup.js",import.meta.url),"utf8");
  assert.match(source,/companyId:req\.user\.companyId/);
  assert.match(source,/readOnly:true/);
  assert.doesNotMatch(source,/INSERT INTO|UPDATE "Supplier"|DELETE FROM/);
});

test("VAT lookup reads dynamically bootstrapped suppliers through SQL",()=>{
  const source=fs.readFileSync(new URL("../src/routes/commerce-vat-lookup.js",import.meta.url),"utf8");
  assert.match(source,/FROM "Supplier"/);
  assert.match(source,/REGEXP_REPLACE/);
  assert.doesNotMatch(source,/prisma\.supplier/);
});

test("POS requires explicit lookup before supplier creation",()=>{
  const source=fs.readFileSync(new URL("../../client/src/components/store/StoreSupplierInvoiceV244.jsx",import.meta.url),"utf8");
  assert.match(source,/Έλεγχος επίσημης επωνυμίας από ΑΦΜ/);
});

test("actual fast POS invoice screen exposes explicit VAT lookup",()=>{
  const source=fs.readFileSync(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
  assert.match(source,/ΕΛΕΓΧΟΣ ΕΠΙΣΗΜΗΣ ΕΠΩΝΥΜΙΑΣ ΑΠΟ ΑΦΜ/);
  assert.match(source,/api\/commerce\/vat-lookup/);
  assert.match(source,/ΚΑΤΑΧΩΡΙΣΗ ΝΕΟΥ ΠΡΟΜΗΘΕΥΤΗ/);
});

test("normalizes full AADE supplier identity",async()=>{
  const {normalizeAadeResult}=await import("../src/routes/commerce-vat-lookup.js");
  const xml="<result><onomasia>ΠΡΟΜΗΘΕΥΤΗΣ ΑΕ</onomasia><postal_address>ΚΗΦΙΣΙΑΣ</postal_address><postal_address_no>10</postal_address_no><postal_zip_code>11526</postal_zip_code><postal_area_description>ΑΘΗΝΑ</postal_area_description><firm_act_descr>ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ</firm_act_descr></result>";
  assert.deepEqual(normalizeAadeResult(xml,"123456789"),{valid:true,taxId:"123456789",name:"ΠΡΟΜΗΘΕΥΤΗΣ ΑΕ",address:"ΚΗΦΙΣΙΑΣ 10 11526 ΑΘΗΝΑ",city:"ΑΘΗΝΑ",profession:"ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ",source:"AADE_BASIC_REGISTRY"});
});
