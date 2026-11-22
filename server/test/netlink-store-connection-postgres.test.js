import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test("native migration and HTTP: encrypted store settings, atomic audit, tenant/role guards and non-issuing check",{skip:!isolated()},async t=>{
  const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="netlink_connection_"+randomUUID().replaceAll("-","");
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
  const oldKey=process.env.INTEGRATION_CREDENTIALS_KEY;process.env.INTEGRATION_CREDENTIALS_KEY="synthetic-netlink-native-key";
  let server;const providerCalls=[];
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe('CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text,"name" text,"active" boolean)');
    await db.$executeRawUnsafe('CREATE TABLE "AuthAudit"("id" text PRIMARY KEY,"userId" text,"email" text CHECK ("email" <> \'reject-audit\'),"event" text,"success" boolean,"deviceName" text,"userAgent" text,"ipAddress" text,"createdAt" timestamp DEFAULT now())');
    const migration=await readFile(new URL("../prisma/migrations/20261118140000_netlink_store_connection/migration.sql",import.meta.url),"utf8");
    await db.$executeRawUnsafe(migration);
    await db.$executeRaw`INSERT INTO "StoreIntegrationCredential" ("id","companyId","storeId","kind","providerName","credentialsEnc") VALUES ('old-mydata','company','A','MYDATA','Existing myDATA','unchanged-mydata'),('old-efood','company','A','EFOOD','Existing efood','unchanged-efood')`;
    await db.$executeRawUnsafe(migration);
    const preserved=await db.$queryRaw`SELECT "id","credentialsEnc" FROM "StoreIntegrationCredential" ORDER BY "id"`;
    await db.$executeRaw`INSERT INTO "Store" VALUES('A','company','LAB A',true),('B','company','LAB B',true),('foreign','other','FOREIGN',true),('inactive','company','INACTIVE',false)`;
    const express=(await import("express")).default,{createPlatformNetlinkConnectionsRouter}=await import("../src/routes/platform-netlink-connections.js");
    let failProvider=false;
    const app=express();app.use(express.json());app.use((req,res,next)=>{const role=req.headers["x-test-role"];req.user={id:"fixture",email:req.headers["x-test-email"]||"fixture@example.invalid",isSuperAdmin:role==="SUPER_ADMIN",role};next()});
    app.use(createPlatformNetlinkConnectionsRouter(db,{provider:config=>({menu:async()=>{providerCalls.push(config);if(failProvider)throw Error("provider-echoes-secret-password");return {groups:[]}}})}));
    app.use((error,req,res,next)=>res.status(error.status||(error.name==="ZodError"?400:500)).json({error:error.message,code:error.code}));
    server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const request=async(store="A",method="GET",body,role="SUPER_ADMIN",email)=>{
      const path=store.includes("/")?store:`/companies/company/stores/${store}/netlink-connection`;
      const response=await fetch(base+path,{method,headers:{"Content-Type":"application/json","x-test-role":role,...(email?{"x-test-email":email}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,cache:response.headers.get("cache-control"),body:await response.json()};
    };
    const credentials={username:"alice",password:"store-A-secret",stationId:"station-A"};
    assert.equal((await request("A")).body.connection.configured,false);
    for(const role of ["","OWNER","ADMIN","MANAGER","EMPLOYEE","STORE_OPERATOR"]){
      for(const [method,suffix,body] of [["GET","",undefined],["PUT","",credentials],["PATCH","/status",{enabled:false}],["POST","/check",{}]])assert.equal((await request(`/companies/company/stores/A/netlink-connection${suffix}`,method,body,role)).status,403);
    }
    for(const store of ["foreign","inactive","missing"]){assert.equal((await request(store,"PUT",credentials)).status,404)}
    assert.equal((await request("/companies/other/stores/A/netlink-connection","PUT",credentials)).status,404);
    assert.equal((await request("/companies/customer-demo-reserved/stores/A/netlink-connection","PUT",credentials)).status,403);
    const saved=await request("A","PUT",credentials);assert.equal(saved.status,200);assert.equal(saved.cache,"no-store");assert.equal(saved.body.connection.enabled,false);assert.equal(saved.body.connection.stationId,"station-A");assert.doesNotMatch(JSON.stringify(saved.body),/alice|store-A-secret|credentialsEnc/);
    assert.equal((await request("B")).body.connection.configured,false);
    let rows=await db.$queryRaw`SELECT * FROM "StoreIntegrationCredential" WHERE "kind"='NETLINK'`;assert.equal(rows.length,1);assert.ok(!rows[0].credentialsEnc.includes(credentials.password));const originalCipher=rows[0].credentialsEnc;
    assert.equal((await request("A","PUT",{...credentials,password:""})).status,400);
    assert.equal((await request("A","PUT",{...credentials,username:"new"},"SUPER_ADMIN","reject-audit")).status,500);
    rows=await db.$queryRaw`SELECT * FROM "StoreIntegrationCredential" WHERE "kind"='NETLINK'`;assert.equal(rows[0].credentialsEnc,originalCipher);
    const check=await request("/companies/company/stores/A/netlink-connection/check","POST",{});assert.equal(check.status,200);assert.equal(check.body.check,"AUTH_AND_CATALOGUE");assert.equal(check.body.storeIdentityVerified,false);assert.equal(providerCalls.length,1);assert.equal(providerCalls[0].password,credentials.password);assert.equal(providerCalls[0].storeId,"A");
    failProvider=true;const failed=await request("/companies/company/stores/A/netlink-connection/check","POST",{});assert.equal(failed.status,502);assert.doesNotMatch(JSON.stringify(failed.body),/provider-echoes|store-A-secret/);
    assert.equal((await request("/companies/company/stores/A/netlink-connection/status","PATCH",{enabled:false})).status,200);
    const count=providerCalls.length;const {createNetlinkConnectionStore}=await import("../src/integrations/netlink/store-connection.js");await assert.rejects(createNetlinkConnectionStore(db).credentials({companyId:"company",storeId:"A"}),e=>e.code==="NETLINK_STORE_NOT_CONFIGURED");assert.equal(providerCalls.length,count);
    failProvider=false;assert.equal((await request("/companies/company/stores/A/netlink-connection/check","POST",{})).status,200);
    assert.equal((await request("A","PUT",{username:"replacement",password:"replacement-secret",stationId:"new-station",enabled:false})).status,200);
    assert.equal((await request("/companies/company/stores/A/netlink-connection/status","PATCH",{enabled:true})).status,200);
    failProvider=false;assert.equal((await request("/companies/company/stores/A/netlink-connection/check","POST",{})).body.stationId,"new-station");assert.equal(providerCalls.at(-1).username,"replacement");
    assert.equal((await request("B","PUT",{username:"bob",password:"B-secret",stationId:"B-station"})).status,200);
    assert.equal((await request("/companies/company/stores/B/netlink-connection/check","POST",{})).body.stationId,"B-station");assert.equal(providerCalls.at(-1).username,"bob");
    const afterOther=await db.$queryRaw`SELECT "id","credentialsEnc" FROM "StoreIntegrationCredential" WHERE "kind"<>'NETLINK' ORDER BY "id"`;assert.deepEqual(afterOther,preserved);
    const {STORE_INTEGRATION_KIND_CONSTRAINT_SQL}=await import("../src/store-integration-bootstrap.js");await db.$executeRawUnsafe(STORE_INTEGRATION_KIND_CONSTRAINT_SQL);
    assert.equal((await request("/companies/company/stores/B/netlink-connection/check","POST",{})).status,200);
    const audits=await db.$queryRaw`SELECT * FROM "AuthAudit"`;assert.equal(audits.length,5);assert.doesNotMatch(JSON.stringify(audits),/store-A-secret|replacement-secret|B-secret/);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();oldKey===undefined?delete process.env.INTEGRATION_CREDENTIALS_KEY:process.env.INTEGRATION_CREDENTIALS_KEY=oldKey;
  }
});
