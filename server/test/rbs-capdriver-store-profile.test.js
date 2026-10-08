import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolveRbsCapDriverFiscalProfile,buildRbsCapDriverV1Command,resolveRbsCapDriverV1PaymentCode} from "../src/rbs-capdriver-v1.js";

const identity={companyId:"cmulmjjoa000oqlbfyi0h53ju",storeId:"cmulmjjoc000qqlbf2bn2ifj0"};
const water={vatCode:"42",department:5,vatRate:13};

test("Diadoxou accepts its confirmed register profile rather than KAT's same-code department",()=>{
  const expected=[["12",1,0],["45",3,0],["21",4,6],["42",5,13],["15",6,24],["62",8,0],["63",9,0]];
  for(const [vatCode,department,vatRate] of expected)
    assert.deepEqual(resolveRbsCapDriverFiscalProfile({...identity,vatCode,department,vatRate}),{department,vatRate});
  assert.throws(()=>resolveRbsCapDriverFiscalProfile({...identity,...water,department:2}),/do not match/);
  assert.throws(()=>resolveRbsCapDriverFiscalProfile({...identity,vatCode:"45",department:7,vatRate:0}),/do not match/);
});

test("Diadoxou's profile is not inherited by another company/store or incomplete identity",()=>{
  for(const scope of [{},{companyId:identity.companyId},{storeId:identity.storeId},
    {...identity,companyId:"another-company"},{...identity,storeId:"another-store"}])
    assert.throws(()=>resolveRbsCapDriverFiscalProfile({...scope,...water}),/do not match/);
  assert.deepEqual(resolveRbsCapDriverFiscalProfile({companyId:"kat-company",storeId:"kat-store",vatCode:"42",department:2,vatRate:13}),{department:2,vatRate:13});
});

test("Diadoxou still rejects unknown codes, unconfirmed services, wrong department and wrong VAT",()=>{
  for(const wrong of [{vatCode:"999"},{vatCode:""},{department:4},{vatRate:24},
    {vatCode:"7",department:7,vatRate:24},{vatCode:"227",department:6,vatRate:24}])
    assert.throws(()=>resolveRbsCapDriverFiscalProfile({...identity,...water,...wrong}),/do not match/);
});

test("real checkout command builder uses authenticated identity and emits one water CASH command to department5",async()=>{
  const source=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
  const statement=source.match(/command=buildRbsCapDriverV1Command\([\s\S]*?codePage:"1253"\}\);/)[0];
  const run=new Function("req","store","body","items","settings","summary","routedTerminalPos","round2",
    "resolveRbsCapDriverFiscalProfile","buildRbsCapDriverV1Command","resolveRbsCapDriverV1PaymentCode",
    `let command;${statement};return command;`);
  const body={paymentMethod:"CASH",operationChannel:"COUNTER",items:[{}],companyId:"kat-company",storeId:"kat-store"};
  const items=[{name:"ΝΕΡΟ 500ML",quantity:1,effectiveUnitPrice:0.5,vatRate:13,fiscalDepartment:5,fiscalVatCode:"42",fiscalVatRate:13}];
  const call=(companyId,storeId,lines=items)=>run({user:{companyId}},{id:storeId},body,lines,{cashCode:"1",cardCode:"2"},{total:0.5},"DIADOXOU-POS-01",n=>Math.round(n*100)/100,
    resolveRbsCapDriverFiscalProfile,buildRbsCapDriverV1Command,resolveRbsCapDriverV1PaymentCode);
  assert.equal(call(identity.companyId,identity.storeId).text,"HL/\r\nSL/ΝΕΡΟ 500ML//1.000/0.50/5/13.0\r\nCR/1/0.50/ΜΕΤΡΗΤΑ");
  assert.throws(()=>call("another-company",identity.storeId),/do not match/);
  assert.throws(()=>call(identity.companyId,"another-store"),/do not match/);
  assert.throws(()=>call(identity.companyId,identity.storeId,[{...items[0],fiscalVatRate:24}]),/VAT does not match/);
});
