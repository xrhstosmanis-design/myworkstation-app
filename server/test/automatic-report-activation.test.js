import test from 'node:test';
import assert from 'node:assert/strict';
import {readActivation,activationAllows,ACTIVATION_SERVICE_ID} from '../src/services/automatic-report-activation.js';
const raw={v:1,serviceId:ACTIVATION_SERVICE_ID,epoch:'12345678-1234-4123-8123-123456789abc',issuedAt:'2026-10-22T09:00:00.000Z',notBefore:'2026-10-22T21:00:00.000Z',enabled:true};
const read=value=>readActivation({RENDER_SERVICE_ID:ACTIVATION_SERVICE_ID,AUTOMATIC_REPORT_ACTIVATION_CONTROL:JSON.stringify(value)});
const args=control=>({activationEpoch:control.epoch,activationFingerprint:control.activationFingerprint,createdAt:'2026-10-22T10:00:00.000Z',periodFrom:raw.notBefore,now:'2026-10-23T09:00:00.000Z'});
test('activation is external, immutable and OFF without exact service/control authority',()=>{
  for(const env of [{},{AUTOMATIC_REPORT_ACTIVATION_CONTROL:JSON.stringify(raw)},{RENDER_SERVICE_ID:'cron',AUTOMATIC_REPORT_ACTIVATION_CONTROL:JSON.stringify(raw)}])assert.equal(readActivation(env).enabled,false);
  for(const bad of [{...raw,enabled:'true'},{...raw,extra:1},{...raw,notBefore:raw.issuedAt},{...raw,issuedAt:'2026-02-30T09:00:00.000Z'},{...raw,epoch:'old'}])assert.equal(read(bad).valid,false);
  assert.equal(readActivation({RENDER_SERVICE_ID:ACTIVATION_SERVICE_ID,AUTOMATIC_REPORT_ACTIVATION_CONTROL:JSON.stringify(raw).replace('"v":1','"v":1,"v":1')}).valid,false);
  const control=read(raw);assert.ok(Object.isFrozen(control));assert.equal(control.valid,true);
});
test('advance enrollment survives OFF to ON identity while full fingerprint detects toggle',()=>{
  const on=read(raw),off=read({...raw,enabled:false});
  assert.equal(on.activationFingerprint,off.activationFingerprint);assert.notEqual(on.fingerprint,off.fingerprint);
  assert.equal(activationAllows(on,args(on)),true);assert.equal(activationAllows(off,args(off)),false);
});
test('restore rotates external epoch and denies archived grants and historical/crossing periods',()=>{
  const control=read(raw),grant=args(control);
  const restored=read({...raw,epoch:'87654321-1234-4123-8123-123456789abc'});
  assert.equal(activationAllows(restored,grant),false);
  for(const change of [{createdAt:'2026-10-22T08:59:59.999Z'},{createdAt:'2026-10-24T00:00:00.000Z'},{periodFrom:'2026-10-22T20:59:59.999Z'},{now:'2026-10-22T20:59:59.999Z'},{activationFingerprint:'0'.repeat(64)}])assert.equal(activationAllows(control,{...grant,...change}),false);
  assert.equal(activationAllows(control,{...grant,createdAt:raw.issuedAt,now:raw.notBefore}),true);
});
