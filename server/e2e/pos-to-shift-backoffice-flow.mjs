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
const ownerPassword="ci-owner-e2e-password";
const operatorPin="7391";

async function request(path,{method="GET",token,body}={}){
  body=await withShiftCloseCardFixture(prisma,baseUrl,path,token,body);
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
    method:"PATCH",token:ownerToken,body:profileBody({cash:true,cards:true,initialCash:true,closeShift:true,centralCashPos:false,changeRetail:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:true})
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

  // Task27: actual authenticated report / SQL cost coverage in isolated CI only.
  const saleTime=(await prisma.$queryRaw`SELECT "occurredAt" FROM "Sale" WHERE "id"=${saleId}`)[0].occurredAt;
  const picturePath=`/api/owner-payments/business-picture?storeId=${storeId}&from=${encodeURIComponent(saleTime.toISOString())}&to=${encodeURIComponent(saleTime.toISOString())}`;
  const snapshot=()=>prisma.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "Sale" WHERE "id"=${saleId}) AS sales,(SELECT COUNT(*)::int FROM "StoreTransaction" WHERE "companyId"=${companyId} AND "storeId"=${storeId}) AS transactions,(SELECT COUNT(*)::int FROM "StockMovement" WHERE "storeId"=${storeId}) AS movements,(SELECT "currentStock" FROM "StoreProduct" WHERE "productId"=${productId} AND "storeId"=${storeId}) AS stock`;
  const beforePicture=await snapshot();
  const known=await request(picturePath,{token:ownerToken});
  assert.equal(known.response.status,200,JSON.stringify(known.payload));
  assert.match(known.response.headers.get("cache-control"),/no-store/);
  assert.equal(known.payload.totals.salesLines,1);
  assert.equal(known.payload.totals.missingCostLines,0);
  assert.equal(known.payload.totals.costValue,2);
  assert.ok(Math.abs(known.payload.totals.grossProfit-(5/1.24-2))<0.001);
  assert.equal((await request(picturePath)).response.status,401);
  assert.equal((await request(picturePath,{token:operatorToken})).response.status,403);
  assert.equal((await request(picturePath.replace(storeId,"task27-foreign-store"),{token:ownerToken})).response.status,404);
  assert.equal((await request(`/api/owner-payments/business-picture?storeId=${storeId}&from=invalid`,{token:ownerToken})).response.status,400);
  const fixtureDoc=`task27-free-${saleId}`;
  try{
    await prisma.$executeRaw`UPDATE "Product" SET "costPrice"=0 WHERE "id"=${productId} AND "companyId"=${companyId}`;
    const missing=await request(picturePath,{token:ownerToken});
    assert.equal(missing.response.status,200,JSON.stringify(missing.payload));
    for(const r of [missing.payload.totals,...missing.payload.monthly,...missing.payload.daily]){
      assert.equal(r.missingCostLines,1);assert.equal(r.costComplete,false);
      assert.equal(r.grossProfit,null);assert.equal(r.netProfit,null);assert.equal(r.margin,null);
    }
    // Explicit approved free acquisition is different from an unknown default 0.
    await prisma.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","status","documentDate") VALUES (${fixtureDoc},${companyId},${storeId},'APPROVED',${new Date(saleTime.getTime()-1)})`;
    await prisma.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","description","unitCost","quantity","unit") VALUES (${fixtureDoc+"-line"},${fixtureDoc},${productId},'Isolated explicit free purchase',0,1,'PIECE')`;
    const free=await request(picturePath,{token:ownerToken});
    assert.equal(free.response.status,200,JSON.stringify(free.payload));
    assert.equal(free.payload.totals.missingCostLines,0);
    assert.equal(free.payload.totals.costComplete,true);
    assert.equal(free.payload.totals.margin,100);
    assert.equal(free.payload.totals.costValue,0);
    assert.deepEqual(await snapshot(),beforePicture,"Report altered sale/payment/stock ledgers");
  }finally{
    await prisma.$executeRaw`DELETE FROM "PurchaseDocument" WHERE "id"=${fixtureDoc} AND "companyId"=${companyId}`;
    await prisma.$executeRaw`UPDATE "Product" SET "costPrice"=1 WHERE "id"=${productId} AND "companyId"=${companyId}`;
  }
  console.log("E2E task27 profitability cost coverage passed",{saleId,knownCost:2,unknownProfit:null,documentedFreeMargin:100});

  // Explicit Greek midnight boundary fixtures, isolated CI database only.
  const periodFixture=`task27-period-${saleId}`;
  const ids=[0,1,2,3].map(i=>`${periodFixture}-${i}`);
  const times=['2030-09-30T20:59:59.999Z','2030-09-30T21:00:00.000Z','2030-10-01T20:59:59.999Z','2030-10-01T21:00:00.000Z'];
  const dayPath=`/api/owner-payments/business-picture?storeId=${storeId}&calendarFrom=2030-10-01&calendarTo=2030-10-01`;
  try{
    for(let i=0;i<ids.length;i++){
      await prisma.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","occurredAt","total") VALUES (${ids[i]},${companyId},${storeId},${new Date(times[i])},${i+1})`;
      await prisma.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","vatRate","lineTotal") VALUES (${ids[i]+"-line"},${ids[i]},${productId},'Isolated Athens boundary',1,0,${i+1})`;
    }
    await prisma.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","status","documentDate","totalNet","totalGross") VALUES (${periodFixture+"-doc"},${companyId},${storeId},'APPROVED',${new Date(times[1])},7,7)`;
    await prisma.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","type","amount","actorId","actorName","occurredAt") VALUES (${periodFixture+"-tx"},${companyId},${storeId},'OTHER_EXPENSE',11,'task27-e2e','Isolated Athens expense',${new Date(times[1])})`;
    await prisma.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","type","amount","actorId","actorName","occurredAt") VALUES (${periodFixture+"-tx-micro"},${companyId},${storeId},'OTHER_EXPENSE',1,'task27-e2e','Isolated final microsecond',${'2030-10-01T20:59:59.9995Z'}::timestamptz)`;
    await prisma.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","type","amount","actorId","actorName","occurredAt") VALUES (${periodFixture+"-tx-outside"},${companyId},${storeId},'OTHER_EXPENSE',100,'task27-e2e','Isolated next midnight excluded',${new Date(times[3])})`;
    const beforeDay=await snapshot();
    const day=await request(dayPath,{token:ownerToken});
    assert.equal(day.response.status,200,JSON.stringify(day.payload));
    assert.equal(day.payload.timeZone,'Europe/Athens');
    assert.equal(day.payload.from,'2030-09-30T21:00:00.000Z');
    assert.equal(day.payload.to,'2030-10-01T20:59:59.999Z');
    assert.equal(day.payload.totals.salesGross,5);
    assert.equal(day.payload.totals.salesLines,2);
    assert.equal(day.payload.totals.purchaseGross,7);
    assert.equal(day.payload.totals.expenseGross,12);
    assert.equal(day.payload.totals.expenses,null);
    assert.equal(day.payload.totals.expenseVat,null);
    assert.equal(day.payload.totals.missingExpenseVatPayments,2);
    assert.equal(day.payload.daily.length,1);
    assert.equal(day.payload.daily[0].day,'2030-10-01');
    assert.equal(day.payload.daily[0].month,'2030-10');
    assert.equal(day.payload.monthly[0].month,'2030-10');
    assert.deepEqual(await snapshot(),beforeDay);
    for(const suffix of ['&calendarFrom=2030-02-30','&from=2030-10-01T00:00Z'])assert.equal((await request(dayPath+suffix,{token:ownerToken})).response.status,400);
    assert.equal((await request(`/api/owner-payments/business-picture?storeId=${storeId}&calendarFrom=2030-10-01`,{token:ownerToken})).response.status,400);
  }finally{
    for(const id of ids)await prisma.$executeRaw`DELETE FROM "Sale" WHERE "id"=${id} AND "companyId"=${companyId}`;
    await prisma.$executeRaw`DELETE FROM "PurchaseDocument" WHERE "id"=${periodFixture+"-doc"} AND "companyId"=${companyId}`;
    await prisma.$executeRaw`DELETE FROM "StoreTransaction" WHERE "id" IN (${periodFixture+"-tx"},${periodFixture+"-tx-micro"},${periodFixture+"-tx-outside"}) AND "companyId"=${companyId}`;
  }
  console.log('E2E task27 Athens calendar periods passed',{start:'2030-09-30T21Z',sales:5,purchases:7,expenses:12});

  // Original-date cost anchoring for returns/cancellations, isolated CI only.
  const reverseFixture=`task27-reverse-${saleId}`;
  const reverseIds=['original-return','original-cancel','return','cancel','orphan'].map(x=>`${reverseFixture}-${x}`);
  const reverseDocs=['old','new'].map(x=>`${reverseFixture}-${x}`);
  const reversePath=(a,b=a)=>`/api/owner-payments/business-picture?storeId=${storeId}&calendarFrom=${a}&calendarTo=${b}`;
  try{
    for(const [index,date,cost] of [[0,'2031-02-28T12:00:00Z',2],[1,'2031-03-02T12:00:00Z',9]]){
      await prisma.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","status","documentDate") VALUES (${reverseDocs[index]},${companyId},${storeId},'APPROVED',${new Date(date)})`;
      await prisma.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","description","unitCost","quantity","unit") VALUES (${reverseDocs[index]+"-line"},${reverseDocs[index]},${productId},'Isolated dated cost',${cost},1,'PIECE')`;
    }
    for(let index=0;index<reverseIds.length;index++){
      const reversed=index>=2,total=index===0||index===2?20:10;
      const kind=index===3?'CANCEL':reversed?'RETURN':null;
      const original=index===2?reverseIds[0]:index===3?reverseIds[1]:index===4?'missing-original':null;
      const date=index<2?'2031-03-01T12:00:00Z':index<4?'2031-03-03T12:00:00Z':'2031-03-04T12:00:00Z';
      await prisma.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","occurredAt","total","source","originalSaleId","reversalKind") VALUES (${reverseIds[index]},${companyId},${storeId},${new Date(date)},${reversed?-total:total},${reversed?'POS_REVERSAL':'POS'},${original},${kind})`;
      for(let line=0;line<total/10;line++)await prisma.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","vatRate","lineTotal") VALUES (${reverseIds[index]+"-line-"+line},${reverseIds[index]},${productId},'Isolated reversal line',${reversed?-1:1},0,${reversed?-10:10})`;
    }
    const beforeReversalRead=await snapshot();
    const reversed=await request(reversePath('2031-03-03'),{token:ownerToken});
    assert.equal(reversed.response.status,200,JSON.stringify(reversed.payload));
    const r=reversed.payload.totals;
    assert.equal(r.returnTransactions,1,'Multi-line return must count once');
    assert.equal(r.cancelTransactions,1);
    assert.equal(r.salesGross,-30);assert.equal(r.salesNet,-30);
    assert.equal(r.costValue,-6,'Reversals must restore original-date cost2, not later cost9');
    assert.equal(r.missingCostLines,0);assert.equal(r.grossProfit,-24);
    for(const row of [...reversed.payload.daily,...reversed.payload.monthly]){assert.equal(row.returnTransactions,1);assert.equal(row.cancelTransactions,1);assert.equal(row.costValue,-6);}
    const combined=await request(reversePath('2031-03-01','2031-03-03'),{token:ownerToken});
    assert.equal(combined.payload.totals.salesGross,0);assert.equal(combined.payload.totals.costValue,0);assert.equal(combined.payload.totals.grossProfit,0);
    const orphan=await request(reversePath('2031-03-04'),{token:ownerToken});
    assert.equal(orphan.payload.totals.returnTransactions,1);assert.equal(orphan.payload.totals.missingCostLines,1);
    for(const row of [orphan.payload.totals,...orphan.payload.monthly,...orphan.payload.daily]){assert.equal(row.grossProfit,null);assert.equal(row.netProfit,null);assert.equal(row.margin,null);}
    assert.deepEqual(await snapshot(),beforeReversalRead,'Reversal report reads must not change ledgers');
  }finally{
    for(const id of reverseIds)await prisma.$executeRaw`DELETE FROM "Sale" WHERE "id"=${id} AND "companyId"=${companyId}`;
    for(const id of reverseDocs)await prisma.$executeRaw`DELETE FROM "PurchaseDocument" WHERE "id"=${id} AND "companyId"=${companyId}`;
  }
  console.log('E2E task27 original-date reversal cost passed',{returns:1,cancellations:1,sales:-30,cost:-6,laterCostNotUsed:9,orphanProfit:null});

  // Expense VAT follows each active payment date with proportional, cent-reconciled allocation.
  const vatFixture=`task27-vat-${saleId}`,vatDocs=[],vatTransactions=[];
  const vatPath=day=>`/api/owner-payments/business-picture?storeId=${storeId}&calendarFrom=2032-05-${day}&calendarTo=2032-05-${day}`;
  const addVatDoc=async(label,net,vat,gross,status='APPROVED')=>{const id=`${vatFixture}-${label}`;vatDocs.push(id);await prisma.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","status","documentDate","totalNet","totalVat","totalGross") VALUES (${id},${companyId},${storeId},${status},${new Date('2032-04-30T12:00Z')},${net},${vat},${gross})`;return id;};
  const addVatPayment=async(label,day,amount,doc=null,reversed=false)=>{const id=`${vatFixture}-${label}`;vatTransactions.push(id);await prisma.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","type","amount","actorId","actorName","occurredAt","attachmentMimeType","attachmentFilename","reversedAt") VALUES (${id},${companyId},${storeId},'OTHER_EXPENSE',${amount},'task27-e2e','Isolated expense VAT',${new Date(`2032-05-${day}T12:00Z`)},${doc?'application/vnd.myworkstation.purchase-document':null},${doc},${reversed?new Date('2032-05-20T12:00Z'):null})`;};
  try{
    await addVatPayment('full','01',124,await addVatDoc('full-doc',100,24,124));
    await addVatPayment('zero','02',100,await addVatDoc('zero-doc',100,0,100));
    await addVatPayment('partial','03',62,await addVatDoc('partial-doc',100,24,124));
    const split=await addVatDoc('split-doc',100,24,124);await addVatPayment('split1','04',62,split);await addVatPayment('split2','05',62,split);
    await addVatPayment('draft','06',124,await addVatDoc('draft-doc',100,24,124,'DRAFT'));
    await addVatPayment('inconsistent','07',124,await addVatDoc('bad-doc',90,24,124));
    await addVatPayment('unlinked','08',10);
    await addVatPayment('credit','09',-124,await addVatDoc('credit-doc',-100,-24,-124));
    const duplicate=await addVatDoc('duplicate-doc',100,24,124);await addVatPayment('duplicate1','10',124,duplicate);await addVatPayment('duplicate2','11',124,duplicate);
    await addVatPayment('reversed','12',124,await addVatDoc('reversed-doc',100,24,124),true);
    // Cent reconciliation across months, same-time ties and a reversed installment.
    const cents=await addVatDoc('cents-doc',1,.01,1.01);
    await addVatPayment('cents-a','20',.50,cents);await addVatPayment('cents-b','20',.50,cents);
    await addVatPayment('cents-reversed','21',.50,cents,true);
    const lastId=`${vatFixture}-cents-final`;vatTransactions.push(lastId);
    await prisma.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","type","amount","actorId","actorName","occurredAt","attachmentMimeType","attachmentFilename") VALUES (${lastId},${companyId},${storeId},'OTHER_EXPENSE',0.01,'task27-e2e','Final isolated installment',${new Date('2032-06-01T12:00Z')},'application/vnd.myworkstation.purchase-document',${cents})`;
    const mixedSigns=await addVatDoc('mixed-sign-doc',100,24,124);
    await addVatPayment('mixed-sign-positive','22',62,mixedSigns);await addVatPayment('mixed-sign-negative','23',-1,mixedSigns);
    const partialCredit=await addVatDoc('partial-credit-doc',-100,-24,-124);
    await addVatPayment('partial-credit','24',-62,partialCredit);
    const beforeVat=await snapshot();
    for(const [day,gross,net,vat] of [['01',124,100,24],['02',100,100,0],['03',62,50,12],['04',62,50,12],['05',62,50,12],['09',-124,-100,-24],['24',-62,-50,-12]]){
      const result=await request(vatPath(day),{token:ownerToken});assert.equal(result.response.status,200,JSON.stringify(result.payload));
      for(const r of [result.payload.totals,...result.payload.daily,...result.payload.monthly]){assert.equal(r.expenseGross,gross);assert.equal(r.expenses,net);assert.equal(r.expenseVat,vat);assert.equal(r.netProfit,-net);assert.equal(r.missingExpenseVatPayments,0);}
    }
    for(const day of ['06','07','08','10','11','22','23']){
      const result=await request(vatPath(day),{token:ownerToken});assert.equal(result.response.status,200,JSON.stringify(result.payload));
      for(const r of [result.payload.totals,...result.payload.daily,...result.payload.monthly]){assert.equal(r.missingExpenseVatPayments,1);assert.equal(r.expenses,null);assert.equal(r.expenseVat,null);assert.equal(r.netProfit,null);assert.equal(r.expenseSalesPercent,null);assert.equal(r.grossProfit,0);}
    }
    const reversed=await request(vatPath('12'),{token:ownerToken});assert.equal(reversed.payload.totals.expenseGross,0);assert.equal(reversed.payload.totals.expensePayments,0);assert.equal(reversed.payload.totals.missingExpenseVatPayments,0);
    const mixed=await request(vatPath('01')+'&calendarTo=2032-05-11',{token:ownerToken});assert.equal(mixed.response.status,400,'Duplicate query field must be rejected');
    const all=await request(vatPath('01').replace('calendarTo=2032-05-01','calendarTo=2032-05-11'),{token:ownerToken});assert.equal(all.payload.totals.missingExpenseVatPayments,5);assert.equal(all.payload.totals.expenses,null);assert.equal(all.payload.totals.expenseVat,null);assert.equal(all.payload.totals.netProfit,null);
    const mayCents=await request(vatPath('20'),{token:ownerToken});
    assert.equal(mayCents.payload.totals.expenseGross,1);assert.equal(mayCents.payload.totals.expenseVat,.01);assert.equal(mayCents.payload.totals.expenses,.99);
    const juneCents=await request(`/api/owner-payments/business-picture?storeId=${storeId}&calendarFrom=2032-06-01&calendarTo=2032-06-01`,{token:ownerToken});
    assert.equal(juneCents.payload.totals.expenseGross,.01);assert.equal(juneCents.payload.totals.expenseVat,0);assert.equal(juneCents.payload.totals.expenses,.01);
    const fullCents=await request(vatPath('20').replace('calendarTo=2032-05-20','calendarTo=2032-06-01'),{token:ownerToken});
    const centDays=fullCents.payload.daily.filter(r=>['2032-05-20','2032-06-01'].includes(r.day));
    assert.equal(centDays.reduce((n,r)=>n+r.expenseVat,0),.01,'Separate periods reconcile to document VAT exactly');
    const canceledCents=await request(vatPath('21'),{token:ownerToken});assert.equal(canceledCents.payload.totals.expensePayments,0);
    assert.deepEqual(await snapshot(),beforeVat,'Expense report reads must leave ledgers unchanged');
  }finally{
    for(const id of vatTransactions)await prisma.$executeRaw`DELETE FROM "StoreTransaction" WHERE "id"=${id} AND "companyId"=${companyId}`;
    for(const id of vatDocs)await prisma.$executeRaw`DELETE FROM "PurchaseDocument" WHERE "id"=${id} AND "companyId"=${companyId}`;
  }
  console.log('E2E task27 documented expense VAT passed',{fullGross:124,net:100,vat:24,zeroVatKnown:true,creditNet:-100,unknownPayments:8,partialAndDuplicateVat:null});

  console.log("E2E real POS -> shift -> BackOffice flow passed",{sessionId,saleId,operatorId,stockAfter:8,cash:2,card:3,manualPrice:2.5});
}

try{await main()}finally{await prisma.$disconnect()}
