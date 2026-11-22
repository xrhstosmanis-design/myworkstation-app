import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {z} from "zod";

const client=readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const server=readFileSync(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const schemaSource=server.slice(server.indexOf("const cartItemSchema="),server.indexOf("const offlineEvidenceSchema="));
const checkoutSchema=vm.runInNewContext(schemaSource+"\ncheckoutSchema;",{z});
const formStart=client.indexOf("onSubmit={event=>{",client.indexOf("{tableOrderId&&tableCash?.enabled"));
const formEnd=client.indexOf("}}><label>",formStart);
const submitSource=client.slice(formStart+"onSubmit={".length,formEnd+1);
const serializerStart=client.indexOf("JSON.stringify({...(continuation?.checkout");
const serializerEnd=client.indexOf("})})}if(result.tablePartial)",serializerStart)+2;
const serializeSource=client.slice(serializerStart,serializerEnd);

function partialRequest(input){
  let args;
  const errors=[];
  const submit=vm.runInNewContext("("+submitSource+")",{
    partialCashInput:input,setError:message=>errors.push(message),
    checkout:(...values)=>{args=values;}
  });
  submit({preventDefault(){}});
  if(!args)return {errors};
  const [paymentMethod,payments,continuation,partialCents]=args;
  const body=vm.runInNewContext(serializeSource,{
    paymentMethod,payments,continuation,partialCents,customer:null,
    tableOrderId:"11111111-1111-4111-8111-111111111111",redeemPoints:0,
    tableCash:{paidCents:0},payableTotal:2,operationChannel:"COUNTER",
    activeCart:[{productId:"coffee",tableLineId:"22222222-2222-4222-8222-222222222222",quantity:2}],
    data:{lifecycle:{generation:"0"}},transactionId:"33333333-3333-4333-8333-333333333333"
  });
  return {request:JSON.parse(body),errors};
}

test("partial cash form serializes 0,50 without a mixed payments value and passes actual checkout schema",()=>{
  const {request,errors}=partialRequest("0,50");
  assert.deepEqual(errors,[]);
  assert.equal(request.paymentMethod,"CASH");
  assert.equal(request.tableCashAmountCents,50);
  assert.equal(Object.hasOwn(request,"payments"),false);
  assert.equal(checkoutSchema.safeParse(request).success,true);
  const previous=checkoutSchema.safeParse({...request,payments:null});
  assert.equal(previous.success,false);
  assert.ok(previous.error.issues.some(issue=>issue.path[0]==="payments"));
});

test("partial amount and mixed payment validation remain enforced",()=>{
  assert.equal(partialRequest("0,501").request,undefined);
  assert.equal(partialRequest("wrong").request,undefined);
  const {request}=partialRequest("0,50");
  for(const amount of [0,-50,0.5])assert.equal(checkoutSchema.safeParse({...request,tableCashAmountCents:amount}).success,false);
  assert.equal(checkoutSchema.safeParse({...request,paymentMethod:"MIXED"}).success,false);
  assert.equal(checkoutSchema.safeParse({...request,payments:[{method:"CASH",amount:1},{method:"CARD",amount:1}]}).success,false);
});
