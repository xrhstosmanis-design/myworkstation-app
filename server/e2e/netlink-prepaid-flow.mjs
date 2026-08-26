import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-netlink-owner-password";
const operatorPin="8462";

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${baseUrl}${path}`,{
    method,
    headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  let payload=null;try{payload=await response.json()}catch{}
  return {response,payload};
}

const profileBody=permissions=>({
  username:"e2e.netlink",fullName:"E2E Netlink Operator",stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,permissions,
  backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:null,cashLimit:null,notes:"Netlink mock-provider E2E",
  retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
});

async function createServiceProduct(token,name,sku,salePrice){
  const result=await request("/api/commerce/products",{method:"POST",token,body:{
    name,sku,unit:"PIECE",vatRate:24,salePrice,costPrice:0,trackStock:false,barcodes:[],storeId,openingStock:0
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.payload));
  assert.ok(result.payload?.id);
  return result.payload.id;
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey:"NETLINK_PREPAID"}},update:{active:false,startsAt:null,endsAt:null},create:{companyId,moduleKey:"NETLINK_PREPAID",active:false}});
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const unauthenticated=await request("/api/netlink/status");
  assert.equal(unauthenticated.response.status,401,"Netlink status must require authentication");

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI Netlink E2E"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;assert.ok(ownerToken);

  const disabled=await request("/api/netlink/status",{token:ownerToken});
  assert.equal(disabled.response.status,403,"Netlink must remain inaccessible without its licensed company module");
  await prisma.companyModule.update({where:{companyId_moduleKey:{companyId,moduleKey:"NETLINK_PREPAID"}},data:{active:true,startsAt:null,endsAt:null}});

  const status=await request("/api/netlink/status",{token:ownerToken});
  assert.equal(status.response.status,200,JSON.stringify(status.payload));
  assert.deepEqual({configured:status.payload.configured,provider:status.payload.provider,executeEnabled:status.payload.executeEnabled,testMode:status.payload.testMode},{configured:true,provider:"MOCK",executeEnabled:true,testMode:true});

  const menu=await request("/api/netlink/menu",{token:ownerToken});
  assert.equal(menu.response.status,200,JSON.stringify(menu.payload));
  assert.ok((menu.payload?.groups||[]).flatMap(group=>group.products||[]).some(product=>product.id==="MOCK-20"));

  const suffix=Date.now();
  const saleProductId=await createServiceProduct(ownerToken,"E2E Netlink Card Value",`E2E-NETLINK-VALUE-${suffix}`,20);
  const feeProductId=await createServiceProduct(ownerToken,"E2E Netlink Service Fee",`E2E-NETLINK-FEE-${suffix}`,0.5);
  const configured=await request(`/api/netlink/stores/${storeId}/config`,{method:"PUT",token:ownerToken,body:{saleProductId,serviceFeeProductId:feeProductId,serviceFeeAmount:0.5,active:true,notes:"CI mock only"}});
  assert.equal(configured.response.status,200,JSON.stringify(configured.payload));
  assert.equal(configured.payload.configured,true);

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:"e2e.netlink",fullName:"E2E Netlink Operator",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:profileBody({cash:true,cards:true,initialCash:true,closeShift:true,changeRetail:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true})});
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));

  const operatorLogin=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(operatorLogin.response.status,200,JSON.stringify(operatorLogin.payload));
  const operatorToken=operatorLogin.payload?.token;assert.ok(operatorToken);
  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token:operatorToken,body:{shiftLabel:"Netlink TEST MODE",drawer:50,custody:0,coins:0,safe:0,note:"mock-provider only"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const checkout=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token:operatorToken,body:{
    items:[{productId:saleProductId,quantity:1},{productId:feeProductId,quantity:1}],paymentMethod:"CASH",clientTransactionId:crypto.randomUUID()
  }});
  assert.equal(checkout.response.status,201,JSON.stringify(checkout.payload));
  assert.equal(checkout.payload.total,20.5);
  const saleId=checkout.payload.id||checkout.payload.saleId;assert.ok(saleId);

  const requestId=`netlink-e2e-${crypto.randomUUID()}`;
  const prepared=await request("/api/netlink/prepare",{method:"POST",token:operatorToken,body:{storeId,productId:"MOCK-20",payload:{amount:20},requestId}});
  assert.equal(prepared.response.status,200,JSON.stringify(prepared.payload));
  assert.equal(prepared.payload.amount,20);
  const executed=await request("/api/netlink/execute",{method:"POST",token:operatorToken,body:{storeId,productId:"MOCK-20",payload:{amount:20},requestId,paymentMethod:"CASH",saleId,testRun:true}});
  assert.equal(executed.response.status,200,JSON.stringify(executed.payload));
  assert.deepEqual({status:executed.payload.status,cardAmount:executed.payload.cardAmount,serviceFeeAmount:executed.payload.serviceFeeAmount,customerTotal:executed.payload.customerTotal,commissionAmount:executed.payload.commission?.amount},{status:"COMPLETED",cardAmount:20,serviceFeeAmount:0.5,customerTotal:20.5,commissionAmount:0.2});
  assert.match(executed.payload.result?.data?.pin||"",/^TEST-/);

  const duplicate=await request("/api/netlink/execute",{method:"POST",token:operatorToken,body:{storeId,productId:"MOCK-20",payload:{amount:20},requestId,paymentMethod:"CASH",saleId,testRun:true}});
  assert.equal(duplicate.response.status,409,"A completed Netlink request must not execute twice");

  const transactions=await request(`/api/netlink/transactions?storeId=${storeId}`,{token:operatorToken});
  assert.equal(transactions.response.status,200,JSON.stringify(transactions.payload));
  const transaction=(transactions.payload?.items||[]).find(item=>item.requestId===requestId);
  assert.ok(transaction);assert.equal(transaction.status,"COMPLETED");assert.equal(transaction.saleId,saleId);assert.equal(transaction.customerTotal,20.5);
  const persisted=await prisma.$queryRaw`SELECT nt."status",nt."saleId",nt."amount",nt."commissionAmount",s."total",COUNT(sl."id")::int AS "saleLines" FROM "NetlinkTransaction" nt JOIN "Sale" s ON s."id"=nt."saleId" JOIN "SaleLine" sl ON sl."saleId"=s."id" WHERE nt."requestId"=${requestId} GROUP BY nt."status",nt."saleId",nt."amount",nt."commissionAmount",s."total"`;
  assert.equal(persisted.length,1);assert.equal(persisted[0].status,"COMPLETED");assert.equal(Number(persisted[0].amount),20);assert.equal(Number(persisted[0].commissionAmount),0.2);assert.equal(Number(persisted[0].total),20.5);assert.equal(persisted[0].saleLines,2);

  const from=encodeURIComponent(new Date(Date.now()-3600000).toISOString());
  const to=encodeURIComponent(new Date(Date.now()+3600000).toISOString());
  const settlement=await request(`/api/netlink/settlement-summary?storeId=${storeId}&from=${from}&to=${to}`,{token:operatorToken});
  assert.equal(settlement.response.status,200,JSON.stringify(settlement.payload));
  assert.deepEqual({transactions:settlement.payload.transactions,grossAmount:settlement.payload.grossAmount,serviceFees:settlement.payload.serviceFees,customerTotal:settlement.payload.customerTotal,commissionAmount:settlement.payload.commissionAmount},{transactions:1,grossAmount:20,serviceFees:0.5,customerTotal:20.5,commissionAmount:0.2});

  const ledger=await request(`/api/transactions/stores/${storeId}/overview`,{token:operatorToken});
  assert.equal(ledger.response.status,200,JSON.stringify(ledger.payload));
  assert.equal(ledger.payload.summary?.cashSales,20.5,"The linked POS sale must enter turnover exactly once");
  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token:operatorToken,body:{cashSales:999,cardSales:999,eftposTotal:0,expenses:999,drawer:70.5,custody:0,coins:0,safe:0,note:"Netlink mock E2E close"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.cashSales,20.5);assert.equal(closed.payload.variance,0);

  console.log("Netlink prepaid auth/licensing/POS/settlement E2E passed",{saleId,requestId,transactionId:executed.payload.transactionLedgerId,customerTotal:20.5,commissionAmount:0.2});
}

try{await main()}finally{await prisma.$disconnect()}
