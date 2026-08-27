import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-multi-pos-owner";
const terminalByToken=new Map();

async function request(path,{method="GET",token,terminalPos,body}={}){
  const resolvedTerminal=terminalPos||terminalByToken.get(token)||null;
  const effectiveBody=body!==undefined&&resolvedTerminal?{...body,terminalPos:resolvedTerminal}:body;
  const targetPath=resolvedTerminal?`${path}${path.includes("?")?"&":"?"}mwsTerminal=${encodeURIComponent(resolvedTerminal)}`:path;
  const response=await fetch(`${baseUrl}${targetPath}`,{
    method,
    headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(resolvedTerminal?{"x-mws-terminal-pos":resolvedTerminal}:{}),...(effectiveBody!==undefined?{"content-type":"application/json"}:{})},
    body:effectiveBody===undefined?undefined:JSON.stringify(effectiveBody)
  });
  let payload=null;try{payload=await response.json()}catch{}
  return {response,payload};
}

const profileBody=(name,terminalPos)=>({
  username:name.toLowerCase().replace(/\s+/g,"."),fullName:name,stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,
  permissions:{cash:true,cards:true,initialCash:true,closeShift:true,centralCashPos:false,shiftTransactionsPos:true,allShiftTransactionsPos:false,sameShiftPayments:true},
  backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos,cashLimit:null,notes:`Multi POS ${terminalPos}`,
  retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
});

