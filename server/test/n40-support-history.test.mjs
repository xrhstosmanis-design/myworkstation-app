import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createN40SupportHistoryHandler,N40_SUPPORT_HISTORY} from "../src/services/n40-support-history.mjs";
import {N40_FIXTURE} from "../../shared/n40-backoffice-fixture.mjs";

const actor={id:"own-actor",isSuperAdmin:true,tokenType:"BACKOFFICE_USER"};
function fixture(rows=[]){
  const calls=[];let result,error,cache;
  const prisma={store:{findUnique:async args=>{calls.push(["store",args]);return {active:true,name:"ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ",companyId:N40_FIXTURE.companyId,company:{active:true,name:"MYWORKSTATION LAB"}};}},authAudit:{findMany:async args=>{calls.push(["audit",args]);return rows;}}};
  return {calls,prisma,run:async(user=actor,query={},body={})=>{await createN40SupportHistoryHandler({prisma})({user,query,body},{set:(k,v)=>{cache=[k,v]},json:v=>{result=v}},e=>{error=e});return{result,error,cache};}};
}
test("only canonical Super Admin can read, with no DB observation on rejection",async()=>{
  for(const user of [null,{...actor,isSuperAdmin:false},{...actor,tokenType:"EMPLOYEE"},{...actor,supportContext:{companyId:N40_FIXTURE.companyId}},{...actor,id:null}]){const f=fixture();const r=await f.run(user);assert.equal(r.error.status,403);assert.equal(f.calls.length,0);}
});
test("no caller-controlled actor, time, label or body scope",async()=>{
  for(const [query,body] of [[{userId:"foreign"},{}],[{start:"2020"},{}],[{storeId:"foreign"},{}],[{}, {label:"foreign"}]]){const f=fixture();assert.equal((await f.run(actor,query,body)).error.status,400);assert.equal(f.calls.length,0);}
});
test("inactive or wrong LAB blocks historical observation",async()=>{
  for(const store of [null,{active:false},{active:true,name:"foreign",companyId:N40_FIXTURE.companyId,company:{active:true,name:"MYWORKSTATION LAB"}}]){const f=fixture();f.prisma.store.findUnique=async()=>store;assert.equal((await f.run()).error.status,409);assert.equal(f.calls.length,0);}
});
test("bounded fixed query is own actor and label; projects no personal/credential data",async()=>{
  const f=fixture([{event:"SUPER_ADMIN_SUPPORT_EXIT",createdAt:"2026-10-10T12:26:00Z",success:true,ipAddress:"sensitive",email:"private",token:"secret",deviceName:"extra"}]);
  const r=await f.run();assert.equal(r.error,undefined);assert.deepEqual(r.cache,["Cache-Control","no-store"]);
  const q=f.calls.find(x=>x[0]==="audit")[1];assert.equal(q.where.userId,actor.id);assert.equal(q.where.deviceName,N40_SUPPORT_HISTORY.deviceLabel);assert.equal(q.where.success,true);assert.deepEqual(q.where.event.in,["SUPER_ADMIN_SUPPORT_ACCESS","SUPER_ADMIN_SUPPORT_EXIT"]);assert.equal(q.where.createdAt.gte.toISOString(),N40_SUPPORT_HISTORY.start);assert.equal(q.where.createdAt.lt.toISOString(),N40_SUPPORT_HISTORY.end);assert.equal(q.take,201);assert.deepEqual(q.select,{event:true,createdAt:true,success:true});
  assert.deepEqual(r.result.records,[{event:"SUPER_ADMIN_SUPPORT_EXIT",time:"2026-10-10T12:26:00.000Z",success:true}]);assert.equal(r.result.truncated,false);assert.doesNotMatch(JSON.stringify(r.result),/sensitive|private|secret/);assert.match(r.result.attribution,/No automatic PASS/);
});
test("empty history is explicit, never inferred PASS",async()=>{const r=await fixture().run();assert.deepEqual(r.result.records,[]);assert.equal(r.result.truncated,false);});
test("overflow is visibly incomplete and bounded",async()=>{const row={event:"SUPER_ADMIN_SUPPORT_ACCESS",createdAt:"2026-10-10T12:10:00Z",success:true};const r=await fixture(Array(201).fill(row)).run();assert.equal(r.result.records.length,200);assert.equal(r.result.truncated,true);});
test("route retains existing auth and diagnostic is GET-only",()=>{
 const route=readFileSync(new URL("../src/routes/auth.js",import.meta.url),"utf8");assert.match(route,/router\.get\("\/security\/n40-stock-support-history",auth,createN40SupportHistoryHandler/);assert.doesNotMatch(route,/router\.(post|put|patch|delete)\("\/security\/n40-stock-support-history"/);
});
