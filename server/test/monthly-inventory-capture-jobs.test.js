import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonthlyInventoryCaptureJobs,monthlyCaptureRetryDelay} from '../src/services/monthly-inventory-capture-jobs.js';
import {MONTHLY_CAPTURE_CONTROL_ENV} from '../src/services/monthly-inventory-capture-activation.js';
import {monthlyCaptureLatestDuePeriod} from '../src/services/monthly-inventory-capture-authorization.js';

const fixed=(key,value)=>({type:'SERVICE_DELEGATION',purpose:'MONTHLY_INVENTORY_CAPTURE',executor:'MONTHLY_INVENTORY_CAPTURE_V1',[key]:value});
const execution={...fixed('jobId','job'),leaseToken:'a'.repeat(64)};
const refusal={code:'MONTHLY_CAPTURE_INPUT_INVALID'};

test('monthly jobs construct without runtime credentials and OFF work never touches a database',async()=>{
 const saved=process.env[MONTHLY_CAPTURE_CONTROL_ENV];delete process.env[MONTHLY_CAPTURE_CONTROL_ENV];
 let touched=0;const db=new Proxy({}, {get(){touched++;throw Error('OFF must not even inspect the database')}});
 try{
  const jobs=createMonthlyInventoryCaptureJobs(db);assert.ok(Object.isFrozen(jobs));assert.equal(touched,0);
  assert.deepEqual(await jobs.runGrant('grant'),{status:'OFF',attempted:0,reason:'AUTHORITY_REVOKED'});
  for(const call of [()=>jobs.produce(fixed('grantId','grant')),()=>jobs.claim(fixed('jobId','job')),()=>jobs.scanEligibleGrants({after:null,limit:5})])await assert.rejects(call(),{code:'MONTHLY_CAPTURE_OFF'});
  assert.equal(touched,0);
 }finally{if(saved===undefined)delete process.env[MONTHLY_CAPTURE_CONTROL_ENV];else process.env[MONTHLY_CAPTURE_CONTROL_ENV]=saved}
});

test('the retry policy is finite, capped at60 and bounded from60 seconds to15 minutes',()=>{
 assert.deepEqual([1,2,3,4,5,60].map(monthlyCaptureRetryDelay),[60,120,240,480,900,900]);
 let previous=0;for(let n=1;n<=60;n++){const value=monthlyCaptureRetryDelay(n);assert.ok(Number.isInteger(value)&&value>=previous&&value>=60&&value<=900);previous=value;}
 for(const n of [0,61,-1,1.5,'1',null,undefined,NaN,Infinity])assert.throws(()=>monthlyCaptureRetryDelay(n),{code:'MONTHLY_CAPTURE_RETRY_LIMIT'});
});

test('latest-due classification changes exactly at Athens07 across winter, DST, leap and year boundaries',()=>{
 // Pure calendar proof; actual post-wait PostgreSQL clock execution is tested
 // separately. This does not pretend CI waited for a wall-clock month rollover.
 for(const [boundary,before,after] of [
  ['2026-11-01T05:00:00.000Z','2026-09','2026-10'],
  ['2026-04-01T04:00:00.000Z','2026-02','2026-03'],
  ['2028-03-01T05:00:00.000Z','2028-01','2028-02'],
  ['2027-01-01T05:00:00.000Z','2026-11','2026-12']
 ]){
  assert.equal(monthlyCaptureLatestDuePeriod(new Date(Date.parse(boundary)-1).toISOString()).issueMonth,before);
  assert.equal(monthlyCaptureLatestDuePeriod(boundary).issueMonth,after);
 }
 for(const invalid of ['2026-11-01','2026-11-01T05:00:00Z',new Date(),null,'2026-02-30T05:00:00.000Z'])assert.throws(()=>monthlyCaptureLatestDuePeriod(invalid));
});

test('produce and claim accept only detached fixed-purpose identity requests, never caller scope or clocks',async()=>{
 let touched=0;const jobs=createMonthlyInventoryCaptureJobs({$transaction(){touched++;throw Error('must not open')}});
 for(const [method,key] of [['produce','grantId'],['claim','jobId']]){
  for(const extra of [{companyId:'foreign'},{storeId:'foreign'},{now:'2026-01-01'},{month:'2026-01'},{sourceRevision:'a'.repeat(40)},{principal:{role:'OWNER'}},{leaseToken:'a'.repeat(64)}])await assert.rejects(jobs[method]({...fixed(key,'id'),...extra}),refusal);
  for(const value of ['', ' id','id\n','a'.repeat(161),42,null])await assert.rejects(jobs[method](fixed(key,value)),refusal);
  await assert.rejects(jobs[method]({...fixed(key,'id'),purpose:'CASH'}),refusal);
  await assert.rejects(jobs[method](fixed(key,'id'),{actor:'owner'}),refusal);
 }
 assert.equal(touched,0);
});

test('configuration and requests reject accessors, symbols and injected activation callbacks without evaluating them',async()=>{
 let touched=0;const jobs=createMonthlyInventoryCaptureJobs({$transaction(){touched++;throw Error('must not open')}});
 for(const options of [null,[],{activationProvider:()=>({enabled:true})},{enabled:true},{sourceRevision:'bad'}])assert.throws(()=>createMonthlyInventoryCaptureJobs({},options),refusal);
 const config={};Object.defineProperty(config,'sourceRevision',{enumerable:true,get(){touched++;throw Error('getter')}});assert.throws(()=>createMonthlyInventoryCaptureJobs({},config),refusal);
 const raw=fixed('grantId','id');Object.defineProperty(raw,'grantId',{enumerable:true,get(){touched++;throw Error('getter')}});await assert.rejects(jobs.produce(raw),refusal);
 await assert.rejects(jobs.claim({...fixed('jobId','id'),[Symbol('scope')]:'foreign'}),refusal);
 assert.equal(touched,0);
});

test('a supplied success receipt, status or empty attempt cannot settle a job or open a transaction',async()=>{
 let touched=0;const jobs=createMonthlyInventoryCaptureJobs({$transaction(){touched++;throw Error('must not open')}});
 await assert.rejects(jobs.settleSuccess(execution,Object.freeze({})),{code:'MONTHLY_CAPTURE_ATTEMPT_REQUIRED'});
 for(const supplied of [{receipt:{status:'STORED'}},{status:'SUCCEEDED'},new Error('pretend success')])await assert.rejects(jobs.settleSuccess(execution,Object.freeze({}),supplied),refusal);
 assert.equal(Object.hasOwn(jobs,'retry'),false);assert.equal(Object.hasOwn(jobs,'markStatus'),false);assert.equal(touched,0);
});

test('grant scans have exact bounded cursors and reject ambiguous cursor properties before SQL',async()=>{
 let touched=0;const jobs=createMonthlyInventoryCaptureJobs({$queryRawUnsafe(){touched++;throw Error('must not read')}});
 for(const limit of [0,21,-1,1.1,'5',Infinity])await assert.rejects(jobs.scanEligibleGrants({after:null,limit}),refusal);
 for(const after of [{companyId:'c',storeId:'s'},{companyId:'c',storeId:'s',id:'g',now:'x'},{companyId:'',storeId:'s',id:'g'}])await assert.rejects(jobs.scanEligibleGrants({after,limit:5}),refusal);
 const after={storeId:'s',id:'g'};Object.defineProperty(after,'companyId',{enumerable:true,get(){touched++;throw Error('getter')}});
 await assert.rejects(jobs.scanEligibleGrants({after,limit:5}),refusal);assert.equal(touched,0);
});
