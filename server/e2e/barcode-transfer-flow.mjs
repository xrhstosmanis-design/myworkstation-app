import assert from "node:assert/strict";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const base=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
assert.ok(["127.0.0.1","localhost","::1"].includes(new URL(base).hostname),"Isolated local E2E only");
assert.equal(process.env.NODE_ENV,"test","Never run this fixture against production");
const prisma=new PrismaClient(),companyId="pilot-company",storeId="kat-store";
const email="n13-barcode-owner@myworkstation.test",password="ci-n13-barcode-only",tag=crypto.randomUUID();
async function request(path,{method="GET",token,body}={}){
  const response=await fetch(base+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{}),...(body!==undefined?{"content-type":"application/json"}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>null);
  return {status:response.status,payload};
}
const transfer=(token,target,source,barcode)=>request(`/api/owner-products/${target}/barcode-transfer`,{method:"POST",token,body:{sourceProductId:source,barcode}});
try{
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+86400000*7)}});
  for(const moduleKey of ["INVENTORY","STORE_MODE"])await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  await prisma.user.upsert({where:{email},update:{companyId,role:"OWNER",passwordHash:await bcrypt.hash(password,4),mustChangePassword:false},create:{email,companyId,role:"OWNER",fullName:"N13 QA Owner",passwordHash:await bcrypt.hash(password,4),mustChangePassword:false}});
  const login=await request("/api/auth/login",{method:"POST",body:{email,password,deviceName:"CI N13"}});
  assert.equal(login.status,200,JSON.stringify(login.payload));const token=login.payload.token;
  async function product(name,barcodes=[]){
    const r=await request("/api/commerce/products",{method:"POST",token,body:{name:`N13 ${tag} ${name}`,sku:`N13-${name}-${tag}`,unit:"PIECE",vatRate:13,salePrice:2.4,costPrice:0.7,trackStock:true,barcodes,storeId,openingStock:7}});
    assert.equal(r.status,201,JSON.stringify(r.payload));return r.payload.id;
  }
  const barcode="2996100700015",keep="2996100700022",race="2996100700039",duplicate="2996100700046",rollback="2996100700053";
  const source=await product("source",[barcode,keep,race,rollback]),target=await product("target"),other=await product("other");
  await prisma.$executeRaw`UPDATE "ProductBarcode" SET "unitMultiplier"=6,"salePrice"=9.90,"name"='old six-pack' WHERE "productId"=${source} AND "barcode"=${barcode}`;
  const original=(await prisma.$queryRaw`SELECT "id" FROM "ProductBarcode" WHERE "productId"=${source} AND "barcode"=${barcode}`)[0].id;
  const sibling=await prisma.store.create({data:{companyId,name:"N13 sibling "+tag}});
  await prisma.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${crypto.randomUUID()},${sibling.id},${target},3.1,5,true)`;
  const foreignCompany=await prisma.company.create({data:{name:"N13 foreign "+tag,active:true}});
  const foreign=crypto.randomUUID();
  await prisma.$executeRaw`INSERT INTO "Product" ("id","companyId","sku","name","unit","vatRate","salePrice","costPrice","trackStock") VALUES (${foreign},${foreignCompany.id},${"N13-foreign-"+tag},'Foreign product','PIECE',13,8,1,true)`;
  await prisma.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode") VALUES (${crypto.randomUUID()},${foreign},${barcode})`;
  await prisma.$executeRaw`DELETE FROM "ProductBarcode" WHERE "productId"=${source} AND "barcode"=${rollback}`;
  const orphanA=await product("orphanA",[rollback]),orphanB=await product("orphanB");
  // Remove only isolated fixture mappings to exercise the Audit rollback guard.
  await prisma.$executeRaw`DELETE FROM "StoreProduct" WHERE "productId" IN (${orphanA},${orphanB})`;
  await prisma.$executeRaw`DELETE FROM "ProductBarcode" WHERE "productId"=${source} AND "barcode"=${rollback}`;
  async function safety(){
    const products=await prisma.$queryRaw`SELECT "id","salePrice","costPrice","vatRate","updatedAt" FROM "Product" WHERE "id" IN (${source},${target},${other},${foreign}) ORDER BY "id"`;
    const mappings=await prisma.$queryRaw`SELECT * FROM "StoreProduct" WHERE "productId" IN (${source},${target},${other}) ORDER BY "id"`;
    const counts=await prisma.$queryRaw`SELECT (SELECT count(*) FROM "Sale") AS sales,(SELECT count(*) FROM "Payment") AS payments,(SELECT count(*) FROM "StoreTransaction") AS transactions,(SELECT count(*) FROM "StockMovement") AS movements,(SELECT count(*) FROM "ProductPriceHistory") AS priceHistory`;
    return JSON.stringify({products,mappings,counts},(_key,value)=>typeof value==="bigint"?value.toString():value);
  }
  const master=crypto.randomUUID(),masterOnly="2996100700060";
  await prisma.$executeRaw`INSERT INTO "MasterProduct" ("id","sourceCode","name","importVersion") VALUES (${master},${"N13-master-"+tag},${"N13 master "+tag},'N13 CI')`;
  await prisma.$executeRaw`INSERT INTO "MasterProductBarcode" ("id","masterProductId","barcode") VALUES (${crypto.randomUUID()},${master},${barcode}),(${crypto.randomUUID()},${master},${masterOnly})`;
  await prisma.$executeRaw`UPDATE "Product" SET "masterProductId"=${master} WHERE "id"=${source}`;
  const before=await safety();
  const owner=await request(`/api/owner-products/${target}/barcode-owner?barcode=${barcode}`,{token});
  assert.equal(owner.status,200,JSON.stringify(owner.payload));assert.equal(owner.payload.owners.length,1);assert.equal(owner.payload.owners[0].productId,source);
  assert.equal((await transfer(token,target,source,"abc")).status,400);
  assert.equal((await transfer(token,source,source,barcode)).status,400);
  assert.equal((await transfer(token,target,source,"2996100799999")).status,409);
  assert.equal((await transfer(token,foreign,source,barcode)).status,404);
  assert.equal((await transfer(token,target,foreign,barcode)).status,404);
  const foreignRead=await request(`/api/owner-products/${foreign}/barcode-owner?barcode=${barcode}`,{token});assert.equal(foreignRead.status,404);
  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token,body:{username:"n13."+tag,fullName:"N13 Employee",email:"",phone:"",role:"EMPLOYEE",active:true,pin:"3479"}});
  assert.equal(created.status,201,JSON.stringify(created.payload));
  const employee=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId:created.payload.employeeId,pin:"3479"}});assert.equal(employee.status,200,JSON.stringify(employee.payload));
  assert.equal((await transfer(employee.payload.token,target,source,barcode)).status,403);
  assert.equal((await transfer(null,target,source,barcode)).status,401);
  const moved=await transfer(token,target,source,barcode);assert.equal(moved.status,200,JSON.stringify(moved.payload));assert.equal(moved.payload.auditedStores,2);
  const row=(await prisma.$queryRaw`SELECT * FROM "ProductBarcode" WHERE "id"=${original}`)[0];
  assert.equal(row.productId,target);assert.equal(Number(row.unitMultiplier),1);assert.equal(row.salePrice,null);assert.equal(row.name,null);
  const otherCodes=await prisma.$queryRaw`SELECT "barcode" FROM "ProductBarcode" WHERE "productId"=${source} ORDER BY "barcode"`;assert.ok(otherCodes.some(r=>r.barcode===keep));
  const foreignCode=(await prisma.$queryRaw`SELECT "productId" FROM "ProductBarcode" WHERE "productId"=${foreign} AND "barcode"=${barcode}`)[0];assert.equal(foreignCode.productId,foreign);
  const audits=await prisma.$queryRaw`SELECT "storeId","details" FROM "StoreOperatorAudit" WHERE "eventType"='PRODUCT_BARCODE_TRANSFERRED' AND "details"->>'sourceProductId'=${source} AND "details"->>'barcode'=${barcode}`;
  assert.equal(audits.length,2);assert.deepEqual(audits.map(a=>a.storeId).sort(),[storeId,sibling.id].sort());
  for(const a of audits){assert.equal(a.details.sourceProductId,source);assert.equal(a.details.targetProductId,target);assert.equal(a.details.resetBarcodeAttributes,true)}
  const pos=await request(`/api/store-pos/stores/${storeId}`,{token:employee.payload.token});assert.equal(pos.status,200,JSON.stringify(pos.payload));
  const matches=pos.payload.products.filter(p=>p.barcodes?.includes(barcode));assert.deepEqual(matches.map(p=>p.id),[target]);assert.equal(Number(matches[0].salePrice),2.4);
  assert.ok(pos.payload.products.find(p=>p.id===source).barcodes.includes(masterOnly),"Unclaimed master alias remains available");
  const legacy=await request(`/api/store-pos/stores/${storeId}/legacy-full`,{token:employee.payload.token});
  assert.equal(legacy.status,200,JSON.stringify(legacy.payload));
  assert.deepEqual(legacy.payload.products.filter(p=>p.barcodes?.includes(barcode)).map(p=>p.id),[target],"Legacy catalog respects local ownership");
  assert.ok(legacy.payload.products.find(p=>p.id===source).barcodes.includes(masterOnly));
  const stale=await transfer(token,other,source,barcode);assert.equal(stale.status,409);
  const races=await Promise.all([transfer(token,target,source,race),transfer(token,other,source,race)]);
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409],JSON.stringify(races));
  assert.equal((await prisma.$queryRaw`SELECT count(*)::int AS n FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${companyId} AND pb."barcode"=${race}`)[0].n,1);
  await prisma.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode") VALUES (${crypto.randomUUID()},${source},${duplicate}),(${crypto.randomUUID()},${other},${duplicate})`;
  assert.equal((await transfer(token,target,source,duplicate)).status,409);
  assert.equal((await transfer(token,orphanB,orphanA,rollback)).status,409);
  assert.equal((await prisma.$queryRaw`SELECT "productId" FROM "ProductBarcode" WHERE "barcode"=${rollback}`)[0].productId,orphanA,"Failed audit must roll back transfer");
  assert.equal(await safety(),before,"Transfer/negative paths changed prices, stock or financial records");
  console.log("N13 barcode HTTP E2E PASS: reset/identity/other-code/POS/Audit, invalid/missing/same/stale/duplicate/rollback, employee/anonymous/foreign isolation, concurrent one-winner, stock/price/financial invariants");
}finally{await prisma.$disconnect()}
