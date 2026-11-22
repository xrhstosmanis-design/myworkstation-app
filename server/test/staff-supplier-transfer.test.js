import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFile} from "node:fs/promises";
import {z} from "zod";
import {staffSupplierManagementRoute,supplierTransferCapability,staffCompanyRequestCapability} from "../../shared/backoffice-staff-company.mjs";

const caps=supplierTransferCapability;
const src=await readFile(new URL("../src/routes/supplier-product-transfer.js",import.meta.url),"utf8");
const route="/api/supplier-control/source/transfer";
const op="a9088c88-796b-480a-9a7b-c54d38c244b1";
const staffError=(status=403,code)=>Object.assign(new Error(code),{status,code});
function fixture({eligible=true,revoked=false,targetActive=true}={}){
 const writes=[],handlers={};let prior;
 const suppliers=[{id:"source",active:true,name:"Source"},{id:"target",active:targetActive,name:"Target"}];
 const base=async(parts,...values)=>{
  const sql=parts.join("?");
  if(sql.includes('FROM "Supplier"')){
   assert.equal(values.includes("company"),true);
   return sql.includes('FOR UPDATE')?suppliers:suppliers.filter(row=>row.id===values[0]);
  }
  if(sql.includes('FROM "SupplierProductTransfer"'))return prior?[prior]:[];
  if(sql.includes('FROM "Product"'))return sql.includes('EXISTS')&&!eligible?[]:[{id:"item"}];
  if(sql.includes('AS code'))return [{code:"A1"}];
  assert.fail(sql);
 };
 const tx={$queryRaw:base,$executeRaw:async(parts,...values)=>{
  const sql=parts.join("?");
  writes.push({sql,values});
  if(sql.includes('INSERT INTO "SupplierProductTransfer"'))prior={toSupplierId:values[3],mode:values[4],productIdsJson:JSON.parse(values[5])};
 }};
 const prisma={$queryRaw:base,$transaction:async callback=>callback(tx)};
 const router={use(){},get(){},post:(path,handler)=>handlers[path]=handler};
 const requireStaffCompanyGrant=async(db,user,capability)=>{assert.equal(db,tx);assert.equal(capability,caps);assert.equal(user.companyId,"company");if(revoked)throw staffError();return {revision:1}};
 new Function("Router","prisma","z","crypto","staffSupplierManagementRoute","supplierTransferCapability","staffError","requireStaffCompanyGrant",
  src.replace(/^import .*;\n/gm,"").replace("export default router;",""))(()=>router,prisma,z,crypto,staffSupplierManagementRoute,caps,staffError,requireStaffCompanyGrant);
 async function run(input={}){
  const req={params:{supplierId:"source"},user:{companyId:"company",id:"staff",staffAccess:true},staffCompanyGrant:{capability:caps,companyId:"company",revision:1},
   body:{toSupplierId:"target",mode:"ITEMS_CODES",productIds:["item"],operationId:op,confirmed:true,...input}};
  let result;const res={status(status){return {json(body){result={status,body}}}},json(body){result=body}};
  await handlers["/:supplierId/transfer"](req,res,error=>{throw error});
  return result;
 }
 return {run,writes};
}
test("company supplier transfer only maps the two exact method/path combinations",()=>{
 assert.equal(staffCompanyRequestCapability("GET",route+"-candidates"),caps);
 assert.equal(staffCompanyRequestCapability("POST",route),caps);
 for(const [method,path] of [["GET",route],["POST",route+"-candidates"],["DELETE",route],["POST",route.replace("source","%2F")]])
  assert.equal(staffCompanyRequestCapability(method,path),null);
});
test("delegated transfer records the operation atomically and identical retry does not repeat writes",async()=>{
 const f=fixture();
 const a=await f.run();
 assert.equal(a.count,1);
 assert.equal(f.writes.length,4);
 assert.equal(f.writes.at(-1).values.at(-2),"staff");
 assert.equal((await f.run()).ok,true);
 assert.equal(f.writes.length,4);
 await assert.rejects(f.run({mode:"CODES"}),{status:409});
 assert.equal(f.writes.length,4);
});
test("delegated transfer rejects unlinked products, revoked rights, and inactive target",async()=>{
 const unrelated=fixture({eligible:false});
 await assert.rejects(unrelated.run(),{status:409});
 assert.deepEqual(unrelated.writes,[]);
 const revoked=fixture({revoked:true});
 await assert.rejects(revoked.run(),{status:403});
 assert.deepEqual(revoked.writes,[]);
 const inactive=fixture({targetActive:false});
 assert.equal((await inactive.run()).status,409);
 assert.deepEqual(inactive.writes,[]);
});
