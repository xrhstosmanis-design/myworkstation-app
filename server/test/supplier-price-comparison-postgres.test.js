import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {once} from "node:events";
import express from "express";
import {buildSupplierPriceComparison} from "../src/lib/supplier-price-comparison.js";
import {ownerRestrictedModuleKeys} from "../src/services/module-catalog.js";

// Execute the registered production handler and module guard against real SQL.
// Only TEMP tables in a loopback *_test database may hold these fixtures.
// Signed-in contexts are injected by this test harness; login/session handling
// and the production browser are deliberately outside this test's evidence.
test("supplier comparison HTTP/SQL isolates stores, prices and module access",{skip:!process.env.DATABASE_URL,timeout:45000},async t=>{
  const database=new URL(process.env.DATABASE_URL);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(database.hostname),"Fixture database must be on loopback");
  assert.match(database.pathname,/\/[^/]+_test$/,"Fixture database name must end in _test");
  assert.equal(process.env.NODE_ENV,"test","SQL fixtures require NODE_ENV=test");
  const {PrismaClient}=await import("@prisma/client");
  const prisma=new PrismaClient();
  try{
    await prisma.$transaction(async tx=>{
      const tables={
        Store:'"id" TEXT PRIMARY KEY,"companyId" TEXT',
        Company:'"id" TEXT PRIMARY KEY,"name" TEXT,"active" BOOLEAN,"licenseStatus" TEXT',
        CompanyModule:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"moduleKey" TEXT,"active" BOOLEAN',
        StorePaidModule:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP',
        Product:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"sku" TEXT,"unit" TEXT',
        Supplier:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT',
        PurchaseDocument:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"documentNumber" TEXT,"documentDate" TIMESTAMP,"createdAt" TIMESTAMP,"sourceType" TEXT,"status" TEXT,"documentType" TEXT',
        PurchaseDocumentLine:'"id" TEXT PRIMARY KEY,"purchaseDocumentId" TEXT,"productId" TEXT,"quantity" NUMERIC,"unit" TEXT,"unitsPerPackage" NUMERIC,"netAmount" NUMERIC',
        StockMovement:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"productId" TEXT,"sourceType" TEXT,"sourceId" TEXT,"movementType" TEXT,"unitCost" NUMERIC,"createdAt" TIMESTAMP',
        PurchaseOrder:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT',
        PurchaseOrderLine:'"id" TEXT PRIMARY KEY,"orderId" TEXT,"productId" TEXT,"quantity" NUMERIC,"stockUnitsPerInvoiceUnit" NUMERIC,"netAmount" NUMERIC,"exciseTotal" NUMERIC,"invoiceUnit" TEXT'
      };
      for(const [name,columns] of Object.entries(tables))await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${name}" (${columns}) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`INSERT INTO "Company" VALUES ('a','Own company',true,'ACTIVE'),('b','Foreign company',true,'ACTIVE'),('c','Suspended company',true,'SUSPENDED')`);
      await tx.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES ('ma','a','INVENTORY',true),('mb','b','INVENTORY',true),('mc','c','INVENTORY',true)`);
      await tx.$executeRawUnsafe(`INSERT INTO "Store" VALUES ('a1','a'),('a2','a'),('a-off','a'),('b1','b'),('c1','c')`);
      await tx.$executeRawUnsafe(`INSERT INTO "StorePaidModule" VALUES ('off','a-off','INVENTORY',false,NULL,NULL)`);
      await tx.$executeRawUnsafe(`INSERT INTO "Product" VALUES ('piece','a','Pieces','SKU-P','PIECE'),('kg','a','Weight','SKU-K','KG'),('litre','a','Volume','SKU-L','L'),('zero','a','Zero','SKU-Z','PIECE'),('order','a','Order','SKU-O','PIECE'),('invalid-order','a','Invalid order','SKU-I','PIECE'),('foreign-product','b','Foreign product','FOREIGN','PIECE')`);
      await tx.$executeRawUnsafe(`INSERT INTO "Supplier" VALUES ('s1','a','Supplier A'),('s2','a','Supplier B'),('foreign-supplier','b','Foreign supplier')`);
      const documents=[
        ["old","a","a1","s1","2026-09-01","MANUAL","APPROVED","INVOICE"],
        ["new","a","a1","s1","2026-10-01","MANUAL","APPROVED","INVOICE"],
        ["vendor-b","a","a1","s2","2026-10-01","MANUAL","APPROVED","INVOICE"],
        ["bad-unit","a","a1","s2","2026-10-02","MANUAL","APPROVED","INVOICE"],
        ["draft","a","a1","s1","2026-10-03","MANUAL","DRAFT","INVOICE"],
        ["credit","a","a1","s1","2026-10-03","MANUAL","APPROVED","CREDIT_NOTE"],
        ["sibling","a","a2","s1","2026-10-03","MANUAL","APPROVED","INVOICE"],
        ["foreign","b","b1","foreign-supplier","2026-10-03","MANUAL","APPROVED","INVOICE"],
        ["bad-supplier","a","a1","foreign-supplier","2026-10-03","MANUAL","APPROVED","INVOICE"],
        ["po-explicit","a","a1","s1","2026-10-01","PURCHASE_ORDER","APPROVED","INVOICE"],
        ["po-corrected","a","a1","s2","2026-10-01","PURCHASE_ORDER","APPROVED","INVOICE"],
        ["po-invalid","a","a1","s1","2026-10-01","PURCHASE_ORDER","APPROVED","INVOICE"]
      ];
      for(const [id,company,store,supplier,date,source,status,type] of documents)await tx.$executeRaw`INSERT INTO "PurchaseDocument" VALUES (${id},${company},${store},${supplier},${id},${new Date(date)},${new Date(date)},${source},${status},${type})`;
      const lines=[
        ["old-p","old","piece",10,"PIECE",null,8],
        ["new-p1","new","piece",10,"PIECE",null,20],["new-p2","new","piece",10,"PIECE",null,10],
        ["b-p","vendor-b","piece",2,"PACKAGE",12,18],
        ["new-kg","new","kg",250,"GR",null,2],["b-kg","vendor-b","kg",.5,"KG",null,3],
        ["bad-kg","bad-unit","kg",1,"PIECE",null,.01],
        ["new-litre","new","litre",500,"ML",null,1],["new-zero","new","zero",10,"PIECE",null,0],
        ["draft-p","draft","piece",100,"PIECE",null,.01],["credit-p","credit","piece",100,"PIECE",null,.01],
        ["sibling-p","sibling","piece",100,"PIECE",null,.1],
        ["foreign-p","foreign","foreign-product",1,"PIECE",null,7.77],
        ["bad-supplier-p","bad-supplier","piece",100,"PIECE",null,.01],
        ["bad-product-p","new","foreign-product",100,"PIECE",null,.01],
        ["explicit-p","po-explicit","order",1,"PIECE",null,999],
        ["corrected-p","po-corrected","order",1,"PIECE",null,999],
        ["invalid-p","po-invalid","invalid-order",1,"PIECE",null,999]
      ];
      for(const [id,document,product,quantity,unit,pack,net] of lines)await tx.$executeRaw`INSERT INTO "PurchaseDocumentLine" VALUES (${id},${document},${product},${quantity},${unit},${pack},${net})`;
      await tx.$executeRawUnsafe(`INSERT INTO "PurchaseOrder" VALUES ('po-explicit','a','a1','FINAL'),('po-corrected','a','a1','FINAL'),('po-invalid','a','a1','FINAL')`);
      await tx.$executeRawUnsafe(`INSERT INTO "PurchaseOrderLine" VALUES ('ol1','po-explicit','order',2,12,12,3,'PACKAGE'),('ol2','po-corrected','order',2,12,20,0,'PACKAGE'),('ol3','po-invalid','invalid-order',2,0,12,0,'PACKAGE')`);
      await tx.$executeRawUnsafe(`INSERT INTO "StockMovement" VALUES ('correct-own','a1','order','PURCHASE_ORDER','po-corrected','PURCHASE_PACK_CORRECTION',.4,'2026-10-01'),('correct-sibling','a2','order','PURCHASE_ORDER','po-corrected','PURCHASE_PACK_CORRECTION',.001,'2026-10-04')`);

      let comparisonReads=0;
      const db={
        $queryRaw:async(strings,...values)=>{
          if(strings.join("").includes('FROM "PurchaseDocumentLine"'))comparisonReads++;
          return tx.$queryRaw(strings,...values);
        },
        $executeRaw:()=>{throw new Error("Comparison attempted a write");},
        store:{findUnique:async({where})=>(await tx.$queryRaw`SELECT "id","companyId" FROM "Store" WHERE "id"=${where.id}`)[0]||null},
        company:{findUnique:async({where})=>{
          const row=(await tx.$queryRaw`SELECT * FROM "Company" WHERE "id"=${where.id}`)[0];
          if(!row)return null;
          return {...row,subscriptionEndsAt:null,modules:(await tx.$queryRaw`SELECT "moduleKey","active" FROM "CompanyModule" WHERE "companyId"=${where.id}`).map(module=>({...module,startsAt:null,endsAt:null}))};
        }}
      };
      const moduleSource=await readFile(new URL("../src/middleware/module-access.js",import.meta.url),"utf8");
      const guards=new Function("prisma","ownerRestrictedModuleKeys",moduleSource.replace(/^import .*;\s*$/gm,"").replace(/^export /gm,"")+"\nreturn {requireCompanyModule,requireStoreModule};")(db,ownerRestrictedModuleKeys);
      const routeSource=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
      const registrations=[];
      const router=Object.fromEntries(["get","post","patch","put","delete","use"].map(method=>[method,(...args)=>registrations.push({method,args})]));
      new Function("Router","prisma","requireCompanyModule","requireStoreModule","buildSupplierPriceComparison","orderSuggestionsRouter",routeSource.replace(/^import .*;\s*$/gm,"").replace(/export default router;?/,""))(()=>router,db,guards.requireCompanyModule,guards.requireStoreModule,buildSupplierPriceComparison,express.Router());
      const route=registrations.find(row=>row.method==="get"&&row.args[0]==="/supplier-price-comparison");
      assert.ok(route,"Production comparison route must be registered");
      const users={owner:{role:"OWNER",companyId:"a"},admin:{role:"SUPER_ADMIN",companyId:"different-login-company"},operator:{role:"EMPLOYEE",tokenType:"STORE_OPERATOR",companyId:"a",storeId:"a1"}};
      const app=express();
      app.use((req,res,next)=>{req.user=users[req.get("x-fixture-user")];return req.user?next():res.status(401).json({error:"Fixture requires a signed-in context"});});
      app.get("/api/commerce/supplier-price-comparison",...route.args.slice(1));
      app.use((error,req,res,next)=>res.status(500).json({error:error.message}));
      const server=app.listen(0,"127.0.0.1");
      await once(server,"listening");
      const base=`http://127.0.0.1:${server.address().port}/api/commerce/supplier-price-comparison`;
      const request=async(store,user="owner")=>{
        const response=await fetch(base+(store===undefined?"":`?storeId=${encodeURIComponent(store)}`),{headers:{"x-fixture-user":user}});
        return {status:response.status,body:await response.json()};
      };
      const snapshot=async()=>Promise.all(Object.keys(tables).map(async name=>(await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,md5(string_agg(row_to_json(t)::text,',' ORDER BY "id")) AS digest FROM "${name}" t`))[0]));
      const before=await snapshot();
      try{
        await t.test("two suppliers, discounted package cost, weighted rows and distinct historical evidence",async()=>{
          const {status,body}=await request("a1");assert.equal(status,200,JSON.stringify(body));assert.equal(body.length,9);
          const find=(product,supplier)=>body.find(row=>row.productId===product&&row.supplierId===supplier);
          assert.equal(find("piece","s1").lastCost,1.5);assert.equal(find("piece","s1").bestCost,.8);
          assert.equal(find("piece","s1").lastDocumentId,"new");assert.equal(find("piece","s1").bestDocumentId,"old");assert.equal(find("piece","s1").purchaseCount,2);
          assert.equal(find("piece","s2").lastCost,.75);assert.equal(find("kg","s1").lastCost,8);assert.equal(find("kg","s1").baseUnit,"KG");
          assert.equal(find("kg","s2").lastCost,null);assert.equal(find("kg","s2").bestCost,6);assert.equal(find("kg","s2").lastDocumentId,"bad-unit");
          assert.equal(find("litre","s1").lastCost,2);assert.equal(find("litre","s1").baseUnit,"L");assert.equal(find("zero","s1").bestCost,null);
          assert.equal(body.some(row=>row.productId==="foreign-product"||row.supplierId==="foreign-supplier"),false);
        });
        await t.test("posted order cost includes excise, uses the selected-store correction and excludes invalid factors",async()=>{
          const {body}=await request("a1");
          const own=body.find(row=>row.productId==="order"&&row.supplierId==="s1");assert.equal(own.lastCost,.625);
          const corrected=body.find(row=>row.productId==="order"&&row.supplierId==="s2");assert.equal(corrected.lastCost,.4);assert.equal(corrected.evidenceId,"correct-own");
          assert.equal(body.find(row=>row.productId==="invalid-order").lastCost,null);
        });
        await t.test("real module guard rejects foreign stores, operator siblings, disabled modules and suspended licenses",async()=>{
          const cases=[["b1","owner",404,"TENANT_STORE_REJECTED"],["a2","operator",404,"TENANT_STORE_REJECTED"],["a-off","owner",403,"MODULE_DISABLED"],["c1","owner",404,"TENANT_STORE_REJECTED"],["missing","owner",404,null],[undefined,"owner",400,null]];
          for(const [store,user,status,code] of cases){const reads=comparisonReads;const result=await request(store,user);assert.equal(result.status,status,JSON.stringify(result.body));if(code)assert.equal(result.body.code,code);assert.equal(comparisonReads,reads,"Denied requests must not execute the price query");}
          // Test suspension in its own company, without modifying any entitlement.
          users.suspended={role:"OWNER",companyId:"c"};const reads=comparisonReads;
          const inactive=await request("c1","suspended");assert.equal(inactive.status,403);assert.equal(inactive.body.code,"LICENSE_INACTIVE");assert.equal(comparisonReads,reads);
        });
        await t.test("owner store selection and platform support read the target company without leaking other stores",async()=>{
          const sibling=await request("a2");assert.equal(sibling.status,200);assert.equal(sibling.body.length,1);assert.equal(sibling.body[0].lastCost,.001);assert.equal(sibling.body[0].lastDocumentId,"sibling");
          const own=await request("a1","admin");assert.equal(own.status,200);assert.equal(own.body.length,9);
          const foreign=await request("b1","admin");assert.equal(foreign.status,200);assert.equal(foreign.body.length,1);assert.equal(foreign.body[0].lastCost,7.77);assert.equal(foreign.body[0].productId,"foreign-product");
          assert.deepEqual(await snapshot(),before,"Comparison GETs must leave all temporary fixture rows unchanged");
        });
      }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    },{timeout:40000});
  }finally{await prisma.$disconnect();}
});
