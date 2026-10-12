import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {greeceDateInput,greeceDateTimeInput,greeceDateTimeToIso} from '../../shared/greece-time.mjs';

test('Greece inputs preserve summer, winter and midnight calendar independently of host zone',()=>{
  assert.equal(greeceDateInput('2026-10-12T22:30:00Z'),'2026-10-13');
  assert.equal(greeceDateTimeInput('2026-10-12T17:22:00Z'),'2026-10-12T20:22');
  assert.equal(greeceDateTimeToIso('2026-10-12T20:22'),'2026-10-12T17:22:00.000Z');
  assert.equal(greeceDateTimeToIso('2026-01-12T20:22'),'2026-01-12T18:22:00.000Z');
  assert.equal(greeceDateTimeToIso('2026-07-12T00:00'),'2026-07-11T21:00:00.000Z');
  assert.equal(greeceDateTimeToIso('2026-01-12T23:59:59.999'),'2026-01-12T21:59:59.999Z');
  for(const TZ of ['UTC','America/Los_Angeles','Asia/Tokyo','Europe/Athens']){
    const code=`import {greeceDateInput,greeceDateTimeInput,greeceDateTimeToIso} from ${JSON.stringify(new URL('../../shared/greece-time.mjs',import.meta.url).href)};console.log(JSON.stringify([greeceDateInput('2026-10-12T22:30:00Z'),greeceDateTimeInput('2026-10-12T17:22:00Z'),greeceDateTimeToIso('2026-01-12T20:22')]));`;
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ},encoding:'utf8'})),['2026-10-13','2026-10-12T20:22','2026-01-12T18:22:00.000Z']);
  }
});
test('nonexistent, duplicate and invalid Greek wall clocks cannot silently change an instant',()=>{
  for(const value of ['2026-03-29T03:30','2026-10-25T03:30','2026-02-30T12:00','2026-10-12','2026-10-12T25:00',''])assert.throws(()=>greeceDateTimeToIso(value));
  assert.equal(greeceDateTimeToIso('2026-03-29T02:59'),'2026-03-29T00:59:00.000Z');
  assert.equal(greeceDateTimeToIso('2026-03-29T04:00'),'2026-03-29T01:00:00.000Z');
  assert.equal(greeceDateTimeToIso('2026-10-25T04:00'),'2026-10-25T02:00:00.000Z');
});
