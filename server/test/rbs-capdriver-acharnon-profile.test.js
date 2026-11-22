import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolveRbsCapDriverFiscalProfile,buildRbsCapDriverV1Command,resolveRbsCapDriverV1PaymentCode} from "../src/rbs-capdriver-v1.js";

const companyId="acharnon-authenticated-company";
const storeId="cmw0pwyvo000uokg2jrjm1p0c";
const identity={companyId,storeId,storeCompanyId:companyId};
const confirmed=[["1",1,0],["2",2,0],["3",3,0],["4",4,6],["5",5,13],
  ["6",6,24],["7",7,24],["8",8,0],["9",9,0],["17",17,24],["18",18,24]];

test("Acharnon accepts only eleven independently confirmed department / rate pairs",()=>{
  for(const [vatCode,department,vatRate] of confirmed)
    assert.deepEqual(resolveRbsCapDriverFiscalProfile({...identity,vatCode,department,vatRate}),{department,vatRate});
});

test("Acharnon cannot be selected without matching authenticated owner and store record",()=>{
  const water={vatCode:"5",department:5,vatRate:13};
  for(const scope of [{},{companyId},{storeId},{storeCompanyId:companyId},
    {companyId,storeId},{companyId,storeId,storeCompanyId:"another-owner"},
    {companyId:"another-owner",storeId,storeCompanyId:companyId},
    {companyId,storeId:"another-store",storeCompanyId:companyId}])
    assert.throws(()=>resolveRbsCapDriverFiscalProfile({...scope,...water}),/do not match/);
});

test("Acharnon rejects KAT and Diadoxou mappings, unknown codes and wrong VAT",()=>{
  for(const wrong of [{vatCode:"42",department:2,vatRate:13},
    {vatCode:"42",department:5,vatRate:13},{vatCode:"5",department:2,vatRate:13},
    {vatCode:"5",department:5,vatRate:24},{vatCode:"5",department:5,vatRate:NaN},
    {vatCode:"999",department:5,vatRate:13},
    {vatCode:"",department:5,vatRate:13},
    {vatCode:"17",department:13,vatRate:24},
    {vatCode:"18",department:18,vatRate:0}])
    assert.throws(()=>resolveRbsCapDriverFiscalProfile({...identity,...wrong}),/do not match/);
  assert.deepEqual(resolveRbsCapDriverFiscalProfile({companyId:"kat-company",storeId:"kat-store",vatCode:"42",department:2,vatRate:13}),{department:2,vatRate:13});
  assert.deepEqual(resolveRbsCapDriverFiscalProfile({companyId:"cmulmjjoa000oqlbfyi0h53ju",storeId:"cmulmjjoc000qqlbf2bn2ifj0",vatCode:"42",department:5,vatRate:13}),{department:5,vatRate:13});
});

test("checkout uses authenticated store record, ignores hostile body and emits one 0.50 cash or card command",async()=>{
  const source=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
  const statement=source.match(/command=buildRbsCapDriverV1Command\([\s\S]*?codePage:"1253"\}\);/)?.[0];
  assert.ok(statement,"checkout command construction must remain available");
  const run=new Function("req","store","body","items","settings","summary","routedTerminalPos","round2",
    "resolveRbsCapDriverFiscalProfile","buildRbsCapDriverV1Command","resolveRbsCapDriverV1PaymentCode",
    `let command;${statement};return command;`);
  const item={name:"ΝΕΡΟ 500ML",quantity:1,effectiveUnitPrice:0.5,vatRate:13,fiscalDepartment:5,fiscalVatCode:"5",fiscalVatRate:13};
  const call=(authCompany,recordCompany,method="CASH",itemOverride=item)=>run(
    {user:{companyId:authCompany}},{id:storeId,companyId:recordCompany},
    {paymentMethod:method,operationChannel:"COUNTER",items:[{}],companyId:"kat-company",storeId:"kat-store"},
    [itemOverride],{cashCode:"1",cardCode:"2"},{total:0.5},"ACHARNON-POS-01",
    n=>Math.round(n*100)/100,
    resolveRbsCapDriverFiscalProfile,buildRbsCapDriverV1Command,resolveRbsCapDriverV1PaymentCode);
  assert.equal(call(companyId,companyId).text,"HL/\r\nSL/ΝΕΡΟ 500ML//1.000/0.50/5/13.0\r\nCR/1/0.50/ΜΕΤΡΗΤΑ");
  assert.equal(call(companyId,companyId,"CARD").text,"HL/\r\nSL/ΝΕΡΟ 500ML//1.000/0.50/5/13.0\r\nCR/2/0.50/ΚΑΡΤΑ");
  assert.throws(()=>call(companyId,"another-owner"),/do not match/);
  assert.throws(()=>call("another-owner",companyId),/do not match/);
  assert.throws(()=>call(companyId,companyId,"CASH",{...item,fiscalVatRate:24}),/VAT does not match/);
});
