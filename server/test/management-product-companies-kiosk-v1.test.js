import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const backend="server/src/routes/management-product-companies.js";
const installer="client/src/components/commerce/installManagementProductCompaniesSuite.js";
const bootstrap="client/src/management-product-companies-bootstrap.js";
const panel="client/src/components/commerce/ManagementProductCompaniesPanel.jsx";
const css="client/src/components/commerce/management-product-companies.css";
const b=read(backend),i=read(installer),boot=read(bootstrap),c=read(panel),styles=read(css),index=read("server/src/index.js"),html=read("client/index.html");

test("product companies backend and installer parse",()=>{execFileSync(process.execPath,["--check",path.join(repo,backend)]);execFileSync(process.execPath,["--check",path.join(repo,installer)]);execFileSync(process.execPath,["--check",path.join(repo,bootstrap)])});
test("product companies use real master brand source without mutating master catalog",()=>{assert.match(b,/MasterProduct/);assert.match(b,/brandName/);assert.match(b,/sourceBrandName/);assert.doesNotMatch(b,/UPDATE "MasterProduct"/)});
test("product companies are additive and tenant scoped",()=>{assert.match(b,/ManagementProductCompany/);assert.match(b,/productCompanyId/);assert.match(b,/companyId/);assert.match(b,/SUPER_ADMIN/);assert.match(b,/STORE_OPERATOR/)});
test("unassigned grouping represents only real missing mappings",()=>{assert.match(b,/productCompanyId" IS NULL/);assert.match(b,/UNASSIGNED/);assert.match(b,/_ΧΩΡΙΣ ΕΤΑΙΡΕΙΑ/);assert.doesNotMatch(b,/ALGIDA|BACARDI HELLAS|ALFA FOODS/)});
test("company grid matches photographed columns and lower actions",()=>{for(const text of ["Περιγραφή","Είδη","% ειδών","Κλείσιμο","Ανανέωση","Νέα εγγραφή","Excel / CSV"])assert.ok(c.includes(text),text);assert.match(c,/<Edit3\/>/);assert.match(c,/<Barcode\/>/);assert.match(c,/<Trash2\/>/)});
test("barcode drilldown is real and server paginated",()=>{assert.match(c,/product-companies\/\$\{company\.id\}\/products/);assert.match(b,/pageSize=Math\.min\(200/);assert.match(b,/PurchaseDocumentLine/);assert.match(b,/StoreProduct/);assert.match(c,/Ομαδική διόρθωση/);assert.match(b,/bulk-assign/)});
test("soft deactivate preserves historical product assignment",()=>{assert.match(b,/SET "active"=false/);assert.doesNotMatch(b,/DELETE FROM "ManagementProductCompany"/)});
test("companies tab is enabled without another MutationObserver",()=>{assert.match(i,/Εταιρείες/);assert.match(i,/management-company-active/);assert.doesNotMatch(i+boot,/new MutationObserver/);assert.match(html,/management-product-companies-bootstrap\.js/)});
test("server mounts product companies before generic management route",()=>{const specific=index.indexOf('/api/management/product-companies');const generic=index.indexOf('/api/management",auth');assert.ok(specific>=0&&generic>=0&&specific<generic)});
test("MyWorkStation palette is preserved",()=>{assert.match(styles,/#123b5d/);assert.match(styles,/#0f766e/);assert.doesNotMatch(styles,/#ffa500|#ff9/i)});
