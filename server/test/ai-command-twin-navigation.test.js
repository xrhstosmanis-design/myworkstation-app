import test from "node:test";
import assert from "node:assert/strict";
import {resolveTwinContext,withTwinScope,guardTwinRequest,twinScopeKey,rememberTwinReturn,readTwinReturn,consumeTwinReturn,clearTwinReturn,TWIN_RETURN_KEY,TWIN_RETURN_MAX_AGE_MS} from "../../client/src/components/platform/ai-command-twin-navigation.js";
const scope={companyId:"company-b",storeId:"store-b"};
const storage=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
test("N40 destination context requires the exact existing company/store pair",()=>{
 const company={id:"company-b",stores:[{id:"store-b"}]};
 assert.equal(resolveTwinContext([company],scope).store,company.stores[0]);
 for(const value of [null,{}, {...scope,companyId:"other"},{...scope,storeId:"other"}])assert.equal(resolveTwinContext([company],value),null);
 assert.notEqual(twinScopeKey(scope),twinScopeKey({...scope,companyId:"other"}));
});
test("N40 scoped filters preserve date filters but cannot clear or replace store scope",()=>{
 const filters={companyId:"other",storeId:"",from:"2026-10-01",to:"2026-10-10"};
 assert.deepEqual(withTwinScope(filters,scope),{...filters,...scope});
 assert.deepEqual(withTwinScope({},scope),scope);
 assert.deepEqual(withTwinScope(filters),filters);
 assert.throws(()=>withTwinScope(filters,{}));
 assert.equal(filters.companyId,"other");
});
test("N40 stale destination request is rejected before sending",async()=>{
 let calls=0;await assert.rejects(guardTwinRequest(async()=>calls++,()=>false)("/read"));assert.equal(calls,0);
});
test("N40 response arriving after close or store change is rejected",async()=>{
 let resolve,current=true;const pending=new Promise(r=>resolve=r);
 const work=guardTwinRequest(()=>pending,()=>current)("/read");current=false;resolve({items:["old"]});await assert.rejects(work,/απορρίφθηκε/);
});
test("N40 current requests retain arguments, values and server denial",async()=>{
 const calls=[];const read=guardTwinRequest(async(...args)=>{calls.push(args);return{ok:true}},()=>true);
 assert.deepEqual(await read("/read",{method:"GET"}),{ok:true});assert.deepEqual(calls,[["/read",{method:"GET"}]]);
 await assert.rejects(guardTwinRequest(async()=>{throw new Error("403 module denied")},()=>true)("/read"),/403/);
});
test("N40 full-page return hint is actor-bound, one-use and contains no credentials or redirect",()=>{
 const s=storage();assert.equal(rememberTwinReturn(s,scope,"actor",1000),true);
 assert.deepEqual(Object.keys(JSON.parse(s.getItem(TWIN_RETURN_KEY))).sort(),["version","userId","companyId","storeId","createdAt"].sort());
 assert.deepEqual(consumeTwinReturn(s,"actor",1001),scope);assert.equal(consumeTwinReturn(s,"actor",1002),null);
});
test("N40 return hints reject different actor, expiry, future timestamp and malformed storage",()=>{
 for(const [actor,time] of [["other",1001],["actor",1001+TWIN_RETURN_MAX_AGE_MS],["actor",999]]){
  const s=storage();rememberTwinReturn(s,scope,"actor",1000);assert.equal(consumeTwinReturn(s,actor,time),null);assert.equal(s.getItem(TWIN_RETURN_KEY),null);
 }
 const s=storage();s.setItem(TWIN_RETURN_KEY,"bad JSON");assert.equal(consumeTwinReturn(s,"actor"),null);
 assert.equal(rememberTwinReturn(s,{},"actor"),false);assert.equal(rememberTwinReturn(s,scope,""),false);
});
test("N40 return storage failures do not invent a selection",()=>{
 const broken={getItem(){throw Error("denied")},setItem(){throw Error("denied")},removeItem(){throw Error("denied")}};
 assert.equal(rememberTwinReturn(broken,scope,"actor"),false);assert.equal(consumeTwinReturn(broken,"actor"),null);assert.doesNotThrow(()=>clearTwinReturn(broken));
});

test("N40 rendering may inspect a return hint repeatedly before the mount effect consumes it",()=>{const s=storage();rememberTwinReturn(s,scope,"actor",1000);assert.deepEqual(readTwinReturn(s,"actor",1001),scope);assert.deepEqual(readTwinReturn(s,"actor",1001),scope);assert.deepEqual(consumeTwinReturn(s,"actor",1001),scope);assert.equal(readTwinReturn(s,"actor",1001),null)});
