import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {staffRequestCapability} from "../../shared/backoffice-staff.mjs";

const source=await readFile(new URL("../src/routes/purchase-order-actions.js",import.meta.url),"utf8");
function fixture({revoked=false,missing=false}={}){
 let handler;const calls=[];
 const router={post(_,fn){handler=fn}};
 const prisma={$queryRaw:async(parts,...values)=>{
  calls.push({sql:parts.join("?"),values});
  return calls.length===1?(missing?[]:[{id:"order",storeId:"lab",supplierEmail:"supplier@example.invalid"}]):[{description:"Synthetic",quantity:1,unitCost:1,grossAmount:1}];
 }};
 const staffError=(status=403,code)=>Object.assign(new Error(code||"Denied"),{status,code});
 const requireStaffGrant=async(db,user,storeId,capability)=>{assert.equal(db,prisma);assert.equal(storeId,"lab");assert.equal(capability,"invoices.email");if(revoked)throw staffError()};
 const sendEmail=async options=>{calls.push({mail:options});return {messageId:"synthetic"}};
 new Function("Router","prisma","staffError","requireStaffGrant","sendEmail",source.replace(/^import .*;\n/gm,"").replace("export default router;",""))(()=>router,prisma,staffError,requireStaffGrant,sendEmail);
 async function invoke(body){
  const req={method:"POST",path:"/order/email",params:{orderId:"order"},body,user:{staffAccess:true,companyId:"co",storeId:"lab"},staffGrant:{capability:"invoices.email"}};
  let result,status=200;
  const res={status(code){status=code;return this},json(data){result=data}};
  await handler(req,res,error=>{throw error});
  return {result,status};
 }
 return {invoke,calls};
}
test("email is an exact grant and uses the registered company supplier and selected store",async()=>{
 assert.equal(staffRequestCapability("POST","/api/purchase-orders/order/email"),"invoices.email");
 const f=fixture();
 await assert.rejects(f.invoke({confirmed:true,to:"different@example.invalid"}),{status:400});
 assert.equal(f.calls.length,0);
 assert.equal((await f.invoke({confirmed:true})).result.messageId,"synthetic");
 assert.match(f.calls[0].sql,/s\."companyId"=o\."companyId"/);
 assert.ok(f.calls[0].values.includes("lab"));
 assert.equal(f.calls.at(-1).mail.to,"supplier@example.invalid");
});
test("revocation and missing scoped purchase prevent dispatch",async()=>{
 const revoked=fixture({revoked:true});
 await assert.rejects(revoked.invoke({confirmed:true}),{status:403});
 assert.equal(revoked.calls.some(c=>c.mail),false);
 const missing=fixture({missing:true});
 assert.equal((await missing.invoke({confirmed:true})).status,404);
 assert.equal(missing.calls.some(c=>c.mail),false);
});
