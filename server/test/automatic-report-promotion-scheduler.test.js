import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticReportScheduler} from '../src/services/automatic-report-scheduler.js';
test('promotion events rotate beyond a held event and preserve exact event identity',async()=>{
 const calls=[],cursors=[];
 const work={stopping:false,track:p=>p,onStop(){}};
 const db={$queryRaw:async()=>[{companyId:'c',storeId:'s'}]};
 const scheduler=createAutomaticReportScheduler({db,work,reportType:'PROMOTION_RESULT',activationProvider:()=>({valid:true,enabled:true,fingerprint:'a'}),dispatcher:{dispatch:async scope=>{calls.push(scope);return {attempted:0,status:'HOLD'}}},readPromotionEvents:async(_db,args)=>{cursors.push(args.afterEventId);return args.afterEventId==='b'?[]:[{eventId:args.afterEventId==='a'?'b':'a'}]}});
 await scheduler.sweep();await scheduler.sweep();await scheduler.sweep();await scheduler.sweep();
 assert.deepEqual(cursors,['','a','b','']);
 assert.deepEqual(calls.map(x=>[x.frequency,x.eventId]),[['EVENT','a'],['EVENT','b'],['EVENT','a']]);
});
test('activation revocation after first event prevents remaining event admissions',async()=>{
 let enabled=true;const calls=[];
 const scheduler=createAutomaticReportScheduler({db:{$queryRaw:async()=>[{companyId:'c',storeId:'s'}]},work:{stopping:false,track:p=>p,onStop(){}},reportType:'PROMOTION_RESULT',activationProvider:()=>({valid:true,enabled,fingerprint:'a'}),readPromotionEvents:async()=>[{eventId:'a'},{eventId:'b'}],dispatcher:{dispatch:async scope=>{calls.push(scope);enabled=false;return {attempted:1}}}});
 assert.equal((await scheduler.sweep()).attempted,1);assert.equal(calls.length,1);
});

test('inventory scheduler enumerates finalized take identities through the event dispatcher',async()=>{
 const calls=[];
 const scheduler=createAutomaticReportScheduler({db:{$queryRaw:async()=>[{companyId:'c',storeId:'s'}]},work:{stopping:false,track:p=>p,onStop(){}},reportType:'INVENTORY_RESULT',activationProvider:()=>({valid:true,enabled:true,fingerprint:'a'}),readInventoryEvents:async()=>[{eventId:'take-one'}],dispatcher:{dispatch:async scope=>{calls.push(scope);return {attempted:1}}}});
 assert.equal((await scheduler.sweep()).attempted,1);
 assert.deepEqual(calls,[{companyId:'c',storeId:'s',frequency:'EVENT',eventId:'take-one'}]);
});
