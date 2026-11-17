import assert from "node:assert/strict";
import test from "node:test";
import {lowValueLabOwnerAccess} from "../src/services/low-value-lab-owner-access.js";

const company={id:"cmtpopbgk000prhb5qc60zxus",name:"MYWORKSTATION LAB"};
const store={id:"cmtpopbgo000trhb5ng9ytiru",companyId:company.id,name:"ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ",active:true};
const owner={role:"OWNER",companyId:company.id};
const window="2026-11-17T09:00:00Z/2026-11-17T21:00:00Z";
const now=Date.parse("2026-11-17T10:00:00Z");
const scope={window,now};

test("temporary report access requires the exact active LAB and its regular Owner",()=>{
  assert.equal(lowValueLabOwnerAccess(owner,store,company,scope),true);
  for(const user of [{...owner,role:"ADMIN"},{...owner,companyId:"other"},{...owner,supportContext:{}},{...owner,tokenType:"STORE_OPERATOR"}]){
    assert.equal(lowValueLabOwnerAccess(user,store,company,scope),false);
  }
  for(const target of [{...store,id:"other"},{...store,name:"Other"},{...store,active:false}]){
    assert.equal(lowValueLabOwnerAccess(owner,target,company,scope),false);
  }
});

test("temporary access is disabled outside its configured bounded window",()=>{
  for(const options of [
    {window:"",now},
    {window:"invalid",now},
    {window,now:Date.parse("2026-11-17T08:59:59Z")},
    {window,now:Date.parse("2026-11-17T21:00:00Z")},
    {window:"2026-11-17T09:00:00Z/2026-11-19T09:00:00Z",now}
  ]){
    assert.equal(lowValueLabOwnerAccess(owner,store,company,options),false);
  }
});
