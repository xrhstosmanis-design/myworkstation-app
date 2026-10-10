import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {z} from "zod";

function harness(){
  const routes=new Map(),writes=[],saved=[];
  let access;
  const router={use:fn=>{access=fn},get:(p,fn)=>routes.set(`GET ${p}`,fn),post:(p,fn)=>routes.set(`POST ${p}`,fn),patch:()=>{},delete:()=>{}};
  const prisma={
    $executeRawUnsafe:async()=>0,
    $executeRaw:async(strings,...values)=>{
      const sql=strings.join("?");writes.push({sql,values});
      if(sql.includes('INSERT INTO "ManagementVatDepartment"'))saved.push({id:values[0],companyId:values[1],legacyVatCode:values[2],cashRegisterDepartment:values[3],description:values[4],vatRate:values[5],commerce:values[6],exemptionCode:values[7],exemptionDescription:values[8],active:values[9]});
      return 1;
    },
    $queryRaw:async(strings,...values)=>{
      const sql=strings.join("?");
      if(sql.includes("COUNT(*)"))return [{count:1}];
      return saved.filter(row=>row.companyId===values[0]).map(row=>({...row,productCount:0}));
    }
  };
  const source=fs.readFileSync(new URL("../src/routes/management-vat-departments.js",import.meta.url),"utf8").replace(/^import .*;$/gm,"").replace("export async function","async function").replace("export default router;","return router;");
  new Function("Router","z","prisma","crypto","executeHotTableBootstrap",source)(()=>router,z,prisma,crypto,async()=>{});
  return {writes,async call(method,body={},user={role:"OWNER",companyId:"daily-bite"}){
    const req={user,body},res={statusCode:200,status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
    let authorized=false,error;access(req,res,()=>{authorized=true});
    if(authorized)await routes.get(`${method} /`)(req,res,e=>{error=e});
    return {...res,error};
  }};
}

test("VAT options add AADE exemption 27 while preserving existing codes",async()=>{
  const result=await harness().call("GET");
  assert.equal(result.error,undefined);
  assert.deepEqual(result.body.exemptions.map(x=>x.code),["7","8","9","10","11","14","15","16","17","18","27"]);
  assert.deepEqual(result.body.exemptions.at(-1),{code:"27",description:"Λοιπές Εξαιρέσεις ΦΠΑ"});
});

test("department 9 persists and reads back exact exemption within its company",async()=>{
  const h=harness(),body={description:"09. ΚΑΡΤΕΣ",cashRegisterDepartment:9,legacyVatCode:"45",vatRate:0,commerce:true,active:true,exemptionCode:"27",exemptionDescription:"Λοιπές Εξαιρέσεις ΦΠΑ"};
  const created=await h.call("POST",body);assert.equal(created.error,undefined);assert.equal(created.statusCode,201);
  const list=await h.call("GET");assert.equal(list.body.items.length,1);
  for(const [key,value] of Object.entries(body))assert.equal(list.body.items[0][key],value,key);
  assert.equal((await h.call("GET",{}, {role:"OWNER",companyId:"other"})).body.items.length,0);
  assert.equal(h.writes.length,1);assert.ok(!h.writes.some(x=>x.sql.includes('UPDATE "Product"')));
});

test("operators cannot create VAT departments",async()=>{
  const h=harness();assert.equal((await h.call("POST",{}, {role:"OWNER",tokenType:"STORE_OPERATOR",companyId:"daily-bite"})).statusCode,403);assert.equal(h.writes.length,0);
});
