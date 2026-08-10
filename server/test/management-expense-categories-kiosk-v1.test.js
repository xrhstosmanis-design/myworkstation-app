import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const backend="src/routes/management-expense-categories.js";
const client="../client/src/components/commerce/ManagementExpenseCategoriesPanel.jsx";
const installer="../client/src/components/commerce/installManagementExpenseSuite.js";
const bootstrap="../client/src/management-expense-bootstrap.js";
const serverIndex=fs.readFileSync("src/index.js","utf8");
const html=fs.readFileSync("../client/index.html","utf8");
const b=fs.readFileSync(backend,"utf8"),c=fs.readFileSync(client,"utf8"),i=fs.readFileSync(installer,"utf8"),boot=fs.readFileSync(bootstrap,"utf8");

test("expense categories backend parses and mounts behind cash control",()=>{execFileSync(process.execPath,["--check",backend]);assert.match(serverIndex,/managementExpenseCategoriesRoutes/);assert.match(serverIndex,/\/api\/management\/expense-categories/);assert.match(serverIndex,/requireCompanyModule\("CASH_CONTROL"\)/)});
test("expense category schema is additive tenant scoped and non destructive",()=>{assert.match(b,/ManagementExpenseCategory/);assert.match(b,/companyId/);assert.match(b,/expenseCategoryId/);assert.match(b,/softDeleted:true/);assert.doesNotMatch(b,/DELETE FROM "ManagementExpenseCategory"/)});
test("screen matches photographed description pencil trash and lower actions",()=>{for(const text of ["Περιγραφή","Κλείσιμο","Ανανέωση","Νέα εγγραφή","Excel / CSV","Διόρθωση κατηγορίας εξόδου"])assert.ok(c.includes(text),text);assert.match(c,/<Edit3\/>/);assert.match(c,/<Trash2\/>/)});
test("no fake Kiosk expense rows are seeded",()=>{for(const fake of ["ΑΓΟΡΕΣ ΠΕΡΙΠΤΕΡΟΥ","ΕΦΟΡΙΑ","ΜΙΣΘΟΔΟΣΙΑ","ΠΟΣΟΣΤΑ"])assert.ok(!b.includes(fake)&&!c.includes(fake),fake)});
test("expense categories tab reuses event bootstrap without MutationObserver",()=>{assert.match(i,/Κατηγορίες εξόδων/);assert.match(i,/management-expense-active/);assert.doesNotMatch(i+boot,/new MutationObserver/);assert.match(html,/management-expense-bootstrap\.js/)});
test("expense categories keep MyWorkStation navy teal palette",()=>{const css=fs.readFileSync("../client/src/components/commerce/management-expense-categories.css","utf8");assert.match(css,/#123b5d/);assert.match(css,/#0f766e/)});
