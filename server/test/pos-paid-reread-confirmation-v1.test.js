import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Execute the existing component submit handler with its IO replaced, so these
// tests exercise cancel/confirm and the actual request order without a browser.
const source=fs.readFileSync(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
const handler=source.slice(source.indexOf("  const submit=async()=>{"),source.indexOf("  return <div className=\"pos-payment-form-v3-root\""));
async function submit({confirmed,mode}){
  const requests=[],statuses=[],busy=[],messages=[];let closed=0,prompts=0;
  const context=vm.createContext({ready:true,mode,amount:"2369.99",documentNumber:"2612188",documentDate:"2026-09-02",store:{id:"store"},supplierId:"supplier",fileDataUrl:"source",pages:[{file:{name:"invoice.jpg",type:"image/jpeg"},dataUrl:"source"}],num:Number,paymentKey:()=>"key",setBusy:value=>busy.push(value),setStatus:value=>statuses.push(value),setMessage:value=>messages.push(value),onChanged:()=>closed++,monitorBackgroundV244:()=>{},window:{confirm:message=>{prompts++;assert.match(message,/Δεν θα καταχωριστεί ξανά πληρωμή ή πίστωση/);return confirmed}},api:async(path,options)=>{requests.push({path,body:JSON.parse(options.body)});if(path.endsWith("fast-duplicate-check"))return {paymentTransactionId:"existing-payment",paymentReused:true};if(path.endsWith("fast-handoff"))return {jobId:"new-job"};throw new Error("Unexpected financial write");}});
  await vm.runInContext(`${handler}\nsubmit()`,context);
  return {requests,statuses,busy,messages,closed,prompts};
}
test("cancelling paid invoice reread leaves the form and existing payment alone",async()=>{
  const result=await submit({confirmed:false,mode:"PAID"});
  assert.equal(result.requests.length,1);assert.equal(result.prompts,1);assert.equal(result.closed,0);assert.equal(result.busy.at(-1),false);
});
for(const mode of ["PAID","CREDIT"])test(`confirmed ${mode} reread hands off the same payment and releases POS`,async()=>{
  const result=await submit({confirmed:true,mode});
  assert.equal(result.requests.length,2);assert.equal(result.prompts,1);assert.equal(result.closed,1);
  assert.match(result.requests[1].path,/fast-handoff$/);
  assert.equal(result.requests[1].body.paymentTransactionId,"existing-payment");assert.equal(result.requests[1].body.settlementMode,"PAID");
  assert.ok(result.messages.some(message=>message.includes("χωρίς νέα χρέωση")));
});
