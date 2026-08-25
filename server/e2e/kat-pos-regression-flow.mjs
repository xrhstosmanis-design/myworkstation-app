import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-kat-pos-regression-owner";
const operatorPin="6482";

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
  username:"e2e.kat.regression",fullName:"E2E KAT Regression",stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,permissions,
  backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:null,cashLimit:null,notes:"KAT P0 POS regression",
  retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
});

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI KAT P0"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;assert.ok(ownerToken);

  const product=await request("/api/commerce/products",{method:"POST",token:ownerToken,body:{
    name:"KAT P0 Regression Product",sku:`KAT-P0-${Date.now()}`,unit:"PIECE",vatRate:24,salePrice:2.5,costPrice:1,trackStock:true,barcodes:[],storeId,openingStock:20
  }});
  assert.equal(product.response.status,201,JSON.stringify(product.payload));
  const productId=product.payload.id;

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:"e2e.kat.regression",fullName:"E2E KAT Regression",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:profileBody({cash:true,cards:true,returnItems:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true})});
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));

  const login=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;assert.ok(token);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token,body:{shiftLabel:"KAT P0 regression",drawer:50,custody:0,coins:0,safe:0,note:"automated KAT regression"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const cashSale=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token,body:{items:[{productId,quantity:2}],paymentMethod:"CASH",clientTransactionId:crypto.randomUUID()}});
  assert.equal(cashSale.response.status,201,JSON.stringify(cashSale.payload));
  const cashSaleId=cashSale.payload.id||cashSale.payload.saleId;assert.ok(cashSaleId);

  let stock=(await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${productId} LIMIT 1`)[0];
  assert.equal(Number(stock?.currentStock),18,"Cash sale did not reduce stock");

  const cardSale=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token,body:{items:[{productId,quantity:1}],paymentMethod:"CARD",clientTransactionId:crypto.randomUUID()}});
  assert.equal(cardSale.response.status,201,JSON.stringify(cardSale.payload));
  const cardSaleId=cardSale.payload.id||cardSale.payload.saleId;assert.ok(cardSaleId);

  stock=(await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${productId} LIMIT 1`)[0];
  assert.equal(Number(stock?.currentStock),17,"Card sale did not reduce stock");

  const cancelled=await request(`/api/store-pos/stores/${storeId}/sales/${cashSaleId}/reverse`,{method:"POST",token,body:{kind:"CANCEL",reason:"KAT P0 automated cancellation"}});
  assert.equal(cancelled.response.status,200,JSON.stringify(cancelled.payload));

  stock=(await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${productId} LIMIT 1`)[0];
  assert.equal(Number(stock?.currentStock),19,"Cancellation did not restore stock");

  const ledger=await request(`/api/transactions/stores/${storeId}/overview`,{token});
  assert.equal(ledger.response.status,200,JSON.stringify(ledger.payload));
  assert.equal(Number(ledger.payload.summary?.cashSales||0),0,"Cancelled cash sale still affects shift cash total");
  assert.equal(Number(ledger.payload.summary?.cardSales||0),2.5,"Active card sale missing from shift total");

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:999,cardSales:999,eftposTotal:2.5,expenses:999,drawer:50,custody:0,coins:0,safe:0,note:"KAT P0 regression close"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(Number(closed.payload.cashSales),0);
  assert.equal(Number(closed.payload.cardSales),2.5);
  assert.equal(Number(closed.payload.eftposTotal),2.5);
  assert.equal(Number(closed.payload.variance),0);

  console.log("KAT P0 POS regression passed",{sessionId,cashSaleId,cardSaleId,stockAfterCancel:19,cashSales:0,cardSales:2.5});
}

try{await main()}finally{await prisma.$disconnect()}
