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
const operatorPin="7391";

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
  username:"e2e.pos.cashier",fullName:"E2E POS Cashier",stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,permissions,
  backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:null,cashLimit:null,notes:"E2E POS to shift",
  retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
});

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI POS E2E"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;
  assert.ok(ownerToken);

  const product=await request("/api/commerce/products",{
    method:"POST",token:ownerToken,
    body:{name:"E2E POS Product",sku:`E2E-POS-${Date.now()}`,unit:"PIECE",vatRate:24,salePrice:3,costPrice:1,trackStock:true,barcodes:[],storeId,openingStock:10}
  });
  assert.equal(product.response.status,201,JSON.stringify(product.payload));
  const productId=product.payload.id;
  assert.ok(productId);

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{
    method:"POST",token:ownerToken,
    body:{username:"e2e.pos.cashier",fullName:"E2E POS Cashier",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}
  });
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;

  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{
    method:"PATCH",token:ownerToken,body:profileBody({cash:true,cards:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:true})
  });
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));

  const operatorLogin=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(operatorLogin.response.status,200,JSON.stringify(operatorLogin.payload));
  const operatorToken=operatorLogin.payload?.token;
  const operatorId=operatorLogin.payload?.user?.id;
  assert.ok(operatorToken);
  assert.ok(operatorId);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{
    method:"POST",token:operatorToken,
    body:{shiftLabel:"E2E πραγματικό POS",drawer:50,custody:0,coins:0,safe:0,note:"POS-to-shift E2E"}
  });
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const quote=await request(`/api/store-pos/stores/${storeId}/quote`,{
    method:"POST",token:operatorToken,body:{items:[{productId,quantity:2}]}
  });
  assert.equal(quote.response.status,200,JSON.stringify(quote.payload));
  assert.equal(quote.payload.total,6);

  const noReason=await request(`/api/store-pos/stores/${storeId}/checkout`,{
    method:"POST",token:operatorToken,
    body:{items:[{productId,quantity:2,unitPriceOverride:2.5}],paymentMethod:"MIXED",payments:[{method:"CASH",amount:2},{method:"CARD",amount:3}],clientTransactionId:crypto.randomUUID()}
  });
  assert.equal(noReason.response.status,400,"manual price without reason must be rejected");

  const checkout=await request(`/api/store-pos/stores/${storeId}/checkout`,{
    method:"POST",token:operatorToken,
    body:{items:[{productId,quantity:2,unitPriceOverride:2.5,overrideReason:"E2E ελεγμένη αλλαγή τιμής"}],paymentMethod:"MIXED",payments:[{method:"CASH",amount:2},{method:"CARD",amount:3}],clientTransactionId:crypto.randomUUID()}
  });
  assert.equal(checkout.response.status,201,JSON.stringify(checkout.payload));
  assert.equal(checkout.payload.total,5);
  const saleId=checkout.payload.id||checkout.payload.saleId;
  assert.ok(saleId,"POS checkout did not return sale id");

  const stockRows=await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${productId} LIMIT 1`;
  assert.equal(Number(stockRows[0]?.currentStock),8,"POS checkout did not reduce tracked stock by sold quantity");

  const saleLineRows=await prisma.$queryRaw`SELECT "unitPrice","lineTotal" FROM "SaleLine" WHERE "saleId"=${saleId} LIMIT 1`;
  assert.equal(Number(saleLineRows[0]?.unitPrice),2.5);
  assert.equal(Number(saleLineRows[0]?.lineTotal),5);

  const ledger=await request(`/api/transactions/stores/${storeId}/overview`,{token:operatorToken});
  assert.equal(ledger.response.status,200,JSON.stringify(ledger.payload));
  assert.equal(ledger.payload.openSession?.id,sessionId);
  assert.equal(ledger.payload.summary?.cashSales,2);
  assert.equal(ledger.payload.summary?.cardSales,3);
  assert.ok((ledger.payload.recent||[]).some(item=>item.type==="SALE_CASH"&&item.amount===2));
  assert.ok((ledger.payload.recent||[]).some(item=>item.type==="SALE_CARD"&&item.amount===3));

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{
    method:"POST",token:operatorToken,
    body:{cashSales:999,cardSales:999,eftposTotal:3,expenses:999,drawer:52,custody:0,coins:0,safe:0,note:"POS mixed sale physical count"}
  });
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.cashSales,2);
  assert.equal(closed.payload.cardSales,3);
  assert.equal(closed.payload.eftposTotal,3);
  assert.equal(closed.payload.cardVariance,0);
  assert.equal(closed.payload.expectedOperational,52);
  assert.equal(closed.payload.actualOperational,52);
  assert.equal(closed.payload.variance,0);

  const detail=await request(`/api/owner-shifts/${sessionId}/detail`,{token:ownerToken});
  assert.equal(detail.response.status,200,JSON.stringify(detail.payload));
  assert.equal(detail.payload.shift?.cashSales,2);
  assert.equal(detail.payload.shift?.cardSales,3);
  assert.equal(detail.payload.shift?.eftposTotal,3);
  assert.equal(detail.payload.shift?.variance,0);
  assert.equal(detail.payload.sales?.count,1);
  assert.equal(detail.payload.sales?.total,5);
  const methods=new Map((detail.payload.paymentMethods||[]).map(item=>[item.method,item.amount]));
  assert.equal(methods.get("CASH"),2);
  assert.equal(methods.get("CARD"),3);
  assert.ok((detail.payload.transactions||[]).some(item=>item.type==="SALE_CASH"&&item.actorName==="E2E POS Cashier"));
  assert.ok((detail.payload.transactions||[]).some(item=>item.type==="SALE_CARD"&&item.actorName==="E2E POS Cashier"));

  const auditRows=await prisma.$queryRaw`
    SELECT "operatorId","actorId","eventType","details","createdAt"
    FROM "StoreOperatorAudit"
    WHERE "companyId"=${companyId} AND "storeId"=${storeId}
    ORDER BY "createdAt" DESC LIMIT 30
  `;
  const saleAudit=auditRows.find(row=>row.eventType==="POS_SALE_COMPLETED");
  assert.ok(saleAudit,`POS sale audit missing. Recent StoreOperatorAudit rows: ${JSON.stringify(auditRows)}`);
  assert.equal(saleAudit.operatorId,operatorId,"POS sale audit operatorId does not match the authenticated Store Operator");
  assert.equal(saleAudit.actorId,operatorId,"POS sale audit actorId does not match the authenticated Store Operator");
  assert.equal(saleAudit.details?.sessionId,sessionId,`POS sale audit points to wrong shift. Audit: ${JSON.stringify(saleAudit)}`);
  assert.equal(Number(saleAudit.details?.total),5);
  assert.equal(saleAudit.details?.items?.[0]?.priceSource,"MANUAL");
  assert.equal(saleAudit.details?.items?.[0]?.overrideReason,"E2E ελεγμένη αλλαγή τιμής");

  console.log("E2E real POS -> shift -> BackOffice flow passed",{sessionId,saleId,operatorId,stockAfter:8,cash:2,card:3,manualPrice:2.5});
}

try{await main()}finally{await prisma.$disconnect()}