async function createOperator(ownerToken,{name,pin,terminalPos}){
  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:name.toLowerCase().replace(/\s+/g,"."),fullName:name,email:"",phone:"",role:"EMPLOYEE",active:true,pin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;
  const profile=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:profileBody(name,terminalPos)});
  assert.equal(profile.response.status,200,JSON.stringify(profile.payload));
  const terminalRows=await prisma.$executeRaw`UPDATE "StoreOperatorProfile" SET "terminalPos"=${terminalPos},"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "employeeId"=${employeeId}`;
  assert.equal(terminalRows,1,"Multi-POS fixture did not persist the operator terminal assignment");
  const login=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  assert.ok(login.payload?.token);
  terminalByToken.set(login.payload.token,terminalPos);
  return {employeeId,token:login.payload.token};
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE","INVENTORY"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI multi POS"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;assert.ok(ownerToken);

  const product=await request("/api/commerce/products",{method:"POST",token:ownerToken,body:{name:"Multi POS Shared Stock",sku:`MULTIPOS-${Date.now()}`,unit:"PIECE",vatRate:24,salePrice:2.2,costPrice:1,trackStock:true,barcodes:[],storeId,openingStock:10}});
  assert.equal(product.response.status,201,JSON.stringify(product.payload));
  const productId=product.payload.id;

  const pos1=await createOperator(ownerToken,{name:"E2E POS One",pin:"7311",terminalPos:"POS-1"});
  const pos2=await createOperator(ownerToken,{name:"E2E POS Two",pin:"7312",terminalPos:"POS-2"});

  const open1=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token:pos1.token,terminalPos:"POS-1",body:{shiftLabel:"POS-1 shift",drawer:20,custody:0,coins:0,safe:0,note:"multi POS E2E"}});
  assert.equal(open1.response.status,201,JSON.stringify(open1.payload));
  assert.equal(open1.payload.terminalPos,"POS-1");

  const open2=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token:pos2.token,terminalPos:"POS-2",body:{shiftLabel:"POS-2 shift",drawer:30,custody:0,coins:0,safe:0,note:"multi POS E2E"}});
  assert.equal(open2.response.status,201,JSON.stringify(open2.payload));
  assert.equal(open2.payload.terminalPos,"POS-2");
  assert.notEqual(open1.payload.id,open2.payload.id);

  const crossTerminalClose=await request(`/api/cash/sessions/${open2.payload.id}/close`,{method:"POST",token:pos1.token,body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:30,custody:0,coins:0,safe:0,note:"must be denied"}});
  assert.equal(crossTerminalClose.response.status,403,"POS-1 was allowed to close POS-2 shift");
  assert.match(String(crossTerminalClose.payload?.error||""),/άλλου POS/);

  const duplicate=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token:pos1.token,body:{shiftLabel:"duplicate POS-1",drawer:20,custody:0,coins:0,safe:0}});
  assert.equal(duplicate.response.status,409,"Same POS accepted two simultaneous open shifts");

  const sale1=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token:pos1.token,body:{items:[{productId,quantity:1}],paymentMethod:"CASH",clientTransactionId:crypto.randomUUID()}});
  assert.equal(sale1.response.status,201,JSON.stringify(sale1.payload));

  const sale2=await request(`/api/store-pos/stores/${storeId}/checkout`,{method:"POST",token:pos2.token,body:{items:[{productId,quantity:2}],paymentMethod:"CASH",clientTransactionId:crypto.randomUUID()}});
  assert.equal(sale2.response.status,201,JSON.stringify(sale2.payload));

  const stock=(await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${productId} LIMIT 1`)[0];
  assert.equal(Number(stock?.currentStock),7,"Multiple POS sales did not share store stock correctly");

  const ledger1=await request(`/api/transactions/stores/${storeId}/overview`,{token:pos1.token});
  assert.equal(ledger1.response.status,200,JSON.stringify(ledger1.payload));
  assert.equal(ledger1.payload.openSession?.id,open1.payload.id);
  assert.equal(ledger1.payload.openSession?.terminalPos,"POS-1");
  assert.equal(Number(ledger1.payload.summary?.cashSales||0),2.2,"POS-1 ledger includes another terminal");

  const ledger2=await request(`/api/transactions/stores/${storeId}/overview`,{token:pos2.token});
  assert.equal(ledger2.response.status,200,JSON.stringify(ledger2.payload));
  assert.equal(ledger2.payload.openSession?.id,open2.payload.id);
  assert.equal(ledger2.payload.openSession?.terminalPos,"POS-2");
  assert.equal(Number(ledger2.payload.summary?.cashSales||0),4.4,"POS-2 ledger includes another terminal");

  const close1=await request(`/api/cash/sessions/${open1.payload.id}/close`,{method:"POST",token:pos1.token,body:{cashSales:999,cardSales:0,eftposTotal:0,expenses:999,drawer:22.2,custody:0,coins:0,safe:0,note:"close POS-1"}});
  assert.equal(close1.response.status,200,JSON.stringify(close1.payload));
  assert.equal(Number(close1.payload.cashSales),2.2);
  assert.equal(Number(close1.payload.variance),0);

  const stillOpen2=await request(`/api/cash/stores/${storeId}/overview`,{token:pos2.token});
  assert.equal(stillOpen2.response.status,200,JSON.stringify(stillOpen2.payload));
  assert.equal(stillOpen2.payload.openSession?.id,open2.payload.id,"Closing POS-1 closed or hid POS-2 shift");

  const close2=await request(`/api/cash/sessions/${open2.payload.id}/close`,{method:"POST",token:pos2.token,body:{cashSales:999,cardSales:0,eftposTotal:0,expenses:999,drawer:34.4,custody:0,coins:0,safe:0,note:"close POS-2"}});
  assert.equal(close2.response.status,200,JSON.stringify(close2.payload));
  assert.equal(Number(close2.payload.cashSales),4.4);
  assert.equal(Number(close2.payload.variance),0);

  const sessions=await prisma.$queryRaw`SELECT "terminalPos","status","cashSales" FROM "CashShiftSession" WHERE "id" IN (${open1.payload.id},${open2.payload.id}) ORDER BY "terminalPos"`;
  assert.deepEqual(sessions.map(x=>[x.terminalPos,x.status,Number(x.cashSales)]),[["POS-1","CLOSED",2.2],["POS-2","CLOSED",4.4]]);

  console.log("KAT P1 multiple POS shift isolation passed",{stock:7,pos1Cash:2.2,pos2Cash:4.4,crossTerminalClose:"blocked"});
}

try{await main()}finally{await prisma.$disconnect()}
