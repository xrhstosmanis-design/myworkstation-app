import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import {createChatStaffInvitation,mayInviteToChat} from "../src/chat-staff-invitation.mjs";

const context={company:{id:"C"},store:{id:"A",companyId:"C",name:"Κατάστημα Α"}};
const employee={id:"W",companyId:"C",legacyEmployeeId:"E",baseStoreId:"A",fullName:"Υπάλληλος",active:true,storeAccess:[]};
function deps(overrides={}){
  return {contextFor:async req=>{if(req.user.role!=="SUPER_ADMIN"&&req.user.companyId!=="C")throw Object.assign(new Error("Δεν βρέθηκε κατάστημα"),{status:404});return context},loadEmployee:async()=>employee,chatEnabled:async()=>true,companyModuleState:async()=>({licenseAllowed:true,activeModules:["STORE_MODE"]}),effectiveModuleEnabled:(enabled,row)=>row.configured?row.active:enabled,db:{store:{findFirst:async()=>({id:"A"})},$queryRaw:async parts=>parts.join("").includes("StorePaidModule")?[]:[{displayName:"Χειριστής Α"}]},...overrides};
}
async function invoke(dependencies,user={role:"OWNER",companyId:"C",tokenType:"BACKOFFICE_USER"}){
  let status=200,payload,headers={};
  await createChatStaffInvitation(dependencies)({user,params:{employeeId:"W"}}, {set:(k,v)=>{headers[k]=v},status:s=>({json:p=>{status=s;payload=p}}),json:p=>{payload=p}},e=>{status=e.status||500;payload={error:e.message}});
  return {status,payload,headers};
}
test("Owner and Super Admin prepare only a public store Chat path; no credentials in payload",async()=>{
  for(const user of [{role:"OWNER",companyId:"C"},{role:"SUPER_ADMIN",companyId:"other"}]){
    const r=await invoke(deps(),user);assert.equal(r.status,200);assert.equal(r.payload.chatPath,"/chat/A/");assert.equal(r.payload.operatorName,"Χειριστής Α");assert.equal(r.headers["Cache-Control"],"no-store, private");assert.doesNotMatch(JSON.stringify(r.payload),/pin|hash|token|cardCode|employee=/i);
  }
});
test("restricted roles and operator/mobile tokens denied before any data read",async()=>{
  for(const user of [{role:"ADMIN"},{role:"MANAGER"},{role:"EMPLOYEE"},{role:"OWNER",tokenType:"STORE_OPERATOR"},{role:"SUPER_ADMIN",tokenType:"STORE_CHAT_OPERATOR"}]){
    assert.equal(mayInviteToChat(user),false);assert.equal((await invoke(deps({contextFor:()=>{throw new Error("must not read")}}),user)).status,403);
  }
});
test("foreign tenant, wrong employee/store, inactive employee and missing credential fail closed",async()=>{
  assert.equal((await invoke(deps(),{role:"OWNER",companyId:"foreign"})).status,404);
  for(const change of [{active:false},{baseStoreId:"B"},{legacyEmployeeId:null}]){
    const r=await invoke(deps({loadEmployee:async()=>({...employee,...change})}));assert.ok([404,409].includes(r.status));assert.equal(r.payload.chatPath,undefined);
  }
  const d=deps();d.db.$queryRaw=async()=>[];assert.equal((await invoke(d)).status,409);
});
test("inactive store, Chat and Store Mode are denied even for Super Admin",async()=>{
  const user={role:"SUPER_ADMIN"};
  const d=deps();d.db.store.findFirst=async()=>null;assert.equal((await invoke(d,user)).status,404);
  assert.equal((await invoke(deps({chatEnabled:async()=>false}),user)).status,403);
  assert.equal((await invoke(deps({companyModuleState:async()=>({licenseAllowed:false,activeModules:[]})}),user)).status,403);
  const off=deps();off.db.$queryRaw=async p=>p.join("").includes("StorePaidModule")?[{active:false}]:[{displayName:"A"}];assert.equal((await invoke(off,user)).status,403);
});
test("actual personnel router registers the read-only invitation handler and bootstrap role capability",()=>{
  const route=fs.readFileSync(new URL("../src/routes/platform-workforce-v2-employees.js",import.meta.url),"utf8");
  assert.match(route,/router\.get\("\/:employeeId\/chat-invitation",createChatStaffInvitation\(\{db:prisma,contextFor,loadEmployee,chatEnabled,companyModuleState,effectiveModuleEnabled\}\)\)/);
  assert.match(fs.readFileSync(new URL("../src/routes/platform-workforce-v2.js",import.meta.url),"utf8"),/chatInvitations:mayInviteToChat\(req.user\)/);
});
test("HTTP handler returns no-store public link and rejects unauthorized role",async()=>{
  const app=express();app.get("/invite",(req,res,next)=>{req.user={role:req.query.role||"OWNER",companyId:"C"};next()},createChatStaffInvitation(deps()));
  const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
  try{const base=`http://127.0.0.1:${server.address().port}/invite`;const ok=await fetch(base);assert.equal(ok.status,200);assert.match(ok.headers.get("cache-control"),/no-store/);assert.equal((await ok.json()).chatPath,"/chat/A/");assert.equal((await fetch(base+"?role=EMPLOYEE")).status,403)}finally{await new Promise(r=>server.close(r))}
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test("native credential query excludes wrong store/company, inactive credentials/employee and missing PIN",{skip:!isolated()},async()=>{
  const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="chat_invite_"+crypto.randomBytes(6).toString("hex"),url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
  try{
    await db.$executeRawUnsafe('CREATE TABLE "StorePaidModule" ("storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP)');
    await db.$executeRawUnsafe('CREATE TABLE "Employee" ("id" TEXT,"storeId" TEXT,"active" BOOLEAN)');
    await db.$executeRawUnsafe('CREATE TABLE "StoreOperatorCredential" ("employeeId" TEXT,"companyId" TEXT,"storeId" TEXT,"displayName" TEXT,"pinHash" TEXT,"active" BOOLEAN)');
    await db.$executeRawUnsafe('INSERT INTO "Employee" VALUES ($1,$2,TRUE)',"E","A");
    await db.$executeRawUnsafe('INSERT INTO "StoreOperatorCredential" VALUES ($1,$2,$3,$4,$5,TRUE)',"E","C","A","Native operator","secret-hash");
    const d=deps({db:{$queryRaw:db.$queryRaw.bind(db),store:{findFirst:async()=>({id:"A"})}}});assert.equal((await invoke(d)).status,200);
    for(const sql of ['UPDATE "StoreOperatorCredential" SET "storeId"=\'B\'','UPDATE "StoreOperatorCredential" SET "storeId"=\'A\',"companyId"=\'foreign\'','UPDATE "StoreOperatorCredential" SET "companyId"=\'C\',"active"=FALSE','UPDATE "StoreOperatorCredential" SET "active"=TRUE,"pinHash"=NULL']){await db.$executeRawUnsafe(sql);assert.equal((await invoke(d)).status,409)}
    await db.$executeRawUnsafe('UPDATE "StoreOperatorCredential" SET "pinHash"=\'secret-hash\'');await db.$executeRawUnsafe('UPDATE "Employee" SET "active"=FALSE');assert.equal((await invoke(d)).status,409);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
