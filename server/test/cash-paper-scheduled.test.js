import test from 'node:test';
import assert from 'node:assert/strict';
import {createScheduledCashPaperReader} from '../src/services/cash-paper-scheduled.js';

const scope={companyId:'synthetic-company',storeId:'synthetic-store'};
const period={actorId:'synthetic-admin',generation:'1',from:'2026-11-21T03:00:00.000Z',to:'2026-11-22T03:00:00.000Z',now:'2026-11-22T03:10:00.000Z'};
function fixture({slot=false,finalSlot=false,enabled=true,allowed=true,pendingAt,foreignDate,declaredDay}={}){
  const sources=['a','b','c','d'].map(key=>({checksum:key.repeat(64),sizeBytes:300,references:[{messageId:key}]}));
  const calls=[],readings=new Map([[sources[0].checksum,{status:'EXTRACTED_UNVERIFIED',canReread:true}]]);
  if(declaredDay)sources[0].references[0].declaredCashDay=declaredDay;
  if(foreignDate)readings.set(sources[0].checksum,{status:'EXTRACTED_UNVERIFIED',extraction:{documentDate:foreignDate},canReread:true});
  if(pendingAt)readings.set(sources[0].checksum,{status:'PENDING',requestedAt:pendingAt});
  const read=operation=>async (owner,actor,request)=>{
    assert.equal(owner.activity.execution,'BACKGROUND');
    assert.equal(owner.companyId,scope.companyId);
    assert.equal(owner.storeId,scope.storeId);
    assert.equal(actor.id,period.actorId);
    calls.push([operation,request.messageId]);
    readings.set(request.checksum,{status:'EXTRACTED_UNVERIFIED'});
  };
  const run=createScheduledCashPaperReader({
    $queryRaw:async (_sql,_company,_store,_from,_to,final)=>final?(finalSlot?[{}]:[]):(slot?[{}]:[]),
    user:{findUnique:async()=>({id:period.actorId,role:'SUPER_ADMIN'})}
  },{
    env:{AI_OWNER_WALLET_ENABLED:String(enabled)},authorized:async()=>allowed,
    repository:{generation:async()=>period.generation,get:async (_scope,key)=>readings.get(key)??{status:'NOT_READ'}},
    reader:{read:read('read'),reread:read('reread')},
    discover:async (_db,store,window)=>{
      assert.equal(store.storeId,scope.storeId);
      assert.equal(window.from.toISOString(),period.from);
      assert.equal(window.cashDay,'2026-11-21');
      return {sources};
    }
  });
  return {run,calls};
}

test('scheduled cash papers read or reread once and cap the automatic batch',async()=>{
  const {run,calls}=fixture();
  assert.equal(await run(scope,period),'MORE');
  assert.equal(await run(scope,period),'MORE');
  assert.equal(await run(scope,period),'DONE');
  assert.equal(await run(scope,period),'DONE');
  assert.deepEqual(calls,[['reread','a'],['read','b'],['read','c']]);
});

test('no provider call after a delivery slot, with disabled wallet or without scoped modules',async()=>{
  for(const config of [{slot:true},{enabled:false},{allowed:false}]){
    const {run,calls}=fixture(config);
    assert.equal(await run(scope,period),'DONE');
    assert.deepEqual(calls,[]);
  }
  const {run,calls}=fixture();
  assert.equal(await run(scope,{...period,now:'2026-11-23T03:00:00.000Z'}),'DONE');
  assert.deepEqual(calls,[]);
});

test('a concurrent read delays the report briefly and an old uncertain request is not retried',async()=>{
  const recent=fixture({pendingAt:'2026-11-22T03:09:50.000Z'});
  assert.equal(await recent.run(scope,period),'MORE');
  assert.deepEqual(recent.calls,[]);
  const stale=fixture({pendingAt:'2026-11-22T03:02:00.000Z'});
  assert.equal(await stale.run(scope,period),'MORE');
  assert.deepEqual(stale.calls,[['read','b']]);
});

test('the reader still runs when the daily delivery is scheduled at 08:00 Athens',async()=>{
  const {run,calls}=fixture();
  assert.equal(await run(scope,{...period,now:'2026-11-22T06:00:00.000Z'}),'MORE');
  assert.deepEqual(calls,[['reread','a']]);
});
test('a previously read paper dated outside the report does not consume an automatic reading position',async()=>{
 const {run,calls}=fixture({foreignDate:'2026-11-20'});
 assert.equal(await run(scope,period),'MORE');
 assert.equal(await run(scope,period),'MORE');
 assert.equal(await run(scope,period),'DONE');
 assert.deepEqual(calls,[['read','b'],['read','c'],['read','d']]);
});

test('an explicit matching cash day keeps the photo eligible for re-reading when OCR disagrees',async()=>{
  const {run,calls}=fixture({foreignDate:'2026-11-20',declaredDay:'2026-11-21'});
  assert.equal(await run(scope,period),'MORE');
  assert.deepEqual(calls,[['reread','a']]);
});

test('the final review can read after morning delivery and day rollover',async()=>{
 const afterMorning={...period,stage:'FINAL',now:'2026-11-23T05:00:00.000Z'};
 const pending=fixture({slot:true});
 assert.equal(await pending.run(scope,afterMorning),'MORE');
 assert.deepEqual(pending.calls,[['reread','a']]);
 const recorded=fixture({slot:true,finalSlot:true});
 assert.equal(await recorded.run(scope,afterMorning),'DONE');
 assert.deepEqual(recorded.calls,[]);
});
