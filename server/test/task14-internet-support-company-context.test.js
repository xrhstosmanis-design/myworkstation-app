import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
const source=await readFile(new URL("../src/routes/commerce-advanced-online-search.js",import.meta.url),"utf8");
const start=source.indexOf("async function companyFor("),end=source.indexOf("\nasync function validStore",start);
async function resolve({role="OWNER",superAdmin=false,companyId="tenant-a",supportContext,baseUrl="/api/commerce/internet-product-search",query={},body={},entitled=true}={}){
 const checked=[];let status=null,payload=null;
 const fn=vm.runInNewContext("("+source.slice(start,end)+")",{isPlatformSuper:req=>req.user.isSuperAdmin,isOwner:req=>req.user.role==="OWNER",advancedOnlineSearchEntitlement:async id=>{checked.push(id);return entitled}});
 const value=await fn({user:{role,isSuperAdmin:superAdmin,companyId,supportContext},baseUrl,query,body},{status(code){status=code;return this},json(data){payload=data;return this}});
 return {value,status,payload,checked};
}
test("signed support tenant supplies missing commerce company",async()=>{
 const r=await resolve({superAdmin:true,supportContext:{companyId:"tenant-a"}});
 assert.equal(r.value,"tenant-a");assert.equal(r.status,null);
});
test("missing or conflicting support context cannot infer a Super Admin tenant",async()=>{
 for(const supportContext of [undefined,{companyId:"tenant-b"}]){
  const r=await resolve({superAdmin:true,supportContext});assert.equal(r.value,null);assert.equal(r.status,400);
 }
});
test("global platform keeps explicit company requirement even with support context",async()=>{
 const r=await resolve({superAdmin:true,supportContext:{companyId:"tenant-a"},baseUrl:"/api/platform/internet-product-search"});
 assert.equal(r.value,null);assert.equal(r.status,400);
});
test("explicit Super Admin platform query/body selection is preserved",async()=>{
 for(const selection of [{query:{companyId:"tenant-b"}},{body:{companyId:"tenant-b"}}]){
  const r=await resolve({superAdmin:true,baseUrl:"/api/platform/internet-product-search",...selection});assert.equal(r.value,"tenant-b");
 }
});
test("Owner foreign company parameters cannot cross tenant",async()=>{
 const r=await resolve({query:{companyId:"tenant-b"},body:{companyId:"tenant-c"},supportContext:{companyId:"tenant-b"}});
 assert.equal(r.value,"tenant-a");assert.deepEqual(r.checked,["tenant-a"]);
});
test("Owner inactive module remains denied",async()=>{
 const r=await resolve({entitled:false});assert.equal(r.status,403);assert.equal(r.payload.code,"MODULE_DISABLED");assert.equal(r.value,null);
});
test("Manager remains denied even with support-shaped context",async()=>{
 const r=await resolve({role:"MANAGER",supportContext:{companyId:"tenant-a"}});
 assert.equal(r.value,null);assert.equal(r.status,403);assert.equal(r.payload.code,"OWNER_ONLY");
});
test("non-Super Admin cannot enter platform route",async()=>{
 const r=await resolve({baseUrl:"/api/platform/internet-product-search"});
 assert.equal(r.value,null);assert.equal(r.status,403);assert.deepEqual(r.checked,[]);
});
