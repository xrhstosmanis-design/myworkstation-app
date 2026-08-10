import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const backend="server/src/routes/management-customer-categories.js";
const installer="client/src/components/commerce/installManagementCustomerCategoriesSuite.js";
const bootstrap="client/src/management-customer-categories-bootstrap.js";
const panel="client/src/components/commerce/ManagementCustomerCategoriesPanel.jsx";
const css="client/src/components/commerce/management-customer-categories.css";
const b=read(backend),i=read(installer),boot=read(bootstrap),c=read(panel),styles=read(css),index=read("server/src/index.js"),html=read("client/index.html");

test("customer categories backend and installer parse",()=>{execFileSync(process.execPath,["--check",path.join(repo,backend)]);execFileSync(process.execPath,["--check",path.join(repo,installer)]);execFileSync(process.execPath,["--check",path.join(repo,bootstrap)])});
test("customer categories are real additive company scoped records",()=>{assert.match(b,/ManagementCustomerCategory/);assert.match(b,/customerCategoryId/);assert.match(b,/companyId/);assert.match(b,/SUPER_ADMIN/);assert.match(b,/STORE_OPERATOR/);assert.doesNotMatch(b,/Πίστωση.*Μετρητά.*Ετεροχρονισμένη/s)});
test("photographed rule columns exist",()=>{for(const text of ["Περιγραφή","Με επιλογή","Με πίστωση","Πώληση στην αγορά ή χονδρική","ετεροχρονισμένη","Κλείσιμο","Ανανέωση","Νέα εγγραφή","Excel / CSV"])assert.ok(c.includes(text),text)});
test("all four customer category flags persist",()=>{for(const token of ["selectable","allowCredit","saleAtCostOrWholesale","deferred"])assert.match(b,new RegExp(token));for(const token of ["selectable","allowCredit","saleAtCostOrWholesale","deferred"])assert.match(c,new RegExp(token))});
test("edit and soft deactivate are functional",()=>{assert.match(c,/<Edit3\/>/);assert.match(c,/<Trash2\/>/);assert.match(b,/router\.patch\("\/:id"/);assert.match(b,/SET "active"=false/);assert.doesNotMatch(b,/DELETE FROM "ManagementCustomerCategory"/)});
test("customer categories tab is enabled without new MutationObserver",()=>{assert.match(i,/Κατηγορίες πελατών/);assert.match(i,/management-customer-category-active/);assert.doesNotMatch(i+boot,/new MutationObserver/);assert.match(html,/management-customer-categories-bootstrap\.js/)});
test("server mounts customer categories before generic management route",()=>{const specific=index.indexOf('/api/management/customer-categories');const generic=index.indexOf('/api/management",auth');assert.ok(specific>=0&&generic>=0&&specific<generic)});
test("MyWorkStation palette is preserved",()=>{assert.match(styles,/#123b5d/);assert.match(styles,/#0f766e/);assert.doesNotMatch(styles,/#ffa500|#ff9/i)});
