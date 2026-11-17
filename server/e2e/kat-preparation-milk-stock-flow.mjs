import {operatorSessionFixture} from "./helpers/operator-session-fixture.mjs";
const operatorSessions=operatorSessionFixture();
import {withShiftCloseCardFixture} from "./helpers/shift-close-card-fixture.mjs";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-kat-preparation-owner";
const operatorPin="5937";

async function request(path,{method="GET",token,body}={}){
  body=await withShiftCloseCardFixture(prisma,baseUrl,path,token,body);
  const response=await fetch(`${baseUrl}${path}`,{
    method,
    headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  let payload=null;try{payload=await response.json()}catch{}
  operatorSessions.remember(path,response,payload);
  return {response,payload};
}

const profileBody=permissions=>({
  username:"e2e.kat.milk",fullName:"E2E KAT Milk",stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,permissions,
  backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:null,cashLimit:null,notes:"KAT P0 preparation milk",
  retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
});

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI KAT Milk"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;assert.ok(ownerToken);

  const drink=(await prisma.$queryRaw`SELECT p."id",p."name",p."salePrice",COALESCE(sp."salePrice",p."salePrice") AS "storePrice" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=TRUE WHERE p."companyId"=${companyId} AND p."sku"='MWS-KAT-BEV-FREDDO-CAP' AND p."active"=TRUE LIMIT 1`)[0];
  assert.ok(drink,"Seeded FREDDO CAPPUCCINO product missing");
  const milk=(await prisma.$queryRaw`SELECT "id","trackStock" FROM "Product" WHERE "companyId"=${companyId} AND "sku"='MWS-PREP-MILK' AND "active"=TRUE LIMIT 1`)[0];
  assert.ok(milk,"Fresh milk ingredient missing");
  await prisma.$executeRaw`UPDATE "Product" SET "trackStock"=TRUE,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${milk.id}`;
  await prisma.$executeRaw`
    INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock","active")
    VALUES (${crypto.randomUUID()},${storeId},${milk.id},1000,TRUE)
    ON CONFLICT ("storeId","productId") DO UPDATE SET "currentStock"=1000,"active"=TRUE,"updatedAt"=CURRENT_TIMESTAMP
  `;

  const freshMilk=(await prisma.$queryRaw`
    SELECT m."id",m."description" FROM "ManagementModifier" m
    JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId"
    WHERE m."companyId"=${companyId} AND m."active"=TRUE AND g."active"=TRUE
      AND UPPER(TRIM(g."description"))='ΓΑΛΑ' AND UPPER(TRIM(m."description"))='ΦΡΕΣΚΟ ΓΑΛΑ'
    LIMIT 1`)[0];
  assert.ok(freshMilk,"Fresh milk modifier missing");

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:"e2e.kat.milk",fullName:"E2E KAT Milk",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:profileBody({cash:true,cards:true,initialCash:true,closeShift:true,changeRetail:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true})});
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));

  const login=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;assert.ok(token);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token,body:{shiftLabel:"KAT Milk P0",drawer:50,custody:0,coins:0,safe:0,note:"milk modifier e2e"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const modifiers=await request(`/api/store-pos/stores/${storeId}/modifiers?productId=${encodeURIComponent(drink.id)}`,{token});
  assert.equal(modifiers.response.status,200,JSON.stringify(modifiers.payload));
  const milkGroup=(modifiers.payload?.groups||[]).find(g=>String(g.description||"").toUpperCase()==="ΓΑΛΑ");
  assert.ok(milkGroup,"Milk modifier group not available for FREDDO CAPPUCCINO");
  assert.ok((milkGroup.items||[]).some(item=>item.id===freshMilk.id),"Fresh milk choice not available for FREDDO CAPPUCCINO");

  const preparation=await request(`/api/store-pos/stores/${storeId}/preparation`,{method:"POST",token,body:{
    items:[{productId:drink.id,quantity:1,modifiers:[{id:freshMilk.id,description:freshMilk.description,price:0}]}],
    note:"KAT P0 fresh milk stock test",priority:"NORMAL",productionStation:"ΠΑΡΑΓΩΓΗ"
  }});
  assert.equal(preparation.response.status,201,JSON.stringify(preparation.payload));
  const responseBatchId=preparation.payload?.batchId||preparation.payload?.id||null;
  const storedBatch=(await prisma.$queryRaw`SELECT "id" FROM "StorePreparationBatch" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='SENT' AND (${responseBatchId}::text IS NULL OR "id"=${responseBatchId}) ORDER BY "createdAt" DESC LIMIT 1`)[0]
    ||(await prisma.$queryRaw`SELECT "id" FROM "StorePreparationBatch" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='SENT' ORDER BY "createdAt" DESC LIMIT 1`)[0];
  const batchId=storedBatch?.id;assert.ok(batchId,"Preparation response was not backed by a StorePreparationBatch");

  const unitPrice=Number(drink.storePrice||drink.salePrice||0);
  assert.ok(unitPrice>0,"FREDDO CAPPUCCINO has no sale price");
  const checkout=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token,body:{
    items:[{productId:drink.id,quantity:1,unitPriceOverride:unitPrice,overrideReason:`PREPARATION:${batchId}`}],
    paymentMethod:"CASH",clientTransactionId:crypto.randomUUID()
  }});
  assert.equal(checkout.response.status,201,JSON.stringify(checkout.payload));
  const saleId=checkout.payload.id||checkout.payload.saleId;assert.ok(saleId);

  const after=(await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${milk.id} LIMIT 1`)[0];
  assert.equal(Number(after?.currentStock),930,"Fresh milk selection must consume exactly 70ml for one FREDDO CAPPUCCINO");

  const consumption=await prisma.$queryRaw`SELECT "quantity","unit","kind","modifierId" FROM "PreparationStockConsumption" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "saleId"=${saleId} AND "ingredientProductId"=${milk.id} ORDER BY "createdAt"`;
  assert.equal(consumption.length,1,"Fresh milk must have exactly one stock-consumption record");
  assert.equal(Number(consumption[0].quantity),70);
  assert.equal(consumption[0].unit,"ML");
  assert.equal(consumption[0].kind,"MODIFIER_MILK");
  assert.equal(consumption[0].modifierId,freshMilk.id);

  const batch=(await prisma.$queryRaw`SELECT "status","saleId" FROM "StorePreparationBatch" WHERE "id"=${batchId} LIMIT 1`)[0];
  assert.equal(batch?.status,"CONSUMED");
  assert.equal(batch?.saleId,saleId);


  let tableCashTotal=0;
  if(process.env.TABLE_PARTIAL_PAYMENT_LAB_STORE_ID===storeId){
    assert.equal(new URL(baseUrl).hostname,"127.0.0.1");
    assert.equal(new URL(process.env.DATABASE_URL).pathname,"/myworkstation_test");
    const prefix=`/api/store-pos/stores/${storeId}`;
    const call=async (path,status,options={})=>{
      const result=await request(prefix+path,{token,...options});
      assert.equal(result.response.status,status,JSON.stringify(result.payload));
      return result.payload;
    };
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey:"TABLE_SERVICE"}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey:"TABLE_SERVICE",active:true}});
    const read=await request(prefix+"/table-service",{token:ownerToken});
    assert.ok([200,403].includes(read.response.status));
    await prisma.$executeRaw`INSERT INTO "StoreTableServiceConfig" ("companyId","storeId","enabled") VALUES (${companyId},${storeId},TRUE) ON CONFLICT ("storeId") DO UPDATE SET "enabled"=TRUE`;
    const previousPrice=(await prisma.$queryRaw`SELECT "price" FROM "ManagementModifier" WHERE "id"=${freshMilk.id}`)[0].price;
    try{
      await prisma.$executeRaw`UPDATE "ManagementModifier" SET "price"=0.50 WHERE "id"=${freshMilk.id}`;
      const target=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:"e2e.kat.table.waiter",fullName:"E2E Table Waiter",email:"",phone:"",role:"EMPLOYEE",active:true,pin:"5938"}});
      assert.equal(target.response.status,201,JSON.stringify(target.payload));
      const table=await call("/tables",201,{method:"POST",token:ownerToken,body:{name:"CI TABLE SERVICE "+crypto.randomUUID().slice(0,8)}});
      const sent=await call("/table-orders",201,{method:"POST",body:{tableId:table.id,idempotencyKey:crypto.randomUUID(),items:[{productId:drink.id,quantity:1,modifiers:[{id:freshMilk.id,price:0.5}]}]}});
      tableCashTotal=Number((unitPrice+0.5).toFixed(2));
      assert.equal(sent.total,tableCashTotal);
      const loadOrder=async ()=>(await call("/table-service",200)).orders.find(order=>order.id===sent.id);
      const stored=await loadOrder();
      assert.equal(stored.items[0].salePrice,tableCashTotal);
      assert.equal(stored.partialCashEnabled,true);
      const queue=await call("/table-service/preparation-queue",200);
      const ticket=queue.rows.find(row=>row.tableOrderId===sent.id);
      assert.ok(ticket,"Prepared table round must appear in KDS");
      assert.equal(ticket.items[0].tableLineId,stored.items[0].id);
      assert.equal(ticket.items[0].modifiers[0].price,0.5);
      await call(`/table-service/preparation-queue/${ticket.id}/ready`,200,{method:"PATCH"});
      assert.equal((await loadOrder()).status,"READY");
      const candidates=await call("/table-service/waiters",200,{token:ownerToken});
      const waiter=candidates.operators.find(row=>row.displayName==="E2E Table Waiter");
      assert.ok(waiter);
      const assignment={operatorId:waiter.id,expectedOperatorId:stored.operatorId};
      await call(`/table-orders/${sent.id}/waiter`,403,{method:"PATCH",body:assignment});
      await call(`/table-orders/${sent.id}/waiter`,200,{method:"PATCH",token:ownerToken,body:assignment});
      assert.equal((await loadOrder()).operatorId,waiter.id);
      const cashRows=async ()=>(await prisma.$queryRaw`SELECT "amount" FROM "StoreTransaction" WHERE "sessionId"=${sessionId} AND "type"='SALE_CASH'`).map(row=>Math.round(Number(row.amount)*100));
      const before=await cashRows();
      const cash={tableOrderId:sent.id,paymentMethod:"CASH",items:[{productId:drink.id,quantity:1,tableLineId:stored.items[0].id}]};
      const partial={...cash,clientTransactionId:crypto.randomUUID(),tableCashAmountCents:100};
      const balanceCents=Math.round(tableCashTotal*100)-100;
      const first=await call("/checkout",200,{method:"POST",body:partial});
      assert.equal(first.balanceCents,balanceCents);
      assert.equal((await call("/checkout",200,{method:"POST",body:partial})).replay,true);
      assert.equal((await loadOrder()).tablePaidCents,100);
      assert.deepEqual((await cashRows()).sort(),[...before,100].sort());
      const final={...cash,clientTransactionId:crypto.randomUUID(),tableCashBalanceCents:balanceCents};
      const paid=await call("/checkout",201,{method:"POST",body:final});
      assert.equal(paid.total,tableCashTotal);
      assert.equal(paid.fiscalStatus,"NON_FISCAL");
      assert.equal((await call("/checkout",200,{method:"POST",body:final})).saleId,paid.saleId);
      assert.equal(await loadOrder(),undefined);
      assert.deepEqual((await cashRows()).sort(),[...before,100,balanceCents].sort());
      const [closedTable]=await prisma.$queryRaw`SELECT "status","saleId" FROM "TableOrder" WHERE "id"=${sent.id}`;
      assert.deepEqual(closedTable,{status:"PAID",saleId:paid.saleId});
      console.log("Combined table E2E passed: priced modifier, KDS, reassignment, cash installments and replay");
    }finally{
      await prisma.$executeRaw`UPDATE "ManagementModifier" SET "price"=${previousPrice} WHERE "id"=${freshMilk.id}`;
    }
  }

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:999,cardSales:999,eftposTotal:0,expenses:999,drawer:50+unitPrice+tableCashTotal,custody:0,coins:0,safe:0,note:"KAT milk e2e close"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(Number(closed.payload.variance),0);

  console.log("KAT P0 preparation milk stock flow passed",{saleId,batchId,milkBefore:1000,milkAfter:930,consumedMl:70});
}

try{await main()}finally{await operatorSessions.logout(typeof baseUrl==="undefined"?base:baseUrl);await prisma.$disconnect()}
