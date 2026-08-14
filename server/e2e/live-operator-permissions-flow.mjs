import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-owner-e2e-password";
const operatorPin="2468";

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${baseUrl}${path}`,{
    method,
    headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  let payload=null;
  try{payload=await response.json()}catch{}
  return {response,payload};
}

const profileBody=permissions=>({
  username:"e2e.operator",
  fullName:"E2E Store Operator",
  stationPhone:null,
  mobilePhone:null,
  hourlyRate:null,
  role:"EMPLOYEE",
  active:true,
  posAccess:true,
  backofficeAccess:false,
  powerUser:false,
  permissions,
  backofficeMenu:{},
  backofficeTabs:{},
  customerDisplay:{},
  terminalPos:null,
  cashLimit:null,
  notes:"E2E live permission test",
  retailSaleSeries:null,
  retailReturnSeries:null,
  installationAddress:null,
  installationPhone:null
});

async function updateProfile(ownerToken,employeeId,permissions){
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{
    method:"PATCH",token:ownerToken,body:profileBody(permissions)
  });
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI permissions E2E"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;
  assert.ok(ownerToken);

  const supplier=await request("/api/commerce/suppliers",{method:"POST",token:ownerToken,body:{name:"E2E Permission Supplier",taxId:"E2E-PERM-001"}});
  assert.equal(supplier.response.status,201,JSON.stringify(supplier.payload));
  const supplierId=supplier.payload.id;

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{
    method:"POST",token:ownerToken,
    body:{username:"e2e.operator",fullName:"E2E Store Operator",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}
  });
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;
  assert.ok(employeeId);

  const initialPermissions={cash:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:true};
  await updateProfile(ownerToken,employeeId,initialPermissions);

  const operatorLogin=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(operatorLogin.response.status,200,JSON.stringify(operatorLogin.payload));
  const operatorToken=operatorLogin.payload?.token;
  assert.ok(operatorToken);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{
    method:"POST",token:operatorToken,
    body:{shiftLabel:"E2E live permissions",drawer:40,custody:0,coins:0,safe:0,note:"operator opened shift"}
  });
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const deniedSupplier=await request(`/api/transactions/stores/${storeId}`,{
    method:"POST",token:operatorToken,
    body:{type:"SUPPLIER_PAYMENT",amount:5,description:"denied before BackOffice grant",supplierId,evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:"e2e-perm-denied-supplier-001"}
  });
  assert.equal(deniedSupplier.response.status,403,"Supplier payment was allowed before BackOffice supplierPayment grant");

  await updateProfile(ownerToken,employeeId,{...initialPermissions,supplierPayment:true});

  const allowedSameToken=await request(`/api/transactions/stores/${storeId}`,{
    method:"POST",token:operatorToken,
    body:{type:"SUPPLIER_PAYMENT",amount:5,description:"allowed after live BackOffice grant",supplierId,evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:"e2e-perm-allowed-supplier-001"}
  });
  assert.equal(allowedSameToken.response.status,201,JSON.stringify(allowedSameToken.payload));
  assert.equal(allowedSameToken.payload.sessionId,sessionId);
  assert.equal(allowedSameToken.payload.paymentSource,"CASH_SHIFT");

  await updateProfile(ownerToken,employeeId,{...initialPermissions,supplierPayment:true,sameShiftPayments:false});

  const deniedSameShift=await request(`/api/transactions/stores/${storeId}`,{
    method:"POST",token:operatorToken,
    body:{type:"SUPPLIER_PAYMENT",amount:6,description:"denied same-shift after live revoke",supplierId,evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:"e2e-perm-denied-shift-001"}
  });
  assert.equal(deniedSameShift.response.status,403,"Same-shift payment was allowed after BackOffice revoke");

  const allowedExternal=await request(`/api/transactions/stores/${storeId}`,{
    method:"POST",token:operatorToken,
    body:{type:"SUPPLIER_PAYMENT",amount:3,description:"external remains allowed",supplierId,evidenceMode:"NO_DOCUMENT",paymentSource:"EXTERNAL",idempotencyKey:"e2e-perm-external-001"}
  });
  assert.equal(allowedExternal.response.status,201,JSON.stringify(allowedExternal.payload));
  assert.equal(allowedExternal.payload.paymentSource,"EXTERNAL");

  await updateProfile(ownerToken,employeeId,{cash:false,shiftTransactionsPos:false,allShiftTransactionsPos:false,supplierPayment:true,sameShiftPayments:true});

  const deniedLedger=await request(`/api/transactions/stores/${storeId}/overview`,{token:operatorToken});
  assert.equal(deniedLedger.response.status,403,"Already logged-in operator kept ledger access after BackOffice live revoke");

  const directory=await request(`/api/operator-management/stores/${storeId}/operators`,{token:ownerToken});
  assert.equal(directory.response.status,200,JSON.stringify(directory.payload));
  const operatorRow=(directory.payload.operators||[]).find(row=>row.employeeId===employeeId);
  assert.ok(operatorRow);
  assert.equal(operatorRow.permissions?.cash,false);
  assert.equal(operatorRow.permissions?.shiftTransactionsPos,false);
  assert.equal(operatorRow.permissions?.supplierPayment,true);

  const from=new Date(Date.now()-24*60*60*1000).toISOString();
  const to=new Date(Date.now()+24*60*60*1000).toISOString();
  const report=await request(`/api/owner-payments/report?storeId=${storeId}&supplierId=${supplierId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{token:ownerToken});
  assert.equal(report.response.status,200,JSON.stringify(report.payload));
  const payments=(report.payload.movements||[]).filter(row=>row.supplierId===supplierId&&!row.reversedAt);
  assert.equal(payments.length,2,"BackOffice report does not reflect exactly the two authorized supplier payments");
  assert.deepEqual(new Set(payments.map(row=>row.paymentSource)),new Set(["CASH_SHIFT","EXTERNAL"]));

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{
    method:"POST",token:ownerToken,
    body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:35,custody:0,coins:0,safe:0,note:"owner close after live permission test"}
  });
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.expenses,5,"External payment incorrectly reduced the shift");
  assert.equal(closed.payload.expectedOperational,35);
  assert.equal(closed.payload.actualOperational,35);
  assert.equal(closed.payload.variance,0);

  console.log("E2E live BackOffice operator permissions passed",{employeeId,sessionId,authorizedPayments:payments.length});
}

try{await main()}finally{await prisma.$disconnect()}
