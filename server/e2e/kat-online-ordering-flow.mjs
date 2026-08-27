import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-kat-online-owner";
const operatorPin="6843";

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${baseUrl}${path}`,{
    method,
    headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  let payload=null;try{payload=await response.json()}catch{}
  return {response,payload};
}

const operatorProfile=permissions=>({
  username:"e2e.kat.online",fullName:"E2E KAT Online",stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,permissions,
  backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:"POS2",cashLimit:null,notes:"KAT P0 online ordering",
  retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
});

async function setStatus(token,orderId,status){
  const result=await request(`/api/public/kat/pos/stores/${storeId}/orders/${orderId}/status`,{method:"POST",token,body:{status,note:`E2E ${status}`}});
  assert.equal(result.response.status,200,`${status}: ${JSON.stringify(result.payload)}`);
  assert.equal(result.payload?.order?.status,status);
  return result.payload;
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY","ONLINE_ORDERING"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI KAT Online"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;assert.ok(ownerToken);

  await prisma.$executeRaw`
    INSERT INTO "OnlineOrderingConfig" ("id","companyId","storeId","enabled","surchargeType","surchargeValue","deliveryFee","pickupEnabled","deliveryEnabled","cashEnabled","cardOnDeliveryEnabled","autoPrintOnAccept","stockCheckEnabled","minimumOrderRetail")
    VALUES (${crypto.randomUUID()},${companyId},${storeId},TRUE,'FIXED',0.10,0,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE,0)
    ON CONFLICT ("storeId") DO UPDATE SET "enabled"=TRUE,"surchargeType"='FIXED',"surchargeValue"=0.10,"deliveryFee"=0,"pickupEnabled"=TRUE,"deliveryEnabled"=TRUE,"cashEnabled"=TRUE,"cardOnDeliveryEnabled"=TRUE,"autoPrintOnAccept"=TRUE,"stockCheckEnabled"=TRUE,"minimumOrderRetail"=0,"updatedAt"=CURRENT_TIMESTAMP
  `;

  const product=await request("/api/commerce/products",{method:"POST",token:ownerToken,body:{
    name:"KAT P0 Online Product",sku:`KAT-ONLINE-${Date.now()}`,unit:"PIECE",vatRate:24,salePrice:2.5,costPrice:1,trackStock:true,barcodes:[],storeId,openingStock:10
  }});
  assert.equal(product.response.status,201,JSON.stringify(product.payload));
  const productId=product.payload.id;assert.ok(productId);

  await prisma.$executeRaw`
    INSERT INTO "OnlineProductVisibility" ("id","companyId","storeId","productId","visible")
    VALUES (${crypto.randomUUID()},${companyId},${storeId},${productId},TRUE)
    ON CONFLICT ("storeId","productId") DO UPDATE SET "visible"=TRUE,"updatedAt"=CURRENT_TIMESTAMP
  `;

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:"e2e.kat.online",fullName:"E2E KAT Online",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:operatorProfile({cash:true,cards:true,initialCash:true,closeShift:true,changeRetail:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true})});
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));

  const login=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;assert.ok(token);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token,body:{shiftLabel:"KAT Online P0",drawer:50,custody:0,coins:0,safe:0,note:"online order e2e"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const catalog=await request("/api/public/kat/catalog");
  assert.equal(catalog.response.status,200,JSON.stringify(catalog.payload));
  const onlineProduct=(catalog.payload?.products||[]).find(row=>row.id===productId);
  assert.ok(onlineProduct,"Online-visible product missing from public catalog");
  assert.equal(Number(onlineProduct.storePrice),2.5);
  assert.equal(Number(onlineProduct.onlinePrice),2.6);
  assert.equal(onlineProduct.available,true);

  const idempotencyKey=`kat-e2e-${crypto.randomUUID()}`;
  const order=await request("/api/public/kat/orders",{method:"POST",body:{
    idempotencyKey,fulfillmentType:"PICKUP",paymentMethod:"CASH",customerName:"E2E Πελάτης",customerPhone:"6900000000",items:[{productId,quantity:1}]
  }});
  assert.equal(order.response.status,201,JSON.stringify(order.payload));
  assert.equal(Number(order.payload?.order?.total),2.6);
  const orderId=order.payload?.order?.id;assert.ok(orderId);

  const duplicate=await request("/api/public/kat/orders",{method:"POST",body:{
    idempotencyKey,fulfillmentType:"PICKUP",paymentMethod:"CASH",customerName:"E2E Πελάτης",customerPhone:"6900000000",items:[{productId,quantity:1}]
  }});
  assert.equal(duplicate.response.status,200,JSON.stringify(duplicate.payload));
  assert.equal(duplicate.payload?.duplicate,true);
  assert.equal(duplicate.payload?.order?.id,orderId);

  const posOrders=await request(`/api/public/kat/pos/stores/${storeId}/orders`,{token});
  assert.equal(posOrders.response.status,200,JSON.stringify(posOrders.payload));
  assert.ok((posOrders.payload?.rows||[]).some(row=>row.id===orderId&&row.status==="NEW"));

  const accepted=await setStatus(token,orderId,"ACCEPTED");
  assert.ok(accepted.print,"Accept must return print payload");
  await setStatus(token,orderId,"PREPARING");
  await setStatus(token,orderId,"READY");
  const checkout=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token,body:{
    paymentMethod:"CASH",clientTransactionId:crypto.randomUUID(),onlineOrderId:orderId,
    onlineOrderNumber:order.payload.order.orderNumber,onlineDeliveryFee:0,
    items:[{productId,quantity:1,unitPriceOverride:2.6,overrideReason:`ONLINE:${order.payload.order.orderNumber}`}]
  }});
  assert.equal(checkout.response.status,201,JSON.stringify(checkout.payload));
  const saleId=checkout.payload?.saleId||checkout.payload?.id;assert.ok(saleId,"Online POS checkout did not return a sale id");
  const delivered=await request(`/api/public/kat/pos-handoff/stores/${storeId}/orders/${orderId}/complete-from-pos`,{method:"POST",token,body:{saleId,paymentMethod:"CASH"}});
  assert.equal(delivered.response.status,200,JSON.stringify(delivered.payload));
  assert.equal(delivered.payload?.status,"DELIVERED");

  const stock=(await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${productId} LIMIT 1`)[0];
  assert.equal(Number(stock?.currentStock),9,"Delivered online order did not reduce stock exactly once");

  const stored=(await prisma.$queryRaw`SELECT "status","paymentStatus","saleId","commercialPostedAt" FROM "OnlineOrder" WHERE "id"=${orderId} LIMIT 1`)[0];
  assert.equal(stored?.status,"DELIVERED");
  assert.equal(stored?.paymentStatus,"PAID");
  assert.ok(stored?.saleId);
  assert.ok(stored?.commercialPostedAt);

  const sale=(await prisma.$queryRaw`SELECT "total","status","source","operatorEmployeeId" FROM "Sale" WHERE "id"=${stored.saleId} LIMIT 1`)[0];
  assert.equal(Number(sale?.total),2.6);
  assert.equal(sale?.status,"COMPLETED");
  assert.equal(sale?.source,"ONLINE_POS");
  assert.equal(sale?.operatorEmployeeId,employeeId);

  const ledger=await request(`/api/transactions/stores/${storeId}/overview`,{token});
  assert.equal(ledger.response.status,200,JSON.stringify(ledger.payload));
  assert.equal(Number(ledger.payload.summary?.cashSales||0),2.6);
  assert.ok((ledger.payload.recent||[]).some(row=>row.type==="SALE_CASH"&&Number(row.amount)===2.6&&String(row.description||"").includes(order.payload.order.orderNumber)));

  const events=await prisma.$queryRaw`SELECT "toStatus","note" FROM "OnlineOrderStatusEvent" WHERE "orderId"=${orderId} ORDER BY "createdAt"`;
  assert.ok(events.some(row=>row.toStatus==="NEW"));
  assert.ok(events.some(row=>row.toStatus==="ACCEPTED"));
  assert.ok(events.some(row=>row.toStatus==="PREPARING"));
  assert.ok(events.some(row=>row.toStatus==="READY"));
  assert.ok(events.some(row=>row.toStatus==="DELIVERED"));

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:999,cardSales:999,eftposTotal:0,expenses:999,drawer:52.6,custody:0,coins:0,safe:0,note:"KAT online e2e close"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(Number(closed.payload.cashSales),2.6);
  assert.equal(Number(closed.payload.expectedOperational),52.6);
  assert.equal(Number(closed.payload.actualOperational),52.6);
  assert.equal(Number(closed.payload.variance),0);

  console.log("KAT P0 online ordering flow passed",{orderId,saleId:stored.saleId,stockAfter:9,total:2.6});
}

try{await main()}finally{await prisma.$disconnect()}
