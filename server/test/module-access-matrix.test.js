import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildModuleAccessMatrix} from "../src/services/module-access-matrix.js";

const catalog=[
  {key:"CORE",name:"Core",category:"CORE",commercialReady:true},
  {key:"PROFITABILITY",name:"Κερδοφορία",category:"REPORTS",commercialReady:false}
];

test("access matrix keeps Super Admin permanent and applies owner/employee role rules",()=>{
  const matrix=buildModuleAccessMatrix({catalog,licenseAllowed:true,companyActiveModules:["CORE","PROFITABILITY"],storeModules:[]});
  const core=matrix.rows.find(row=>row.key==="CORE");
  const profitability=matrix.rows.find(row=>row.key==="PROFITABILITY");
  assert.equal(core.superAdmin.allowed,true);
  assert.equal(core.owner.allowed,true);
  assert.equal(core.employee.allowed,true);
  assert.equal(profitability.superAdmin.allowed,true);
  assert.equal(profitability.owner.allowed,true);
  assert.equal(profitability.employee.allowed,false);
  assert.equal(profitability.employeeWithPermission.allowed,true);
  assert.equal(matrix.summary.employeeRestricted,1);
});

test("store override and inactive company license fail closed for customer roles",()=>{
  const overridden=buildModuleAccessMatrix({catalog,licenseAllowed:true,companyActiveModules:["CORE","PROFITABILITY"],storeModules:[{key:"PROFITABILITY",configured:true,active:false}]});
  assert.equal(overridden.rows.find(row=>row.key==="PROFITABILITY").owner.allowed,false);
  assert.equal(overridden.rows.find(row=>row.key==="PROFITABILITY").source,"STORE_OVERRIDE");

  const expired=buildModuleAccessMatrix({catalog,licenseAllowed:false,companyActiveModules:["CORE","PROFITABILITY"],storeModules:[{key:"PROFITABILITY",configured:true,active:true}]});
  assert.equal(expired.rows.every(row=>row.superAdmin.allowed),true);
  assert.equal(expired.rows.some(row=>row.owner.allowed),false);
  assert.equal(expired.rows.some(row=>row.employee.allowed),false);
});

test("Super Admin exposes a read-only access matrix in the store controls",async()=>{
  const [route,ui]=await Promise.all([
    readFile(new URL("../src/routes/platform-store-modules.js",import.meta.url),"utf8"),
    readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8")
  ]);
  assert.match(route,/stores\/:storeId\/access-matrix/);
  assert.match(route,/buildModuleAccessMatrix/);
  assert.match(ui,/Έλεγχος δικαιωμάτων/);
  assert.match(ui,/Μόνιμη πρόσβαση/);
});
