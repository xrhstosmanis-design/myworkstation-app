import test from "node:test";
import assert from "node:assert/strict";
import {paymentTerminalChoices,resolvePaymentDeviceRoute} from "../src/payment-device-routing.js";
import {resolveRbsCapDriverV1PaymentCode} from "../src/rbs-capdriver-v1.js";
import {deviceRoutingFormValues,buildDeviceRoutingUpdate} from "../../client/src/components/platform/device-routing-form.js";
const fiscalDevices=[{deviceCode:"RBS-1",terminalPos:"POS-1",displayName:"Κεντρική"},{deviceCode:"RBS-2",terminalPos:"POS-2",displayName:"Δεύτερη"}];
const eftposDevices=[{deviceCode:"CARD-A",displayName:"Πάγκος",fiscalDeviceCode:"RBS-1",role:"STORE",transactionMode:"IMMEDIATE"},{deviceCode:"CARD-B",displayName:"Φορητό",fiscalDeviceCode:"RBS-1",role:"DELIVERY",transactionMode:"IMMEDIATE"},{deviceCode:"CARD-C",displayName:"Online",fiscalDeviceCode:"RBS-2",role:"STORE",transactionMode:"DEFERRED"}];
test("POS choices use only the authenticated register names and independent modes",()=>{
 const first=paymentTerminalChoices({terminalPos:"pos-1",fiscalDevices,eftposDevices});
 assert.equal(first.fiscalDisplayName,"Κεντρική");assert.deepEqual(first.choices.map(x=>[x.displayName,x.operationChannel]),[["Πάγκος","COUNTER"],["Φορητό","SECONDARY_IMMEDIATE"]]);
 const second=paymentTerminalChoices({terminalPos:"POS-2",fiscalDevices,eftposDevices});assert.deepEqual(second.choices.map(x=>x.operationChannel),["COUNTER_DELAYED"]);
 assert.throws(()=>paymentTerminalChoices({terminalPos:"OTHER",fiscalDevices,eftposDevices}),/ταμειακή/);
 assert.throws(()=>paymentTerminalChoices({terminalPos:"POS-1",fiscalDevices,eftposDevices:[...eftposDevices,{...eftposDevices[0],deviceCode:"DUP"}]}),/πολλαπλά/);
});
test("server rejects stale or forged mode without rerouting to another device",()=>{
 const args={terminalPos:"POS-1",channel:"DELIVERY",fiscalDevices,eftposDevices};
 assert.equal(resolvePaymentDeviceRoute({...args,operationChannel:"SECONDARY_IMMEDIATE"}).eftposDeviceCode,"CARD-B");
 assert.throws(()=>resolvePaymentDeviceRoute({...args,operationChannel:"DELIVERY_DELAYED"}),e=>e.code==="PAYMENT_EFTPOS_MODE_CHANGED");
 assert.throws(()=>resolvePaymentDeviceRoute({...args,operationChannel:"COUNTER"}),e=>e.status===409);
});
test("payment code follows device slot independently of transaction timing",()=>{
 const settings={cashCode:"6",cardCode:"2",deliveryCode:"5"};
 for(const operationChannel of ["SECONDARY_IMMEDIATE","DELIVERY_DELAYED"])assert.equal(resolveRbsCapDriverV1PaymentCode({paymentMethod:"CARD",operationChannel,settings}),"5");
 for(const operationChannel of ["COUNTER","COUNTER_DELAYED"])assert.equal(resolveRbsCapDriverV1PaymentCode({paymentMethod:"CARD",operationChannel,settings}),"2");
 assert.throws(()=>resolveRbsCapDriverV1PaymentCode({paymentMethod:"CARD",operationChannel:"SECONDARY_IMMEDIATE",settings:{...settings,deliveryCode:""}}),/επιβεβαιωθεί/);
});
test("saving one POS roundtrips modes and keeps sibling configuration intact",()=>{
 const routing={fiscalDevices,eftposDevices},values=deviceRoutingFormValues(routing,"POS-1");
 const saved=buildDeviceRoutingUpdate(routing,{...values,deliveryEftposName:"Δεύτερο άμεσο",deliveryTransactionMode:"IMMEDIATE"});
 assert.deepEqual(saved.eftposDevices.find(x=>x.deviceCode==="CARD-C"),eftposDevices[2]);
 assert.equal(deviceRoutingFormValues(saved,"POS-1").deliveryTransactionMode,"IMMEDIATE");
 assert.equal(paymentTerminalChoices({...saved,terminalPos:"POS-1"}).choices[1].displayName,"Δεύτερο άμεσο");
 const legacy={...routing,eftposDevices:eftposDevices.map(({transactionMode,...row})=>row)};
 assert.equal(deviceRoutingFormValues(legacy,"POS-1").deliveryTransactionMode,"DEFERRED");
});
