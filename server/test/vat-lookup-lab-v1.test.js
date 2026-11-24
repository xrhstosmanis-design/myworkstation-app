import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {normalizeViesResult,staffVatLookupCapability} from "../src/routes/commerce-vat-lookup.js";
import {staffRequestCapability} from "../../shared/backoffice-staff.mjs";

test("normalizes verified VIES supplier data without writing it",()=>{
  assert.deepEqual(normalizeViesResult({isValid:true,name:"  ΔΟΚΙΜΗ ΑΕ ",address:"ΑΘΗΝΑ\nΕΛΛΑΔΑ",requestDate:"2026-09-10"},"123456789"),{valid:true,taxId:"123456789",name:"ΔΟΚΙΜΗ ΑΕ",address:"ΑΘΗΝΑ ΕΛΛΑΔΑ",source:"EU_VIES",requestDate:"2026-09-10"});
});

test("keeps the fullest official VIES name when aliases are pipe-separated",()=>{
  const result=normalizeViesResult({isValid:true,name:"ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ||ΣΤΕΦΑΝΙΔΗΣ Ι ΑΕ"},"998878583");
  assert.equal(result.name,"ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ");
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

test("official AADE lookup bypasses the local supplier shortcut and distinguishes upstream failure",()=>{
  const route=fs.readFileSync(new URL("../src/routes/commerce-vat-lookup.js",import.meta.url),"utf8");
  const supplier=fs.readFileSync(new URL("../../client/src/components/commerce/installSupplierControlSuite.js",import.meta.url),"utf8");
  assert.match(route,/if\(existing&&\(!official\|\|localOnly\)\)return res\.json/);
  assert.match(route,/if\(localOnly\)return res\.json\(\{valid:false/);
  assert.match(route,/if\(!aade\.ok\)return res\.status\(502\)/);
  assert.match(route,/if\(!result\.valid\)return res\.status\(502\)/);
  assert.match(supplier,/vat-lookup\?official=1&taxId=/);
});

test("AADE request matches the live WSDL SOAP 1.2 binding",()=>{
  const route=fs.readFileSync(new URL("../src/routes/commerce-vat-lookup.js",import.meta.url),"utf8");
  assert.match(route,/http:\/\/www\.w3\.org\/2003\/05\/soap-envelope/);
  assert.match(route,/application\/soap\+xml; charset=utf-8/);
  assert.match(route,/RgWsPublic2Service:rgWsPublic2AfmMethod/);
  assert.doesNotMatch(route,/"SOAPAction":/);
});

test("AADE credentials use the official WS-Security UsernameToken header",()=>{
  const route=fs.readFileSync(new URL("../src/routes/commerce-vat-lookup.js",import.meta.url),"utf8");
  assert.match(route,/oasis-200401-wss-wssecurity-secext-1\.0\.xsd/);
  assert.match(route,/<wsse:Security/);
  assert.match(route,/<wsse:UsernameToken>/);
  assert.match(route,/<wsse:Username>\$\{xmlEscape\(credentials\.accountId\)\}/);
  assert.match(route,/<wsse:Password>\$\{xmlEscape\(credentials\.secret\)\}/);
  assert.doesNotMatch(route,/<ns2:AuthenticationHeader>/);
});

test("delegated official lookup requires its own live scoped grant and explicit mode",()=>{
  const query={storeId:"lab",taxId:"123456789",official:"1"};
  const req={query,user:{storeId:"lab"},staffGrant:{capability:"invoices.supplier-lookup-official"}};
  assert.equal(staffVatLookupCapability(req,"lab"),"invoices.supplier-lookup-official");
  assert.throws(()=>staffVatLookupCapability(req,"foreign"),{status:403});
  assert.throws(()=>staffVatLookupCapability({...req,staffGrant:{capability:"invoices.supplier-lookup"}},"lab"),{status:403});
  for(const patch of [{localOnly:"1"},{storeId:["lab"]},{official:["1"]},{taxId:["123456789"]},{companyId:"foreign"}]){
    assert.throws(()=>staffVatLookupCapability({...req,query:{...query,...patch}},"lab"),{status:403});
  }
  assert.equal(staffRequestCapability("GET","/api/commerce/vat-lookup",{},{localOnly:"1"}),"invoices.supplier-lookup");
  assert.equal(staffRequestCapability("GET","/api/commerce/vat-lookup",{official:"1"},{}),null);
  const route=fs.readFileSync(new URL("../src/routes/commerce-vat-lookup.js",import.meta.url),"utf8");
  const grant='if(staff)await requireStaffGrant(prisma,req.user,storeId,capability);';
  const aade=route.indexOf('const aade=await fetch("https://www1.gsis.gr/');
  assert.ok(route.indexOf(grant)<aade&&route.lastIndexOf(grant)>aade);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\} AND "storeId"=\$\{store\.id\} AND "kind"='VAT_LOOKUP'/);
  assert.ok(route.indexOf("if(official)return res.status(409)")<route.indexOf("const response=await fetch"));
});
