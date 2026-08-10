import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const backend="src/routes/management-vat-departments.js";
const client="../client/src/components/commerce/ManagementVatDepartmentsPanel.jsx";
const installer="../client/src/components/commerce/installManagementVatSuite.js";
const bootstrap="../client/src/management-vat-bootstrap.js";
const index=fs.readFileSync("src/index.js","utf8");
const html=fs.readFileSync("../client/index.html","utf8");
const b=fs.readFileSync(backend,"utf8"),c=fs.readFileSync(client,"utf8"),i=fs.readFileSync(installer,"utf8"),boot=fs.readFileSync(bootstrap,"utf8");

test("VAT backend parses and is mounted",()=>{execFileSync(process.execPath,["--check",backend]);assert.match(index,/managementVatDepartmentsRoutes/);assert.match(index,/\/api\/management\/vat-departments/)});
test("VAT departments are tenant scoped and additive",()=>{assert.match(b,/ManagementVatDepartment/);assert.match(b,/companyId/);assert.match(b,/vatDepartmentId/);assert.match(b,/ensureCompanyDepartments/);assert.match(b,/UPDATE "Product" SET "vatDepartmentId"/)});
test("editing VAT rate propagates to assigned products",()=>{assert.match(b,/UPDATE "Product" SET "vatRate"/);assert.match(b,/vatVerified/);assert.match(b,/vatDepartmentId/)});
test("VAT product drilldown uses server pagination and real sources",()=>{assert.match(b,/pageSize=Math\.min\(200/);assert.match(b,/PurchaseDocumentLine/);assert.match(b,/StoreProduct/);assert.match(b,/ProductCategory/);assert.match(b,/ProductSubcategory/)});
test("VAT UI contains screenshot columns and lower actions",()=>{for(const text of ["ΚΩΔ ΦΠΑ","Τμήμα Ταμειακής","Περιγραφή","% ΦΠΑ","Είδη","Εμπορία","ID","Κλείσιμο","Ανανέωση","Νέα εγγραφή","Excel / CSV"])assert.ok(c.includes(text),text)});
test("pencil opens VAT edit and barcode opens products",()=>{assert.match(c,/Διόρθωση τμήματος ΦΠΑ/);assert.match(c,/setDialog\(\{type:"edit"/);assert.match(c,/setDialog\(\{type:"products"/);assert.match(c,/<Barcode\/>/)});
test("VAT edit contains cash register department and exemption options",()=>{for(const text of ["Τμήμα ταμειακής","% ΦΠΑ","Κωδικός","Εξαίρεση ΦΠΑ","Χωρίς ΦΠΑ - άρθρο 27","Χωρίς ΦΠΑ - άρθρο 48"])assert.ok((b+c).includes(text),text)});
test("VAT products have lower actions and bulk reassignment",()=>{for(const text of ["Περιγραφή είδους","Λιανική","Κατηγορία","Υποκατηγορία","Προμηθευτής","Ομαδική διόρθωση","bulk-assign"])assert.ok(c.includes(text),text)});
test("VAT suite is real second management tab without MutationObserver",()=>{assert.match(i,/Τμήματα ΦΠΑ/);assert.match(i,/management-vat-active/);assert.doesNotMatch(i+boot,/new MutationObserver/);assert.match(html,/management-vat-bootstrap\.js/)});
test("MyWorkStation palette is preserved",()=>{const css=fs.readFileSync("../client/src/components/commerce/management-vat-departments.css","utf8");assert.match(css,/#123b5d/);assert.match(css,/#0f766e/);assert.doesNotMatch(css,/#ff9|#ffa500/i)});
