import test from "node:test";
import assert from "node:assert/strict";
import {actionFromRequest,safeAuditDetails} from "../src/platform-commercial-audit.js";

test("maps subscription changes to a commercial audit action",()=>{
  const req={method:"PUT",path:"/companies/company-1/license",body:{plan:"PILOT"}};
  assert.deepEqual(actionFromRequest(req,{}),{
    action:"SUBSCRIPTION_MODULES_UPDATED",
    targetType:"COMPANY",
    targetId:"company-1",
    targetName:null
  });
});

test("maps new customer response to the created customer",()=>{
  const req={method:"POST",path:"/companies",body:{companyName:"Δοκιμαστικός πελάτης"}};
  const result=actionFromRequest(req,{company:{id:"company-2",name:"Δοκιμαστικός πελάτης"}});
  assert.equal(result.action,"CUSTOMER_CREATED");
  assert.equal(result.targetId,"company-2");
  assert.equal(result.targetName,"Δοκιμαστικός πελάτης");
});

test("never records passwords, PINs or secret values",()=>{
  const req={
    body:{
      companyName:"Πελάτης",
      ownerEmail:"owner@example.com",
      temporaryPassword:"DoNotStoreThis123!",
      password:"DoNotStoreThisEither",
      newPassword:"SecretNewPassword",
      pin:"1234",
      totpSecret:"TOPSECRET",
      modules:[{key:"CORE",active:true},{key:"LEAVES",active:false}]
    }
  };
  const details=safeAuditDetails(req,{});
  const serialized=JSON.stringify(details);
  assert.equal(details.companyName,"Πελάτης");
  assert.equal(details.ownerEmail,"owner@example.com");
  assert.equal(details.activeModuleCount,1);
  assert.ok(!serialized.includes("DoNotStore"));
  assert.ok(!serialized.includes("1234"));
  assert.ok(!serialized.includes("TOPSECRET"));
});
