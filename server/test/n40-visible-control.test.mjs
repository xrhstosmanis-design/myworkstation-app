import test from "node:test";
import assert from "node:assert/strict";
import {installN40VisibleReadTrace} from "../../client/src/utils/n40VisibleReadTrace.js";
import {N40_CONTROL_STORE,N40_LAB_STORE} from "../../shared/n40-read-trace.mjs";
test("visible diagnostic accepts only both approved LAB stores and projects no extra payload",()=>{
 const originalDocument=globalThis.document,originalWindow=globalThis.window,children=[];
 const node=()=>({style:{},children:[],setAttribute(k,v){this[k]=v},append(...values){this.children.push(...values)},remove(){this.removed=true}});
 let receive;
 globalThis.document={createElement:node,body:{append(value){children.push(value)}}};
 globalThis.window={addEventListener(name,handler){receive=handler},removeEventListener(){}};
 try{
  const dispose=installN40VisibleReadTrace();
  const record={expectedStoreId:N40_CONTROL_STORE,expectedCompanyId:"cmtpopbgk000prhb5qc60zxus",side:"client",method:"GET",traceId:"n40-"+"a".repeat(32),route:"/api/platform/stores/:value/check-packages",companyIds:[],storeIds:[N40_CONTROL_STORE],companyMatches:null,storeMatches:true,status:403,observedAt:"2026-10-10T18:40:00.000Z",token:"private-token",body:{email:"private-email"}};
  receive({detail:{...record,expectedStoreId:"cmuk8gxui000ppabfykdxwb1y"}});assert.equal(children.length,0);
  receive({detail:{...record,expectedCompanyId:"foreign-company"}});assert.equal(children.length,0);
  receive({detail:record});assert.equal(children.length,1);
  const list=children[0].children.find(x=>x["aria-label"]==="Νο40 ασφαλείς καταγραφές GET");
  const first=JSON.parse(list.textContent);assert.equal(first.expectedStoreId,N40_CONTROL_STORE);assert.equal(first.status,403);assert.equal(list.textContent.includes("private"),false);
  receive({detail:{...record,expectedStoreId:N40_LAB_STORE,storeIds:[N40_LAB_STORE]}});assert.ok(list.textContent.includes(N40_LAB_STORE));assert.ok(list.textContent.includes(N40_CONTROL_STORE));
  dispose();assert.equal(children[0].removed,true);
 }finally{globalThis.document=originalDocument;globalThis.window=originalWindow}
});
