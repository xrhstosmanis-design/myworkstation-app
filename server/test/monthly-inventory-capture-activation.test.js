import test from 'node:test';
import assert from 'node:assert/strict';
import {MONTHLY_CAPTURE_SERVICE_ID,MONTHLY_CAPTURE_CONTROL_ENV,monthlyCaptureActivationInstant,readMonthlyCaptureActivation,readCurrentMonthlyCaptureActivation} from '../src/services/monthly-inventory-capture-activation.js';

const control=(changes={})=>({v:1,purpose:'MONTHLY_INVENTORY_CAPTURE',serviceId:MONTHLY_CAPTURE_SERVICE_ID,epoch:'11111111-1111-4111-8111-111111111111',issuedAt:'2026-10-30T12:00:00.000Z',notBefore:'2026-10-31T12:00:00.000Z',enabled:true,...changes});
const environment=value=>({RENDER_SERVICE_ID:MONTHLY_CAPTURE_SERVICE_ID,[MONTHLY_CAPTURE_CONTROL_ENV]:typeof value==='string'?value:JSON.stringify(value)});

test('dedicated canonical monthly control is frozen and binds purpose, service and complete identity',()=>{
 const raw=control(),value=readMonthlyCaptureActivation(environment(raw));
 assert.equal(value.valid,true);assert.equal(value.enabled,true);assert.equal(value.purpose,'MONTHLY_INVENTORY_CAPTURE');assert.equal(value.serviceId,MONTHLY_CAPTURE_SERVICE_ID);assert.equal(Object.isFrozen(value),true);assert.match(value.fingerprint,/^[a-f0-9]{64}$/);
 const disabled=readMonthlyCaptureActivation(environment(control({enabled:false}))),newEpoch=readMonthlyCaptureActivation(environment(control({epoch:'22222222-2222-4222-8222-222222222222'})));
 assert.equal(disabled.valid,true);assert.equal(disabled.enabled,false);assert.notEqual(disabled.fingerprint,value.fingerprint);assert.equal(disabled.activationFingerprint,value.activationFingerprint);assert.notEqual(newEpoch.fingerprint,value.fingerprint);
 // An ordinary deployment revision is not forever pinned into the control.
 assert.deepEqual(readMonthlyCaptureActivation({...environment(raw),RENDER_GIT_COMMIT:'a'.repeat(40)}),readMonthlyCaptureActivation({...environment(raw),RENDER_GIT_COMMIT:'b'.repeat(40)}));
});

test('missing, foreign, CASH or ambiguous representations cannot enable monthly capture',()=>{
 const value=JSON.stringify(control());
 const invalid=[undefined,null,'',false,1,'null','[]','{}',' '.repeat(2049),value+' ',value.replace('{','{\n'),value.replace('"v":1','"v":1,"v":1'),JSON.stringify({purpose:'MONTHLY_INVENTORY_CAPTURE',...control()}),JSON.stringify({...control(),extra:true}),JSON.stringify(control({purpose:'CASH'})),JSON.stringify(control({serviceId:'foreign'})),JSON.stringify(control({v:'1'})),JSON.stringify(control({enabled:'true'})),JSON.stringify(control({epoch:'11111111-1111-1111-8111-111111111111'})),value.replace('MONTHLY_INVENTORY_CAPTURE','MONTHLY_INVENTORY_CAPTUR\\u0045')];
 for(const raw of invalid)assert.equal(readMonthlyCaptureActivation(environment(raw)).enabled,false,String(raw));
 assert.equal(readMonthlyCaptureActivation({...environment(control()),RENDER_SERVICE_ID:'foreign'}).enabled,false);
 assert.equal(readMonthlyCaptureActivation({RENDER_SERVICE_ID:MONTHLY_CAPTURE_SERVICE_ID,AUTOMATIC_REPORT_ACTIVATION_CONTROL:value}).enabled,false);
 assert.equal(readMonthlyCaptureActivation({}).enabled,false);
});

test('activation instants require exact UTC milliseconds and increasing declared bounds, without a host-clock gate',()=>{
 for(const value of ['2026-10-31T12:00:00Z','2026-10-31T14:00:00.000+02:00','2026-02-30T12:00:00.000Z','2026-10-31T12:00:00.0000Z','infinity',null,0])assert.equal(monthlyCaptureActivationInstant(value),false);
 assert.equal(monthlyCaptureActivationInstant('2028-02-29T12:00:00.000Z'),true);
 for(const change of [{notBefore:'2026-10-30T12:00:00.000Z'},{notBefore:'2026-10-29T12:00:00.000Z'},{issuedAt:'2026-02-30T12:00:00.000Z'}])assert.equal(readMonthlyCaptureActivation(environment(control(change))).enabled,false);
 // Parsing a future control does not substitute this host's clock for the
 // actual database clock checked by producer/claim/source/write/settlement.
 assert.equal(readMonthlyCaptureActivation(environment(control({issuedAt:'2099-01-01T00:00:00.000Z',notBefore:'2099-01-02T00:00:00.000Z'}))).enabled,true);
});

test('runtime current control reads only actual process environment, never a supplied provider or environment',()=>{
 const names=['RENDER_SERVICE_ID',MONTHLY_CAPTURE_CONTROL_ENV],saved=new Map(names.map(name=>[name,process.env[name]]));
 try{
  process.env.RENDER_SERVICE_ID=MONTHLY_CAPTURE_SERVICE_ID;delete process.env[MONTHLY_CAPTURE_CONTROL_ENV];
  assert.equal(readCurrentMonthlyCaptureActivation(environment(control())).enabled,false);
  process.env[MONTHLY_CAPTURE_CONTROL_ENV]=JSON.stringify(control());assert.equal(readCurrentMonthlyCaptureActivation().enabled,true);
  process.env[MONTHLY_CAPTURE_CONTROL_ENV]=JSON.stringify(control({enabled:false}));assert.equal(readCurrentMonthlyCaptureActivation().enabled,false);
 }finally{for(const [name,value] of saved)if(value===undefined)delete process.env[name];else process.env[name]=value;}
});
