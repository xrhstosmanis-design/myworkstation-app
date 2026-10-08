import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {PrismaClient} from "@prisma/client";
import {DEFAULT_AUDIENCE_LABELS} from "../../shared/pos-audience-settings.mjs";

const base=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
assert.equal(process.env.NODE_ENV,"test","This fixture requires the isolated test runtime.");
assert.ok(["localhost","127.0.0.1"].includes(new URL(base).hostname),"This fixture never targets a remote application.");
const db=new PrismaClient(),id=()=>crypto.randomUUID();
async function request(path,{token,method="GET",body}={}){
  const response=await fetch(base+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
try{
  const company=await db.company.create({data:{name:"CI audience settings",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+86400000)}});
  const foreign=await db.company.create({data:{name:"CI foreign audience",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+86400000)}});
  for(const companyId of [company.id,foreign.id])await db.companyModule.create({data:{companyId,moduleKey:"STORE_MODE",active:true}});
  const store=await db.store.create({data:{name:"CI optional audience",companyId:company.id}}),sibling=await db.store.create({data:{name:"CI sibling audience",companyId:company.id}}),foreignStore=await db.store.create({data:{name:"CI foreign audience",companyId:foreign.id}});
  const admin=await db.user.create({data:{email:`audience-${company.id}@unit.test`,fullName:"CI audience admin",role:"SUPER_ADMIN",companyId:company.id,passwordHash:"isolated-no-login",mustChangePassword:false}});
  const session=await db.userSession.create({data:{userId:admin.id,expiresAt:new Date(Date.now()+86400000)}});
  const claims={id:admin.id,email:admin.email,companyId:company.id,role:"OWNER"};
  const token=jwt.sign({...claims,isSuperAdmin:true,platformRole:"SUPER_ADMIN",sessionId:session.id,sessionVersion:admin.sessionVersion},process.env.JWT_SECRET,{expiresIn:"5m"});
  const ownerToken=jwt.sign(claims,process.env.JWT_SECRET,{expiresIn:"5m"});
  const settingsPath=`/api/platform/pos-designer-fixed/audience-settings/${store.id}`,pos=`/api/store-pos/stores/${store.id}`;
  const layout={title:"CI POS",quickKeys:[],categories:[],buttons:[]};
  for(const row of [store,sibling])await db.$executeRaw`INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson") VALUES (${row.id},${company.id},${JSON.stringify(layout)}::jsonb)`;
  const settings={enabled:true,labels:{...DEFAULT_AUDIENCE_LABELS,DOCTOR:"Ιατρικό προσωπικό",CUSTOMER:"Λογαριασμός πελάτη"}};
  assert.equal((await request(settingsPath,{method:"PUT",body:settings})).status,401);
  assert.equal((await request(settingsPath,{token:ownerToken,method:"PUT",body:settings})).status,403);
  assert.equal((await request(settingsPath,{token})).body.settings.enabled,false);
  assert.equal((await request(settingsPath,{token,method:"PUT",body:{...settings,labels:{...settings.labels,NURSE:" "}}})).status,400);
  assert.equal((await request(pos+"/audience-selection",{token:ownerToken,method:"POST",body:{audience:"DOCTOR"}})).status,409);
  assert.equal((await request(pos+"/audience-card/scan",{token:ownerToken,method:"POST",body:{cardCode:"CI-CARD"}})).status,409);
  assert.equal((await request(settingsPath,{token,method:"PUT",body:settings})).status,200);
  const catalog=await request(pos,{token:ownerToken});assert.equal(catalog.status,200,JSON.stringify(catalog.body));assert.deepEqual(catalog.body.layout.audienceSettings,settings);
  assert.equal((await request(`/api/platform/pos-designer-fixed/audience-settings/${sibling.id}`,{token})).body.settings.enabled,false);
  assert.equal((await request(pos+"/audience-selection",{token:ownerToken,method:"POST",body:{audience:"DOCTOR"}})).status,200);
  const productId=id();
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","salePrice") VALUES (${productId},${company.id},'CI water',0.50)`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice") VALUES (${id()},${store.id},${productId},0.50)`;
  // Selection above creates the existing audience table lazily; GET initializes discount storage.
  assert.equal((await request(pos+"/audience-discounts",{token:ownerToken})).status,200);
  await db.$executeRaw`INSERT INTO "StoreProductAudienceDiscount" ("id","companyId","storeId","productId","audience","discountPercent") VALUES (${id()},${company.id},${store.id},${productId},'DOCTOR',10)`;
  const quote={items:[{productId,quantity:3}],audience:"DOCTOR"};
  const price=await request(pos+"/quote",{token:ownerToken,method:"POST",body:quote});assert.equal(price.status,200,JSON.stringify(price.body));assert.equal(price.body.total,1.40,"Existing 0.10 line rounding must be preserved");
  const edited=await request(pos+"/layout",{token:ownerToken,method:"PUT",body:{layout:{...layout,title:"Edited products",audienceSettings:{enabled:false,labels:{}}}}});assert.equal(edited.status,200,JSON.stringify(edited.body));assert.deepEqual(edited.body.layout.audienceSettings,settings,"Product editors cannot alter central audience configuration");
  const cloned=await request("/api/platform/pos-designer-fixed/clone",{token,method:"POST",body:{sourceStoreId:sibling.id,targetStoreIds:[store.id]}});assert.equal(cloned.status,200,JSON.stringify(cloned.body));assert.deepEqual((await request(settingsPath,{token})).body.settings,settings,"Cloning preserves the target store configuration");
  assert.equal((await request(settingsPath,{token,method:"PUT",body:{...settings,enabled:false}})).status,200);
  assert.equal((await request(pos+"/quote",{token:ownerToken,method:"POST",body:quote})).status,409);
  const customerIds={credit:id(),debt:id(),retail:id(),inactive:id(),foreign:id()};
  for(const [key,customerId] of Object.entries(customerIds))await db.$executeRaw`INSERT INTO "Customer" ("id","companyId","name","creditLimit","balance","active","memberCard") VALUES (${customerId},${key==="foreign"?foreign.id:company.id},${`CI ${key}`},${key==="credit"||key==="inactive"||key==="foreign"?100:0},${key==="debt"?20:0},${key!=="inactive"},${`CARD-${key}`})`;
  const customers=await request(pos+"/customers?creditOnly=1",{token:ownerToken});assert.equal(customers.status,200,JSON.stringify(customers.body));assert.deepEqual(new Set(customers.body.items.map(row=>row.id)),new Set([customerIds.credit,customerIds.debt]));assert.ok(customers.body.items.every(row=>row.memberCard===undefined));
  assert.equal((await request(`/api/store-pos/stores/${foreignStore.id}/customers?creditOnly=1`,{token:ownerToken})).status,404);
  assert.equal((await request(pos+"/customers",{token:ownerToken})).body.items.length,0,"General customer search keeps its minimum query length");
  const employee=await db.employee.create({data:{storeId:store.id,fullName:"CI card-only operator"}}),operatorId=id(),operatorSessionId=id();
  const permissions={customersPos:true,customerCardOnly:true,editPosButtons:true};
  await db.$executeRaw`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","createdBy") VALUES (${operatorId},${company.id},${store.id},${employee.id},'CI operator','EMPLOYEE',${admin.id})`;
  await db.$executeRaw`INSERT INTO "StoreOperatorProfile" ("id","companyId","storeId","employeeId","permissions","createdBy") VALUES (${id()},${company.id},${store.id},${employee.id},${JSON.stringify(permissions)}::jsonb,${admin.id})`;
  await db.$executeRaw`INSERT INTO "StoreOperatorSession" ("id","operatorId","companyId","storeId","expiresAt") VALUES (${operatorSessionId},${operatorId},${company.id},${store.id},${new Date(Date.now()+86400000)})`;
  const operatorToken=jwt.sign({tokenType:"STORE_OPERATOR",operatorId,id:operatorId,employeeId:employee.id,companyId:company.id,storeId:store.id,role:"EMPLOYEE",operatorSessionId},process.env.JWT_SECRET,{expiresIn:"5m"});
  assert.equal((await request(pos+"/customers?creditOnly=1",{token:operatorToken})).body.items.length,0,"Card-only operators cannot browse credit accounts");
  const cardResult=await request(pos+"/customers?creditOnly=1&q=CARD-credit",{token:operatorToken});assert.equal(cardResult.status,200,JSON.stringify(cardResult.body));assert.deepEqual(cardResult.body.items.map(row=>row.id),[customerIds.credit]);
  assert.equal((await request(pos+"/customers?creditOnly=1&q=CI%20credit",{token:operatorToken})).body.items.length,0);
  assert.equal((await request(`/api/store-pos/stores/${sibling.id}/customers?creditOnly=1`,{token:operatorToken})).status,403);
  await db.$executeRaw`UPDATE "StoreOperatorProfile" SET "permissions"='{}'::jsonb WHERE "employeeId"=${employee.id} AND "storeId"=${store.id}`;
  assert.equal((await request(pos+"/customers?creditOnly=1",{token:operatorToken})).status,403,"Customer permission revocation applies to the same session");
  console.log("Optional audience / credit customer HTTP E2E PASS: Super Admin configuration, default off, store isolation, editable labels, guarded quotes/cards, preserved rounding/layout configuration, company credit list and live operator restrictions. No sales or payments created.");
}finally{await db.$disconnect()}
