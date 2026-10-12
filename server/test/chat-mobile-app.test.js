
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import {chatManifest,chatHtmlWithManifest} from "../src/chat-pwa.mjs";
import {chatWorkerOptions,mobileChatUrl} from "../../client/src/components/store/chat-mobile-install.mjs";
function mobile(db){
 const source=fs.readFileSync(new URL("../src/chat-mobile.mjs",import.meta.url),"utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
 return new Function("prisma","companyModuleState","effectiveModuleEnabled","isPlatformSuperAdmin","assertCustomerDemoOutboundAllowed",source+";return {saveMobilePush,mobilePushRecipients,mobileChatStores,validateMobileSubscription};")(db,async()=>({licenseAllowed:true,activeModules:["STORE_CHAT"]}),(active,row)=>row.configured?row.active:active,u=>u.role==="SUPER_ADMIN",()=>{});
}
function operator(db){
 const source=fs.readFileSync(new URL("../src/chat-operator-auth.mjs",import.meta.url),"utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
 return new Function("prisma","crypto",source+";return {authorizeChatOperator,chatCredentialStamp};")(db,crypto);
}
test("all stores install one stable app and root worker, without private manifest data",()=>{
 const manifest=chatManifest("A");assert.deepEqual(chatManifest("B"),manifest);assert.equal(manifest.id,"/chat/");assert.equal(manifest.start_url,"/chat/");assert.equal(manifest.scope,"/chat/");assert.equal(manifest.display,"standalone");
 const html=chatHtmlWithManifest('<link rel="manifest" href="/manifest.webmanifest"><script>navigator.serviceWorker.register("/sw.js")</script>');
 assert.match(html,/href="\/chat\/manifest.webmanifest"/);assert.match(html,/register\("\/chat\/sw.js",\{scope:"\/chat\/"\}\)/);
 for(const path of ["/chat/","/chat/A/","/chat/B"])assert.deepEqual(chatWorkerOptions(path,"A"),{url:"/chat/sw.js",scope:"/chat/"});
 assert.deepEqual(chatWorkerOptions("/store/A","A"),{url:"/sw.js",scope:"/"});assert.equal(mobileChatUrl(),"/chat/");
});
test("Chat operator token cannot authorize POS, another store or malformed scope; PIN/role/revocation revalidated",async()=>{
 let reads=0;const row={id:"op",employeeId:"employee",companyId:"company",storeId:"A",role:"EMPLOYEE",displayName:"Virtual",pinHash:"old",cardCodeHash:null};
 const db={$queryRawUnsafe:async()=>{reads++;return [row]}},lib=operator(db);
 const payload={...row,iss:"myworkstation-chat",aud:"store-chat-only",chatSessionId:"session",credentialStamp:lib.chatCredentialStamp(row,"test-secret")};
 for(const path of ["/api/sales","/api/operators/me","/api/store-chat/mobile/stores","/api/store-chat/stores/B/messages","/api/store-chat/stores/%XX/messages"])assert.equal(await lib.authorizeChatOperator({originalUrl:path},payload,{db,secret:"test-secret"}),null);
 assert.equal(reads,0);
 const user=await lib.authorizeChatOperator({originalUrl:"/api/store-chat/stores/A/messages"},payload,{db,secret:"test-secret"});assert.deepEqual(user.permissions,["STORE_CHAT"]);assert.equal(user.pinHash,undefined);
 row.pinHash="changed";assert.equal(await lib.authorizeChatOperator({originalUrl:"/api/store-chat/stores/A/messages"},payload,{db,secret:"test-secret"}),null);row.pinHash="old";row.role="MANAGER";assert.equal(await lib.authorizeChatOperator({originalUrl:"/api/store-chat/stores/A/messages"},payload,{db,secret:"test-secret"}),null);
 assert.equal(await lib.authorizeChatOperator({originalUrl:"/api/store-chat/stores/A/messages"},payload,{db:{$queryRawUnsafe:async()=>[]},secret:"test-secret"}),null);
 await assert.rejects(lib.authorizeChatOperator({originalUrl:"/api/store-chat/stores/A/messages"},payload,{db:{$queryRawUnsafe:async()=>{throw new Error("db unavailable")}},secret:"test-secret"}),/db unavailable/);
});
test("one owner endpoint derives all authorized stores; transaction retires old identity; client stores ignored",async()=>{
 const calls=[],db={user:{findUnique:async()=>({companyId:"C1"})},store:{findMany:async({where})=>{assert.deepEqual(where.companyId.in,["C1","C2"]);return [{id:"A",name:"A",companyId:"C1",company:{name:"One"}},{id:"B",name:"B",companyId:"C2",company:{name:"Two"}}]}},$queryRawUnsafe:async sql=>sql.includes("OwnerCompanyAccess")?[{companyId:"C2"}]:[],$executeRawUnsafe:async()=>{},$transaction:async fn=>fn({$queryRawUnsafe:async(...a)=>calls.push(a),$executeRawUnsafe:async(...a)=>calls.push(a)})};
 const lib=mobile(db),user={id:"owner",role:"OWNER",tokenType:"BACKOFFICE_USER",companyId:"C1",sessionId:"session",sessionVersion:1},subscription={endpoint:"https://web.push.apple.com/virtual",keys:{p256dh:"abcdefghijklmnop",auth:"abcdefghijklmnop"},storeIds:["FOREIGN"]};
 assert.deepEqual(await lib.saveMobilePush(user,subscription),{stores:2});assert.match(calls[0][0],/pg_advisory_xact_lock/);assert.match(calls[1][0],/DELETE FROM "StoreChatPushSubscription"/);assert.equal(calls[2][7],'["A","B"]');assert.ok(!calls[2].includes("FOREIGN"));
 await assert.rejects(lib.mobileChatStores({...user,tokenType:"STORE_OPERATOR"}),e=>e.status===403);
 for(const endpoint of ["https://evil.example/private","http://web.push.apple.com/id","https://web.push.apple.com.evil.example/id","https://user:pass@web.push.apple.com/id"])assert.throws(()=>lib.validateMobileSubscription({...subscription,endpoint}));
});
function worker(scope,windows=[]){
 const handlers={},opened=[],posts=[],focused=[],cached=[];
 const clients={matchAll:async()=>windows.map(w=>({...w,postMessage:data=>posts.push({id:w.id,data}),focus:async()=>focused.push(w.id)})),openWindow:async url=>opened.push(url)};
 const self={location:{origin:"https://virtual.example"},registration:{scope:"https://virtual.example"+scope,showNotification:async()=>{}},clients,skipWaiting(){},addEventListener:(t,fn)=>handlers[t]=fn};
 const caches={open:async()=>({add:async path=>cached.push(path)}),match:async path=>{cached.push(path);return "PUBLIC_OFFLINE"}};
 vm.runInNewContext(fs.readFileSync(new URL("../../client/public/sw.js",import.meta.url),"utf8"),{self,clients,URL,caches,fetch:async()=>{throw new Error("offline")}});
 return {handlers,opened,posts,focused,cached};
}
test("single app notification opens B in existing A chat without touching POS",async()=>{
 const h=worker("/chat/",[{id:"pos",url:"https://virtual.example/store/B"},{id:"chat",url:"https://virtual.example/chat/A/"}]);let work;h.handlers.notificationclick({notification:{data:{url:"/chat/B/"},close(){}},waitUntil:p=>work=p});await work;assert.deepEqual(h.focused,["chat"]);assert.equal(h.posts[0].data.storeId,"B");assert.equal(h.opened.length,0);
});
test("worker caches only public offline page; API and media never use cached data",async()=>{
 const h=worker("/chat/");let work;h.handlers.install({waitUntil:p=>work=p});await work;assert.deepEqual(h.cached,["/chat-offline.html"]);
 for(const path of ["/api/store-chat/stores/A/messages","/api/store-chat/stores/A/messages/x/attachment"]){let intercepted=false;h.handlers.fetch({request:{method:"GET",url:"https://virtual.example"+path,mode:"cors"},respondWith(){intercepted=true}});assert.equal(intercepted,false)}
 h.handlers.fetch({request:{method:"GET",url:"https://virtual.example/chat/A/",mode:"navigate"},respondWith:p=>work=p});assert.equal(await work,"PUBLIC_OFFLINE");assert.deepEqual(h.cached,["/chat-offline.html","/chat-offline.html"]);
});

const isolated=()=>{try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(url.hostname)&&/test/i.test(url.pathname)}catch{return false}};
test("native PostgreSQL multi-store recipients stop after ownership, role, session or module revocation",{skip:!isolated()},async()=>{
 const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="chat_mobile_"+crypto.randomBytes(6).toString("hex"),url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);
 await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 try{
  for(const ddl of [
   'CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"role" TEXT,"sessionVersion" INTEGER)',
   'CREATE TABLE "UserSession" ("id" TEXT PRIMARY KEY,"userId" TEXT,"revokedAt" TIMESTAMPTZ)',
   'CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"active" BOOLEAN)',
   'CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"active" BOOLEAN)',
   'CREATE TABLE "OwnerCompanyAccess" ("ownerId" TEXT,"companyId" TEXT)',
   'CREATE TABLE "StorePaidModule" ("storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ)',
   'CREATE TABLE "Employee" ("id" TEXT PRIMARY KEY,"active" BOOLEAN)',
   'CREATE TABLE "StoreOperatorCredential" ("id" TEXT PRIMARY KEY,"employeeId" TEXT,"companyId" TEXT,"storeId" TEXT,"role" TEXT,"displayName" TEXT,"pinHash" TEXT,"cardCodeHash" TEXT,"active" BOOLEAN)'
  ])await db.$executeRawUnsafe(ddl);
  const lib=mobile(db);
  await db.$executeRawUnsafe('INSERT INTO "Company" VALUES ($1,TRUE),($2,TRUE)',"C1","C2");
  await db.$executeRawUnsafe('INSERT INTO "Store" VALUES ($1,$2,TRUE),($3,$4,TRUE)',"A","C1","B","C2");
  await db.$executeRawUnsafe('INSERT INTO "User" VALUES ($1,$2,$3,1),($4,$5,$3,1)',"owner","C1","OWNER","foreign","OTHER");
  await db.$executeRawUnsafe('INSERT INTO "UserSession" VALUES ($1,$2,NULL),($3,$4,NULL)',"session","owner","foreignsession","foreign");
  await db.$executeRawUnsafe('INSERT INTO "OwnerCompanyAccess" VALUES ($1,$2)',"owner","C2");
  await lib.mobilePushRecipients({id:"A",companyId:"C1"},"sender"); // runs actual additive schema
  for(const [endpoint,userId,sessionId] of [["https://web.push.apple.com/owner","owner","session"],["https://web.push.apple.com/foreign","foreign","foreignsession"]])await db.$executeRawUnsafe('INSERT INTO "StoreChatMobilePush" ("endpoint","userId","role","sessionId","sessionVersion","storeIds","subscriptionJson") VALUES ($1,$2,$3,$4,1,$5::jsonb,$6::jsonb)',endpoint,userId,"OWNER",sessionId,'["A","B"]',JSON.stringify({endpoint}));
  const credentials={id:"op",employeeId:"employee",companyId:"C1",storeId:"A",role:"EMPLOYEE",displayName:"Virtual",pinHash:"hash",cardCodeHash:null};
  await db.$executeRawUnsafe('INSERT INTO "Employee" VALUES ($1,TRUE)',credentials.employeeId);
  await db.$executeRawUnsafe('INSERT INTO "StoreOperatorCredential" VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,TRUE)',credentials.id,credentials.employeeId,credentials.companyId,credentials.storeId,credentials.role,credentials.displayName,credentials.pinHash);
  await db.$executeRawUnsafe('INSERT INTO "StoreChatMobileSession" ("id","operatorId","companyId","storeId","expiresAt") VALUES ($1,$2,$3,$4,NOW()+INTERVAL \'12 hours\')',"staffsession","op","C1","A");
  const auth=operator(db),payload={...credentials,iss:"myworkstation-chat",aud:"store-chat-only",chatSessionId:"staffsession",credentialStamp:auth.chatCredentialStamp(credentials,"secret")};
  const staff=()=>auth.authorizeChatOperator({originalUrl:"/api/store-chat/stores/A/messages"},payload,{db,secret:"secret"});
  assert.equal((await staff()).storeId,"A");
  await db.$executeRawUnsafe('UPDATE "StoreChatMobileSession" SET "expiresAt"=NOW()-INTERVAL \'1 second\'');assert.equal(await staff(),null);
  await db.$executeRawUnsafe('UPDATE "StoreChatMobileSession" SET "expiresAt"=NOW()+INTERVAL \'12 hours\',"revokedAt"=NOW()');assert.equal(await staff(),null);
  await db.$executeRawUnsafe('UPDATE "StoreChatMobileSession" SET "revokedAt"=NULL');await db.$executeRawUnsafe('UPDATE "StoreOperatorCredential" SET "pinHash"=$1',"changed");assert.equal(await staff(),null);
  await db.$executeRawUnsafe('UPDATE "StoreOperatorCredential" SET "pinHash"=$1,"active"=FALSE',"hash");assert.equal(await staff(),null);
  const recipients=async(store="B",sender="sender")=>(await lib.mobilePushRecipients({id:store,companyId:store==="A"?"C1":"C2"},sender)).map(r=>r.endpoint);
  assert.deepEqual(await recipients(),["https://web.push.apple.com/owner"]);assert.deepEqual(await recipients("A"),["https://web.push.apple.com/owner"]);assert.deepEqual(await recipients("A","owner"),[]);
  await db.$executeRawUnsafe('DELETE FROM "OwnerCompanyAccess"');assert.deepEqual(await recipients(),[]);assert.equal((await recipients("A")).length,1);
  await db.$executeRawUnsafe('UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"=$1',"session");assert.deepEqual(await recipients("A"),[]);
  await db.$executeRawUnsafe('UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"=$1',"session");await db.$executeRawUnsafe('UPDATE "User" SET "sessionVersion"=2 WHERE "id"=$1',"owner");assert.deepEqual(await recipients("A"),[]);
  await db.$executeRawUnsafe('UPDATE "User" SET "sessionVersion"=1,"role"=$1 WHERE "id"=$2',"EMPLOYEE","owner");assert.deepEqual(await recipients("A"),[]);
  await db.$executeRawUnsafe('UPDATE "User" SET "role"=$1 WHERE "id"=$2',"OWNER","owner");
  await db.$executeRawUnsafe('CREATE TABLE "StoreChatPushSubscription" ("endpoint" TEXT PRIMARY KEY)');
  const endpoint="https://web.push.apple.com/transition";
  await db.$executeRawUnsafe('INSERT INTO "StoreChatPushSubscription" VALUES ($1)',endpoint);
  const wrapped=new Proxy(db,{get(target,key){
   if(key==="user")return {findUnique:async()=>({companyId:"C1"})};
   if(key==="store")return {findMany:async({where})=>(await target.$queryRawUnsafe('SELECT "id","companyId" FROM "Store" WHERE "companyId"=ANY($1::text[])',where.companyId.in)).map(row=>({...row,name:row.id,company:{name:row.companyId}}))};
   const value=target[key];return typeof value==="function"?value.bind(target):value;
  }});
  // Store counts are independent of UI-supplied store IDs; native lock/delete/upsert executes here.
  await db.$executeRawUnsafe('CREATE TABLE "StoreChatMessage" ("storeId" TEXT,"companyId" TEXT,"id" TEXT,"senderId" TEXT)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreChatRead" ("messageId" TEXT,"userId" TEXT)');
  await mobile(wrapped).saveMobilePush({id:"owner",companyId:"C1",role:"OWNER",tokenType:"BACKOFFICE_USER",sessionId:"session",sessionVersion:1},{endpoint,storeIds:["FOREIGN"],keys:{p256dh:"abcdefghijklmnop",auth:"abcdefghijklmnop"}});
  assert.equal((await db.$queryRawUnsafe('SELECT * FROM "StoreChatPushSubscription" WHERE "endpoint"=$1',endpoint)).length,0);
  const mapping=(await db.$queryRawUnsafe('SELECT "userId","storeIds" FROM "StoreChatMobilePush" WHERE "endpoint"=$1',endpoint))[0];assert.equal(mapping.userId,"owner");assert.deepEqual(mapping.storeIds,["A"]);
  await db.$executeRawUnsafe('INSERT INTO "StorePaidModule" ("storeId","moduleKey","active") VALUES ($1,$2,FALSE)',"A","STORE_CHAT");assert.deepEqual(await recipients("A"),[]);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.$disconnect()}
});

test("app session remains separate from POS and legacy links never silently broaden stores",()=>{
 const map=new Map(),localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},sessionStorage={getItem:()=>null};
 const source=fs.readFileSync(new URL("../../client/src/components/store/chat-mobile-session.mjs",import.meta.url),"utf8").replace(/^export /gm,"");
 const helper=new Function("localStorage","sessionStorage","atob","TextDecoder",source+";return {chatSession,chatToken,saveChatSession,clearChatSession};")(localStorage,sessionStorage,atob,TextDecoder);
 const legacy="header."+Buffer.from(JSON.stringify({tokenType:"STORE_OPERATOR",storeId:"A",companyId:"C1",fullName:"Χειριστής"})).toString("base64url")+".signature";
 map.set("token",legacy);assert.equal(helper.chatSession().user.store.id,"A");assert.equal(helper.chatSession().user.legacy,true);assert.equal(helper.chatSession().user.fullName,"Χειριστής");
 helper.saveChatSession({token:"owner-token",user:{id:"owner"}});assert.equal(helper.chatToken(),"owner-token");assert.equal(map.get("token"),legacy);
 helper.clearChatSession();assert.equal(helper.chatSession(),null);assert.equal(helper.chatToken(),"");assert.equal(map.get("token"),legacy);
});
