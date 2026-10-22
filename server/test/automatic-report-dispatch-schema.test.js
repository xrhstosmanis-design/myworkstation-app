import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticReportDispatchDDL,provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
import {dispatchPolicyFingerprint,putImmutablePayload,readImmutablePayload} from '../src/services/automatic-report-dispatch-policy.js';
import {createHash} from 'node:crypto';
test('six reviewed tables provision in one transaction, abort without further DDL',async()=>{
 assert.equal(automaticReportDispatchDDL.length,6);let transactions=0,executed=0;
 await provisionAutomaticReportDispatchSchema({$transaction:async fn=>{transactions++;return fn({$executeRawUnsafe:async ddl=>{assert.match(ddl,/^CREATE TABLE IF NOT EXISTS/);executed++}})}});assert.equal(transactions,1);assert.equal(executed,6);
 const failure=new Error('DDL failure');executed=0;await assert.rejects(provisionAutomaticReportDispatchSchema({$transaction:fn=>fn({$executeRawUnsafe:async()=>{if(++executed===3)throw failure}})}),e=>e===failure);assert.equal(executed,3);
});
test('defaults are OFF and slot remains seven-column contract',()=>{assert.match(automaticReportDispatchDDL[0],/"dispatchEnabled" BOOLEAN NOT NULL DEFAULT false/);assert.match(automaticReportDispatchDDL[1],/"active" BOOLEAN NOT NULL DEFAULT false/);assert.match(automaticReportDispatchDDL[3],/"active" BOOLEAN NOT NULL DEFAULT false/);for(const name of ['slotId','companyId','storeId','version','status','token','record'])assert.ok(automaticReportDispatchDDL[5].includes('"'+name+'"'));assert.doesNotMatch(automaticReportDispatchDDL[5],/recipientId|payloadId/)});
const auth=()=>({policy:{revision:'1',dispatchEnabled:true,allowsProvisional:true,allowedFrequencies:['DAILY'],lifecycleGeneration:'9007199254740993'},grant:{revision:'2',active:true,principalId:'admin',principalSessionVersion:4,allowedFrequencies:['DAILY'],lifecycleGeneration:'9007199254740993',activationEpoch:'epoch',activationFingerprint:'a'.repeat(64),notBefore:'2026-10-22T12:00:00.000Z',createdAt:'2026-10-22T12:00:00.000Z',grantedAt:'2026-10-22T12:00:00.000Z'},recipient:{recipientId:'r'}});
test('policy fingerprint binds principal session, revisions, epoch, cutoff, recipient and full int64 generation',()=>{const baseline=dispatchPolicyFingerprint(auth());for(const [section,key,value]of [['policy','revision','2'],['grant','revision','3'],['grant','principalId','other'],['grant','principalSessionVersion',5],['grant','activationFingerprint','b'.repeat(64)],['grant','activationEpoch','other'],['grant','notBefore','2026-10-23T12:00:00.000Z'],['grant','lifecycleGeneration','9007199254740992'],['recipient','recipientId','other']]){const next=auth();next[section][key]=value;assert.notEqual(dispatchPolicyFingerprint(next),baseline)}});
const sha=s=>createHash('sha256').update(s).digest('hex');
function payload(){const body=JSON.stringify({format:'MWS_AUTOMATIC_CASH_PAYLOAD_V1',scope:{companyId:'c',storeId:'s'},frequency:'DAILY',period:{from:'2026-10-20T04:00:00.000Z',to:'2026-10-21T04:00:00.000Z'},sourceFingerprint:'a'.repeat(64),settingsVersion:1,financialFinality:'PROVISIONAL',financialReconciliationComplete:false,employeeLiabilityAdjusted:false,financialLimitations:[]});return {...JSON.parse(body),contentType:'application/json; charset=utf-8',body,byteLength:Buffer.byteLength(body),payloadFingerprint:sha(body)}}
test('immutable persistence verifies exact bytes on repeated insert/load and rejects tampering',async()=>{
 let row;const tx={$queryRaw:async(strings,...v)=>{if(strings.join('').startsWith('INSERT')){if(row)return [];row={payloadId:v[0],companyId:v[1],storeId:v[2],frequency:v[3],periodFrom:v[4],periodTo:v[5],settingsVersion:v[6],lifecycleGeneration:v[7],sourceFingerprint:v[8],payloadFingerprint:v[9],contentType:v[10],bytes:v[11],byteLength:v[12]};return [{payloadId:row.payloadId}]}return row?[row]:[]}};
 const args={companyId:'c',storeId:'s',payload:payload(),now:'2026-10-22T12:00:00.000Z',lifecycleGeneration:'3'};assert.equal((await putImmutablePayload(tx,args)).created,true);assert.equal((await putImmutablePayload(tx,args)).created,false);
 await assert.rejects(putImmutablePayload(tx,{...args,payload:{...args.payload,body:'changed'}}),{code:'REPORT_PAYLOAD_INVALID'});
 await assert.rejects(readImmutablePayload(tx,{companyId:'c',storeId:'s',payloadId:row.payloadId,lifecycleGeneration:'4'}),{code:'REPORT_PAYLOAD_LIFECYCLE_CHANGED'});
 row.expiresAt=new Date('2026-10-21T00:00:00.000Z');await assert.rejects(readImmutablePayload(tx,{companyId:'c',storeId:'s',payloadId:row.payloadId,lifecycleGeneration:'3',now:args.now}),{code:'REPORT_PAYLOAD_EXPIRED'});row.expiresAt=null;
 row.bytes=Buffer.from('tampered');await assert.rejects(readImmutablePayload(tx,{companyId:'c',storeId:'s',payloadId:row.payloadId}),{code:'REPORT_PAYLOAD_CORRUPT'});
});

