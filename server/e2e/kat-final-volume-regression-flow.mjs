import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-kat-final-volume-owner";
const operatorPin="7319";

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${baseUrl}${path}`,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  let payload=null;try{payload=await response.json()}catch{}
  return {response,payload};
}

const profileBody={
  username:"e2e.kat.final.volume",fullName:"E2E KAT Final Volume",stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,
  permissions:{cash:true,cards:true,returnItems:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true},
  backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:null,cashLimit:null,notes:"KAT final volume regression",
  retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
};

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI KAT final volume"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;assert.ok(ownerToken);

  const product=await request("/api/commerce/products",{method:"POST",token:ownerToken,body:{name:"KAT Final Volume Product",sku:`KAT-VOLUME-${Date.now()}`,unit:"PIECE",vatRate:24,salePrice:2.5,costPrice:1,trackStock:true,barcodes:[],storeId,openingStock:30}});
  assert.equal(product.response.status,201,JSON.stringify(product.payload));
  const productId=product.payload.id;

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:"e2e.kat.final.volume",fullName:"E2E KAT Final Volume",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:profileBody});
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));
  const login=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;assert.ok(token);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token,body:{shiftLabel:"KAT final 12-sale regression",drawer:50,custody:0,coins:0,safe:0,note:"automated final KAT rehearsal"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id,sales=[];

  for(let index=0;index<12;index++){
    const paymentMethod=index%2===0?"CASH":"CARD";
    const sale=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token,body:{items:[{productId,quantity:1}],paymentMethod,clientTransactionId:crypto.randomUUID(),confirmDuplicate:index>0}});
    assert.equal(sale.response.status,201,`Sale ${index+1}: ${JSON.stringify(sale.payload)}`);
    sales.push({id:sale.payload.id||sale.payload.saleId,paymentMethod});
  }
  assert.equal(sales.length,12);

  for(const sale of [sales[0],sales[1]]){
    const cancelled=await request(`/api/store-pos/stores/${storeId}/sales/${sale.id}/reverse`,{method:"POST",token,body:{kind:"CANCEL",reason:`KAT final ${sale.paymentMethod} cancellation`}});
    assert.equal(cancelled.response.status,201,JSON.stringify(cancelled.payload));
  }

  const stock=(await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${productId} LIMIT 1`)[0];
  assert.equal(Number(stock?.currentStock),20,"Twelve sales and two cancellations produced wrong stock");
  const ledger=await request(`/api/transactions/stores/${storeId}/overview`,{token});
  assert.equal(ledger.response.status,200,JSON.stringify(ledger.payload));
  assert.equal(Number(ledger.payload.summary?.cashSales),12.5);
  assert.equal(Number(ledger.payload.summary?.cardSales),12.5);

  const today=new Date().toISOString().slice(0,10);
  const audit=await request(`/api/reports/audit-events?from=${today}&to=${today}&storeId=${storeId}`,{token:ownerToken});
  assert.equal(audit.response.status,200,JSON.stringify(audit.payload));
  const cancellations=(audit.payload?.items||[]).filter(row=>(row.eventType==="POS_CANCEL"||/^POS\s+ΑΚΥΡΩΣΗ\b/i.test(String(row.description||"")))&&Number(row.amount)<0);
  assert.ok(cancellations.length>=2,"Final volume cancellations are missing from central Audit");

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:999,cardSales:999,eftposTotal:12.5,expenses:999,drawer:62.5,custody:0,coins:0,safe:0,note:"KAT final volume close"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(Number(closed.payload.cashSales),12.5);
  assert.equal(Number(closed.payload.cardSales),12.5);
  assert.equal(Number(closed.payload.cardVariance),0);
  assert.equal(Number(closed.payload.variance),0);

  console.log("KAT final 12-sale volume regression passed",{sessionId,sales:12,cancellations:2,stock:20,cashSales:12.5,cardSales:12.5});
}

try{await main()}finally{await prisma.$disconnect()}
