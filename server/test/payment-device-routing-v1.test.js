import test from "node:test";
import assert from "node:assert/strict";
import {resolvePaymentDeviceRoute} from "../src/payment-device-routing.js";

const fiscalDevices=[
  {deviceCode:"KAT-FISCAL-01",terminalPos:"KAT-POS-01",active:true},
  {deviceCode:"KAT-FISCAL-02",terminalPos:"KAT-POS-02",active:true}
];
const eftposDevices=[
  {deviceCode:"KAT-EFTPOS-01A",fiscalDeviceCode:"KAT-FISCAL-01",role:"STORE",active:true},
  {deviceCode:"KAT-EFTPOS-01B",fiscalDeviceCode:"KAT-FISCAL-01",role:"DELIVERY",active:true},
  {deviceCode:"KAT-EFTPOS-02A",fiscalDeviceCode:"KAT-FISCAL-02",role:"STORE",active:true},
  {deviceCode:"KAT-EFTPOS-02B",fiscalDeviceCode:"KAT-FISCAL-02",role:"DELIVERY",active:true}
];

test("store transaction routes only to the terminal fiscal and STORE EFTPOS",()=>{
  assert.deepEqual(resolvePaymentDeviceRoute({terminalPos:"KAT-POS-02",channel:"IN_STORE",fiscalDevices,eftposDevices}),{
    terminalPos:"KAT-POS-02",channel:"IN_STORE",role:"STORE",fiscalDeviceCode:"KAT-FISCAL-02",eftposDeviceCode:"KAT-EFTPOS-02A",fallback:false
  });
});

test("delivery and online delivery route only to DELIVERY EFTPOS",()=>{
  for(const channel of ["DELIVERY","ONLINE_DELIVERY","PHONE_ORDER"]){
    assert.equal(resolvePaymentDeviceRoute({terminalPos:"KAT-POS-02",channel,fiscalDevices,eftposDevices}).eftposDeviceCode,"KAT-EFTPOS-02B");
  }
});

test("online pickup uses STORE EFTPOS",()=>{
  assert.equal(resolvePaymentDeviceRoute({terminalPos:"KAT-POS-02",channel:"ONLINE_PICKUP",fiscalDevices,eftposDevices}).eftposDeviceCode,"KAT-EFTPOS-02A");
});

test("routing fails closed and never silently falls back",()=>{
  assert.throws(()=>resolvePaymentDeviceRoute({terminalPos:"KAT-POS-02",channel:"DELIVERY",fiscalDevices,eftposDevices:eftposDevices.filter(row=>row.deviceCode!=="KAT-EFTPOS-02B")}),error=>error.code==="PAYMENT_EFTPOS_NOT_CONFIGURED");
  assert.throws(()=>resolvePaymentDeviceRoute({terminalPos:"KAT-POS-03",channel:"IN_STORE",fiscalDevices,eftposDevices}),error=>error.code==="PAYMENT_FISCAL_NOT_CONFIGURED");
  assert.throws(()=>resolvePaymentDeviceRoute({terminalPos:"KAT-POS-02",channel:"UNKNOWN",fiscalDevices,eftposDevices}),error=>error.code==="PAYMENT_CHANNEL_NOT_ROUTABLE");
});

test("ambiguous mappings are rejected",()=>{
  assert.throws(()=>resolvePaymentDeviceRoute({terminalPos:"KAT-POS-02",channel:"IN_STORE",fiscalDevices,eftposDevices:[...eftposDevices,{deviceCode:"KAT-EFTPOS-02C",fiscalDeviceCode:"KAT-FISCAL-02",role:"STORE",active:true}]}),error=>error.code==="PAYMENT_EFTPOS_AMBIGUOUS");
});
