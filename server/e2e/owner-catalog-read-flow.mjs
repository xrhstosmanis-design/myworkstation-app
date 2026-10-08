import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {Prisma,PrismaClient} from "@prisma/client";

const base=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
assert.equal(process.env.NODE_ENV,"test");
for(const url of [base,process.env.DATABASE_URL])assert.ok(["localhost","127.0.0.1"].includes(new URL(url).hostname),"Only isolated local application/database allowed");
const db=new PrismaClient();
const source=fs.readFileSync(new URL("../src/routes/owner-product-smart-entry.js",import.meta.url),"utf8");
const current=source.match(/const rows=await prisma\.\$queryRaw`([\s\S]*?)`;/)[1];
const previous=fs.readFileSync(new URL("./fixtures/owner-catalog-before.sql",import.meta.url),"utf8");
function query(template,companyId,q=""){
  const parts=template.split(/\$\{(companyId|q===""|like)\}/);
  const strings=[],values=[];
  for(let i=0;i<parts.length;i++)i%2?values.push(parts[i]==="companyId"?companyId:parts[i]==='q===""'?q==="":`%${q}%`):strings.push(parts[i]);
  return Prisma.sql(strings,...values);
}
function normalized(value){
  if(Array.isArray(value))return value.map(normalized).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(value&&typeof value==="object"&&!value.toJSON)return Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])]));
  return value;
}
try{
  const company=await db.company.create({data:{name:"CI bounded catalog",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+86400000)}});
  const admin=await db.user.create({data:{email:`catalog-${company.id}@unit.test`,fullName:"CI catalog",role:"SUPER_ADMIN",companyId:company.id,passwordHash:"isolated-no-login",mustChangePassword:false}});
  const session=await db.userSession.create({data:{userId:admin.id,expiresAt:new Date(Date.now()+86400000)}});
  const token=jwt.sign({id:admin.id,email:admin.email,companyId:company.id,role:"SUPER_ADMIN",isSuperAdmin:true,sessionId:session.id,sessionVersion:admin.sessionVersion},process.env.JWT_SECRET,{expiresIn:"5m"});
  const get=async(path,authorized=true)=>{
    const response=await fetch(base+path,{headers:authorized?{authorization:`Bearer ${token}`}:{}});
    return {status:response.status,body:await response.json(),cache:response.headers.get("cache-control")};
  };
  assert.equal((await get("/api/owner-products/catalog",false)).status,401);
  const initial=await get("/api/owner-products/catalog");assert.equal(initial.status,200,JSON.stringify(initial.body));assert.deepEqual(initial.body,[]);
  const productId=crypto.randomUUID();
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku","salePrice","costPrice","vatRate","active") VALUES (${productId},${company.id},'CI Catalog HTTP','CI-CATALOG-HTTP',1.25,0.50,13,false)`;
  const concurrent=await Promise.all([...Array.from({length:8},()=>get("/api/owner-products/catalog?q=CI-CATALOG-HTTP")),get("/api/health",false)]);
  for(const result of concurrent.slice(0,8)){assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.length,1);assert.equal(result.body[0].id,productId);assert.equal(result.body[0].active,false);assert.equal(result.body[0].salePrice,1.25);assert.match(result.cache,/no-store/)}
  assert.equal(concurrent[8].status,200);

  await db.$transaction(async tx=>{
    // Temporary copies shadow application tables only on this isolated connection.
    const tables=["Product","ProductBarcode","ProductCategory","ProductSubcategory","ManagementProductCompany","MasterProduct","ManagementVatDepartment","Supplier","SupplierProductLink","SupplierProductMapping","PurchaseDocument","PurchaseDocumentLine","PurchaseOrder","PurchaseOrderLine","Store","StoreProduct"];
    for(const table of tables)await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${table}" AS SELECT * FROM public."${table}" WITH NO DATA`);
    await tx.$executeRawUnsafe('ALTER TABLE "Product" ADD PRIMARY KEY ("id")');
    await tx.$executeRawUnsafe(`INSERT INTO "Product" ("id","companyId","name","sku","salePrice","costPrice","vatRate","active") SELECT 'p'||lpad(i::text,4,'0'),'tenant-a','Product '||lpad(i::text,4,'0'),'sku'||i,1.25,0.50,13,i<>30 FROM generate_series(1,600) i`);
    await tx.$executeRawUnsafe(`INSERT INTO "Product" ("id","companyId","name","sku") VALUES ('foreign','tenant-b','AAA foreign','sku-foreign')`);
    await tx.$executeRawUnsafe(`INSERT INTO "Supplier" ("id","companyId","name") VALUES ('sa','tenant-a','A'),('sb','tenant-a','B'),('sc','tenant-a','C'),('sd','tenant-a','D'),('sn','tenant-a',NULL),('foreign-s','tenant-b','Foreign')`);
    await tx.$executeRawUnsafe(`INSERT INTO "SupplierProductLink" ("id","companyId","productId","supplierId","active","updatedAt") VALUES ('l1','tenant-a','p0001','sa',true,'2025-01-01'),('l2','tenant-a','p0001','sb',true,'2026-01-01'),('l3','tenant-a','p0002','sa',false,'2026-01-01'),('l5','tenant-a','p0005','sn',true,'2026-01-01'),('lf','tenant-b','p0006','foreign-s',true,'2026-01-01')`);
    await tx.$executeRawUnsafe(`INSERT INTO "SupplierProductMapping" ("id","companyId","productId","supplierId","lastSeenAt") VALUES ('m1','tenant-a','p0001','sc','2026-10-01'),('m2','tenant-a','p0002','sc','2026-10-01'),('m5','tenant-a','p0005','sa','2026-10-01')`);
    await tx.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" ("id","companyId","supplierId","status","createdAt") VALUES ('d1','tenant-a','sd','APPROVED','2026-01-01'),('d2','tenant-a','sa','DRAFT','2026-10-01')`);
    await tx.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId") VALUES ('dl1','d1','p0003'),('dl2','d2','p0003')`);
    await tx.$executeRawUnsafe(`INSERT INTO "PurchaseOrder" ("id","companyId","supplierId","status","createdAt") VALUES ('o1','tenant-a','sb','FINAL','2026-01-01'),('o2','tenant-a','sa','DRAFT','2026-10-01')`);
    await tx.$executeRawUnsafe(`INSERT INTO "PurchaseOrderLine" ("id","orderId","productId") VALUES ('ol1','o1','p0004'),('ol2','o2','p0004')`);
    await tx.$executeRawUnsafe(`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier","salePrice","name","updatedAt") VALUES ('bc1','p0600','9990000600',6,7.50,'Six pack','2026-01-01'),('bc2','p0001','9990000001',1,1.25,'Each','2026-01-01')`);
    await tx.$executeRawUnsafe(`INSERT INTO "Store" ("id","companyId","name") VALUES ('store-a','tenant-a','Store A'),('store-b','tenant-b','Foreign')`);
    await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active","currentStock","minStock") VALUES ('sp1','store-a','p0001',1.50,true,7,2),('sp2','store-b','p0001',9,true,99,9)`);
    for(const term of ["","Product 000","sku30","9990000600","missing","' OR true --"]){
      const before=await tx.$queryRaw(query(previous,"tenant-a",term)),after=await tx.$queryRaw(query(current,"tenant-a",term));
      assert.deepEqual(normalized(after),normalized(before),`All returned fields preserve prior behavior for ${JSON.stringify(term)}`);
      assert.ok(after.every(row=>row.id!=="foreign"));
      if(term===""){
        assert.equal(after.length,500);assert.deepEqual(after.slice(0,6).map(row=>row.supplierName),["B","C","D","B","A",null]);
        assert.equal(after[5].hasSupplier,false);assert.equal(after[29].active,false);assert.equal(after[0].stores.length,1);assert.equal(after[0].stores[0].salePrice,1.5);
      }
      if(term==="9990000600")assert.equal(after[0].id,"p0600","Search outside the first page still finds the barcode");
    }
    await tx.$executeRawUnsafe(`UPDATE "SupplierProductLink" SET "active"=false WHERE "id"='l2'`);
    assert.equal((await tx.$queryRaw(query(current,"tenant-a","sku1"))).find(row=>row.id==="p0001").supplierName,"A","No stale supplier-result cache");
    const plan=await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE,FORMAT JSON) ${query(current,"tenant-a","")}`);
    const nodes=[];const walk=n=>{nodes.push(n);for(const child of n.Plans||[])walk(child)};walk(plan[0]["QUERY PLAN"][0].Plan);
    const candidates=nodes.find(n=>n["Subplan Name"]==="CTE candidates");assert.equal(candidates["Node Type"],"Limit");assert.equal(candidates["Actual Rows"],500);assert.equal(candidates["Actual Loops"],1);
    const suppliers=nodes.find(n=>n["Subplan Name"]==="CTE suppliers");assert.equal(suppliers["Actual Loops"],1,"Supplier history is selected once, not once per product");
  },{timeout:60000});
  console.log("Owner catalog isolated PostgreSQL + HTTP PASS: equivalent fields/search/supplier priority, first500 before enrichment, one supplier selection, inactive/barcode/store isolation, fresh supplier changes and concurrent read/health requests. No sale/payment/stock actions.");
}finally{await db.$disconnect()}
