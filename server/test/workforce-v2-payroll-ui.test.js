import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("Workforce V2 exposes one payroll workspace from its main tabs",()=>{
  const panel=read("client/src/components/platform/WorkforceV2EmployeesPanel.jsx");
  assert.match(panel,/WorkforceV2PayrollTab/);
  assert.match(panel,/tab==="payroll"/);
  assert.match(panel,/> Μισθοδοσία</);
});

test("payroll workspace covers preview, payment sources and immutable close",()=>{
  const ui=read("client/src/components/platform/WorkforceV2PayrollTab.jsx");
  for(const contract of ["/preview","/periods","/payments","/close","openSessions","BANK_TRANSFER","CORPORATE_CARD","CASH_SHIFT","requestKey","confirmed:true"])assert.match(ui,new RegExp(contract.replace("/","\\/")));
  assert.match(ui,/detail\.status==="CLOSED"/);
  assert.match(ui,/totals\.balance>0/);
});
