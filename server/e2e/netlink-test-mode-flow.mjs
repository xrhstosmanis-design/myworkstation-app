import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-owner-e2e-password";
const operatorPin="8426";

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${baseUrl}${path}`,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  let payload=null;try{payload=await response.json()}catch{}
  return {response,payload};
}

const profileBody=permissions=>({username:"e2e.netlink.cashier",fullName:"E2E Netlink Cashier",stationPhone:null,mobilePhone:null,hourlyRate:null,role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,permissions,backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:null,cashLimit:null,notes:"Netlink test-mode E2E",retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null});

async function main(){
  assert.equal(process.env.NETLINK_TEST_MODE,"true");
  assert.equal(process.env.NETLINK_MOCK_PROVIDER,"true");
  assert.equal(process.env.NETLINK_ENABLE_EXECUTE,"true");
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY","NETLINK_PREPAID"]){await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}})}
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI Netlink E2E"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));const ownerToken=ownerLogin.payload.token;

  const product=await request("/api/commerce/products",{method:"POST",token:ownerToken,body:{name:"NETLINK SERVICE E2E",sku:`NETLINK-SERVICE-${Date.now()}`,unit:"PIECE",vatRate:24,salePrice:0,costPrice:0,trackStock:false,barcodes:[],storeId,openingStock:0}});
  assert.equal(product.response.status,201,JSON.stringify(product.payload));const productId=product.payload.id;

  const config=await request(`/api/netlink/stores/${storeId}/config`,{method:"PUT",token:ownerToken,body:{saleProductId:productId,active:true,notes:"CI test mode"}});
  assert.equal(config.response.status,200,JSON.stringify(config.payload));assert.equal(config.payload.saleProduct.trackStock,false);

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:`e2e.netlink.${Date.now()}`,fullName:"E2E Netlink Cashier",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));const employeeId=created.payload.employeeId;
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:profileBody({cash:true,cards:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:true})});
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));
  const operatorLogin=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(operatorLogin.response.status,200,JSON.stringify(operatorLogin.payload));const operatorToken=operatorLogin.payload.token;

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token:operatorToken,body:{shiftLabel:"E2E Netlink",drawer:50,custody:0,coins:0,safe:0,note:"Netlink E2E"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));

  const status=await request("/api/netlink/status",{token:operatorToken});
  assert.equal(status.response.status,200,JSON.stringify(status.payload));assert.equal(status.payload.testMode,true);assert.equal(status.payload.provider,"MOCK");assert.equal(status.payload.fiscalGateRequired,false);assert.equal(status.payload.commissionRate,.01);

  const requestId=crypto.randomUUID();
  const prepared=await request("/api/netlink/prepare",{method:"POST",token:operatorToken,body:{storeId,productId:"MOCK-20",payload:{amount:20},requestId}});
  assert.equal(prepared.response.status,200,JSON.stringify(prepared.payload));assert.equal(prepared.payload.amount,20);

  const checkout=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token:operatorToken,body:{items:[{productId,quantity:1,unitPriceOverride:20,overrideReason:"Netlink prepaid MOCK-20"}],paymentMethod:"CASH",clientTransactionId:crypto.randomUUID()}});
  assert.equal(checkout.response.status,201,JSON.stringify(checkout.payload));assert.equal(checkout.payload.total,20);const saleId=checkout.payload.id||checkout.payload.saleId;assert.ok(saleId);

  const executed=await request("/api/netlink/execute",{method:"POST",token:operatorToken,body:{storeId,productId:"MOCK-20",payload:{amount:20},requestId,paymentMethod:"CASH",saleId,testRun:true,confirmation:prepared.payload.result?.data||{}}});
  assert.equal(executed.response.status,200,JSON.stringify(executed.payload));assert.equal(executed.payload.status,"COMPLETED");assert.equal(executed.payload.saleId,saleId);assert.equal(executed.payload.saleTotal,20);assert.equal(executed.payload.commission.rate,.01);assert.equal(executed.payload.commission.amount,.2);assert.ok(executed.payload.result?.data?.pin?.startsWith("TEST-"));

  const duplicate=await request("/api/netlink/execute",{method:"POST",token:operatorToken,body:{storeId,productId:"MOCK-20",payload:{amount:20},requestId,paymentMethod:"CASH",saleId,testRun:true}});
  assert.equal(duplicate.response.status,409,"duplicate Netlink execute must be rejected");assert.equal(duplicate.payload.code,"NETLINK_DUPLICATE_REQUEST");

  const summary=await request(`/api/netlink/settlement-summary?storeId=${encodeURIComponent(storeId)}`,{token:operatorToken});
  assert.equal(summary.response.status,200,JSON.stringify(summary.payload));assert.ok(summary.payload.transactions>=1);assert.ok(summary.payload.grossAmount>=20);assert.ok(summary.payload.commissionAmount>=.2);

  const rows=await prisma.$queryRaw`SELECT "saleId","requestId","status","amount","commissionRate","commissionAmount","flow" FROM "NetlinkTransaction" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "requestId"=${requestId} LIMIT 2`;
  assert.equal(rows.length,1,"Netlink request must have exactly one ledger row");assert.equal(rows[0].saleId,saleId);assert.equal(rows[0].status,"COMPLETED");assert.equal(Number(rows[0].amount),20);assert.equal(Number(rows[0].commissionRate),.01);assert.equal(Number(rows[0].commissionAmount),.2);assert.equal(rows[0].flow,"TEST_PREPARE_EXECUTE");

  const sales=await prisma.$queryRaw`SELECT COUNT(*)::int AS count,COALESCE(SUM("total"),0) AS total FROM "Sale" WHERE "id"=${saleId}`;
  assert.equal(Number(sales[0].count),1,"Netlink must not create a second Sale");assert.equal(Number(sales[0].total),20);
  console.log("E2E Netlink TEST MODE passed",{saleId,requestId,gross:20,commission:.2,pin:executed.payload.result.data.pin});
}

try{await main()}finally{await prisma.$disconnect()}
