import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");

test("Gate 8 central audit includes every operator lifecycle event",()=>{
  for(const eventType of [
    "OPERATOR_CREATED","OPERATOR_PROFILE_UPDATED","OPERATOR_PIN_CHANGED","OPERATOR_PIN_RANDOMIZED",
    "OPERATOR_DEACTIVATED","OPERATOR_LOGIN_PIN","OPERATOR_LOGIN_CARD","OPERATOR_LOGOUT"
  ]){
    assert.match(route,new RegExp(`auditEventLabels\\.${eventType}=`));
    assert.match(route,new RegExp(`'${eventType}'`));
  }
  assert.match(route,/operatorLifecycleEvents\.has\(r\.eventType\)/);
  assert.match(route,/operatorLifecycleDescription\(r\.eventType,details\)/);
});

test("Gate 8 operator lifecycle projection exposes only allow-listed metadata",()=>{
  const helper=route.slice(route.indexOf("const safeOperatorLifecycleDetails="),route.indexOf("const operatorLifecycleDescription="));
  for(const safeField of ["employeeId","role","active","posAccess","backofficeAccess","cardLast4","terminalPos"]){
    assert.match(helper,new RegExp(safeField));
  }
  for(const secretField of ["pin","pinHash","cardCode","cardCodeHash","password","secret"]){
    assert.doesNotMatch(helper,new RegExp(secretField,"i"));
  }
  assert.match(route,/financialDetails:safeLifecycleDetails\|\|details/);
});

test("Gate 8 audit query remains company and store scoped",()=>{
  assert.match(route,/WHERE \(\$\{companyId\}::text IS NULL OR a\."companyId"=\$\{companyId\}\)/);
  assert.match(route,/AND \(\$\{storeId\}::text IS NULL OR a\."storeId"=\$\{storeId\}\)/);
});
