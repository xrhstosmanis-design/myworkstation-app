import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const auth=await readFile(new URL("../src/middleware/auth.js",import.meta.url),"utf8");
const panel=await readFile(new URL("../../client/src/components/store/MyShiftEntriesPanel.jsx",import.meta.url),"utf8");

test("Store Operator runtime identity comes from the live credential row",()=>{
  assert.match(auth,/SELECT c\."id",c\."displayName",c\."employeeId",c\."companyId",c\."storeId"/);
  assert.match(auth,/req\.user=\{\.\.\.payload,id:operator\.id,operatorId:operator\.id,employeeId:operator\.employeeId,companyId:operator\.companyId,storeId:operator\.storeId,fullName:operator\.displayName,role:operator\.role,permissions\}/);
});

test("My shift payments are owned by immutable operator id, not display name",()=>{
  assert.match(panel,/const operatorId=String\(operator\?\.id\|\|""\)\.trim\(\)/);
  assert.match(panel,/String\(row\.actorId\|\|""\)\.trim\(\)===operatorId/);
  assert.doesNotMatch(panel,/row\.actorName[\s\S]*===own/);
});