test('actual management rejects unknown scope/input and explicit grant is mandatory after fresh actor lock',async()=>{
 const {createAutomaticReportManagement}=await import('../src/services/automatic-report-dispatch-policy.js'),{withLifecycleContext}=await import('../src/services/store-lifecycle-context.js');
 let transactions=0,locked=0,writes=0,session=2;
 const tx={user:{findUnique:async()=>({id:'admin',role:'SUPER_ADMIN',sessionVersion:2})},$queryRawUnsafe:async sql=>{
  if(sql.includes('AS t0'))return [Object.fromEntries(Array.from({length:6},(_,i)=>['t'+i,'table']))];
  if(sql.includes('current_schema'))return [{schema:'test',fence:'fence'}];
  if(sql.includes('StoreLifecycleFence'))return [{companyId:'c',generation:'3',maintenance:false,retired:false}];return [];
 },$queryRaw:async strings=>{const sql=strings.join('');if(sql.includes('FROM "Store"'))return [{id:'s',companyId:'c',name:'Fixture'}];if(sql.includes('FROM "User"')){locked++;return [{id:'admin',role:'SUPER_ADMIN',sessionVersion:session}]}return []},$executeRaw:async()=>{writes++;return 1}};
 const db={$transaction:async fn=>{transactions++;return fn(tx)}},service=createAutomaticReportManagement({db,activationProvider:()=>({valid:true,issuedAt:'2026-10-22T00:00:00.000Z',notBefore:'2026-10-23T00:00:00.000Z'}),sendVerification:async()=>({}),clock:()=>new Date('2026-10-22T12:00:00.000Z')}),scope={actorId:'admin',companyId:'c',storeId:'s'};
 assert.throws(()=>service.saveDispatchPolicy(scope,{expectedRevision:0,dispatchEnabled:false,allowsProvisional:false,allowedFrequencies:[],actorId:'other'}));assert.throws(()=>service.getDispatchManagement({...scope,role:'SUPER_ADMIN'}));assert.equal(transactions,0);
 await assert.rejects(withLifecycleContext({s:'3'},()=>service.saveAutomationGrant(scope,{expectedRevision:0,active:true,allowedFrequencies:['DAILY']})),{code:'REPORT_EXPLICIT_AUTHORIZATION_REQUIRED'});assert.equal(locked,1);assert.equal(writes,0);
 session=3;await assert.rejects(withLifecycleContext({s:'3'},()=>service.saveAutomationGrant(scope,{expectedRevision:0,active:true,allowedFrequencies:['DAILY'],explicitAuthorization:true})),{code:'REPORT_SUPER_ADMIN_REQUIRED'});assert.equal(writes,0);
});
