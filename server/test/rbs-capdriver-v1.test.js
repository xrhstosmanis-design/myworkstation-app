import test from "node:test";
import assert from "node:assert/strict";
import {TextDecoder} from "node:util";
import {buildRbsCapDriverV1Command,claimRbsCapDriverV1Request,isFinalRbsFiscalRequestStatus,mayDispatchRbsFiscalRequest,resolveRbsCapDriverFiscalProfile,RBS_CAP_DRIVER_KIOSK_VAT_PROFILES,rbsCapDriverSaleFiscalStatus,transitionRbsCapDriverV1OperatorOutcome,transitionRbsFiscalRequest} from "../src/rbs-capdriver-v1.js";

const item={description:"ΝΕΡΟ 500ML",barcode:"",quantity:1,unitPrice:0.5,fiscalDepartment:"9",vatRate:13};

test("CAP Driver v1 builds one CR cash command in the configured Windows-1253 encoding",()=>{
  const command=buildRbsCapDriverV1Command({items:[item],paymentMethod:"CASH",paymentCode:"6",total:0.5,codePage:"1253"});
  assert.equal(command.text,"HL/\r\nSL/ΝΕΡΟ 500ML//1.000/0.50/9/13.0\r\nCR/6/0.50/ΜΕΤΡΗΤΑ");
  assert.equal(new TextDecoder("windows-1253").decode(command.bytes),command.text+"\r\n");
  assert.equal(command.bytes.at(-1),0x0a);
});

test("CAP Driver v1 builds a single configured card payment command",()=>{
  const command=buildRbsCapDriverV1Command({items:[item],paymentMethod:"CARD",paymentCode:"2",total:0.5,codePage:"1253"});
  assert.match(command.text,/\r\nCR\/2\/0\.50\/ΚΑΡΤΑ$/);
  assert.equal((command.text.match(/\r\nCR\//g)||[]).length,1);
  assert.doesNotMatch(command.text,/\r\n(?:ER|CL)\//);
});

test("CAP Driver v1 refuses unconfirmed mappings and unsafe file fields",()=>{
  assert.throws(()=>buildRbsCapDriverV1Command({items:[item],paymentMethod:"CARD",total:0.5}),/explicitly mapped/);
  assert.throws(()=>buildRbsCapDriverV1Command({items:[{...item,fiscalDepartment:""}],paymentMethod:"CASH",paymentCode:"6",total:0.5}),/mapping is missing/);
  assert.throws(()=>buildRbsCapDriverV1Command({items:[{...item,description:"ITEM/CR/1"}],paymentMethod:"CASH",paymentCode:"6",total:0.5}),/unsupported CAP Driver character/);
  assert.throws(()=>buildRbsCapDriverV1Command({items:[item],paymentMethod:"IRIS",paymentCode:"6",total:0.5}),/only cash or card/);
  assert.throws(()=>buildRbsCapDriverV1Command({items:[item],paymentMethod:"CASH",paymentCode:"6",total:0.5,codePage:"UTF8"}),/code page 1253/);
  assert.throws(()=>buildRbsCapDriverV1Command({items:[{...item,registerVatRate:24}],paymentMethod:"CASH",paymentCode:"6",total:0.5}),/VAT does not match/);
});

test("confirmed Kiosk VAT codes map to the exact register departments and VAT rates",()=>{
  assert.equal(RBS_CAP_DRIVER_KIOSK_VAT_PROFILES.size,10);
  for(const [vatCode,profile] of RBS_CAP_DRIVER_KIOSK_VAT_PROFILES){
    assert.deepEqual(resolveRbsCapDriverFiscalProfile({vatCode,department:profile.department,vatRate:profile.vatRate}),profile);
  }
  assert.throws(()=>resolveRbsCapDriverFiscalProfile({vatCode:"1",department:2,vatRate:13}),/do not match/);
  assert.throws(()=>resolveRbsCapDriverFiscalProfile({vatCode:"42",department:2,vatRate:24}),/do not match/);
  assert.throws(()=>resolveRbsCapDriverFiscalProfile({vatCode:"999",department:2,vatRate:13}),/do not match/);
});

test("fiscal request cannot dispatch twice and operator outcomes are terminal",()=>{
  assert.equal(mayDispatchRbsFiscalRequest("PREPARED"),true);
  assert.equal(mayDispatchRbsFiscalRequest("DISPATCHED"),false);
  assert.deepEqual(transitionRbsFiscalRequest("DISPATCHED","YES"),{status:"CONFIRMED",allowSaleCommit:true,allowResend:false});
  assert.deepEqual(transitionRbsFiscalRequest("DISPATCHED","NO"),{status:"DECLINED",allowSaleCommit:false,allowResend:false});
  assert.deepEqual(transitionRbsFiscalRequest("DISPATCHED","UNCERTAIN"),{status:"REQUIRES_CHECK",allowSaleCommit:false,allowResend:false});
  for(const status of ["CONFIRMED","DECLINED","REQUIRES_CHECK"]){
    assert.equal(isFinalRbsFiscalRequestStatus(status),true);
    assert.equal(mayDispatchRbsFiscalRequest(status),false);
  }
  assert.throws(()=>transitionRbsFiscalRequest("PREPARED","YES"),/only after/);
});

test("one-shot dispatch can be claimed only once and card Yes/No is separate from cash",()=>{
  assert.deepEqual(claimRbsCapDriverV1Request("PREPARED"),{status:"CLAIMED",allowResend:false});
  assert.throws(()=>claimRbsCapDriverV1Request("CLAIMED"),/only a prepared/i);
  assert.deepEqual(transitionRbsCapDriverV1OperatorOutcome("DISPATCHED","CARD","YES"),{status:"OPERATOR_CONFIRMED",allowSaleCommit:true,allowResend:false});
  assert.deepEqual(transitionRbsCapDriverV1OperatorOutcome("DISPATCHED","CARD","NO"),{status:"DECLINED",allowSaleCommit:false,allowResend:false});
  assert.deepEqual(transitionRbsCapDriverV1OperatorOutcome("DISPATCHED","CARD","UNCERTAIN"),{status:"REQUIRES_CHECK",allowSaleCommit:false,allowResend:false});
  assert.deepEqual(transitionRbsCapDriverV1OperatorOutcome("REQUIRES_CHECK","CASH","YES"),{status:"OPERATOR_CONFIRMED",allowSaleCommit:true,allowResend:false,manuallyReviewed:true});
  assert.deepEqual(transitionRbsCapDriverV1OperatorOutcome("CLAIMED","CARD","NO"),{status:"DECLINED",allowSaleCommit:false,allowResend:false,manuallyReviewed:true});
  assert.throws(()=>transitionRbsCapDriverV1OperatorOutcome("DISPATCHED","CASH","YES"),/unless an uncertain result/);
});

test("only a confirmed CAP receipt is marked fiscally issued",()=>{
  assert.equal(rbsCapDriverSaleFiscalStatus(null),"NON_FISCAL");
  assert.equal(rbsCapDriverSaleFiscalStatus({status:"OPERATOR_CONFIRMED"}),"ISSUED");
});
