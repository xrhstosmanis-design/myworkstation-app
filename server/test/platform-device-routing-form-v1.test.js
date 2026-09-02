import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {deviceRoutingFormValues} from "../../client/src/components/platform/device-routing-form.js";

const platformUi=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

const routing={
  fiscalDevices:[
    {deviceCode:"KAT-FISCAL-01",displayName:"Ταμειακή 1",terminalPos:"KAT-POS-01",active:true},
    {deviceCode:"KAT-FISCAL-02",displayName:"Ταμειακή 2",terminalPos:"KAT-POS-02",active:true}
  ],
  eftposDevices:[
    {deviceCode:"KAT-EFTPOS-01A",displayName:"EFTPOS 1 καταστήματος",fiscalDeviceCode:"KAT-FISCAL-01",role:"STORE",active:true},
    {deviceCode:"KAT-EFTPOS-01B",displayName:"EFTPOS 1 Delivery",fiscalDeviceCode:"KAT-FISCAL-01",role:"DELIVERY",active:true},
    {deviceCode:"KAT-EFTPOS-02A",displayName:"EFTPOS καταστήματος",fiscalDeviceCode:"KAT-FISCAL-02",role:"STORE",active:true},
    {deviceCode:"KAT-EFTPOS-02B",displayName:"EFTPOS Delivery / Online",fiscalDeviceCode:"KAT-FISCAL-02",role:"DELIVERY",active:true}
  ]
};

test("routing form loads the saved fiscal and EFTPOS values for the selected terminal",()=>{
  assert.deepEqual(deviceRoutingFormValues(routing,"KAT-POS-02"),{
    terminalPos:"KAT-POS-02",
    fiscalDeviceCode:"KAT-FISCAL-02",
    fiscalDisplayName:"Ταμειακή 2",
    storeEftposCode:"KAT-EFTPOS-02A",
    storeEftposName:"EFTPOS καταστήματος",
    deliveryEftposCode:"KAT-EFTPOS-02B",
    deliveryEftposName:"EFTPOS Delivery / Online",
    complete:true
  });
});

test("routing form remains fail closed when the selected terminal has no mapping",()=>{
  const values=deviceRoutingFormValues(routing,"KAT-POS-03");
  assert.equal(values.terminalPos,"KAT-POS-03");
  assert.equal(values.fiscalDeviceCode,"");
  assert.equal(values.storeEftposCode,"");
  assert.equal(values.deliveryEftposCode,"");
  assert.equal(values.complete,false);
});

test("routing form never borrows an EFTPOS from another fiscal device",()=>{
  const withoutSecondEftpos={...routing,eftposDevices:routing.eftposDevices.filter(row=>row.fiscalDeviceCode!=="KAT-FISCAL-02")};
  const values=deviceRoutingFormValues(withoutSecondEftpos,"kat-pos-02");
  assert.equal(values.fiscalDeviceCode,"KAT-FISCAL-02");
  assert.equal(values.storeEftposCode,"");
  assert.equal(values.deliveryEftposCode,"");
  assert.equal(values.complete,false);
});

test("Platform Admin binds the terminal selector to stored routing values",()=>{
  assert.match(platformUi,/deviceRoutingFormValues\(terminalManager\?\.routing,routingTerminalPos\)/);
  assert.match(platformUi,/value=\{routingTerminalPos\} onChange=\{event=>setRoutingTerminalPos\(event\.target\.value\)\}/);
  assert.match(platformUi,/defaultValue=\{routingFormValues\.fiscalDeviceCode\}/);
  assert.match(platformUi,/defaultValue=\{routingFormValues\.storeEftposCode\}/);
  assert.match(platformUi,/defaultValue=\{routingFormValues\.deliveryEftposCode\}/);
  assert.match(platformUi,/Φορτώθηκε το αποθηκευμένο mapping του/);
});
