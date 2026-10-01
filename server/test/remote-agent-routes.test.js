import test from 'node:test';
import {createRemoteTrialGate} from '../src/lib/remote-agent-trial.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRemoteSessionStore,validateRemoteInput} from '../src/lib/remote-agent-session.js';
function harness(rows=[]){
 const routes=new Map(),middleware=[],queries=[],audits=[],errors=[];
 const router={use(...f){middleware.push(f);},post(path,...f){routes.set(`POST ${path}`,f);},get(path,...f){routes.set(`GET ${path}`,f);}};
 const prisma={$queryRaw:async(strings,...values)=>{queries.push({sql:strings.join('?'),values});return rows;},$executeRaw:async()=>1,authAudit:{create:async x=>audits.push(x)}};
 const source=fs.readFileSync(new URL('../src/routes/remote-agent.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export default router;','return router;');
 new Function('Router','crypto','prisma','auth','createRemoteSessionStore','validateRemoteInput','createRemoteTrialGate',source)(()=>router,crypto,prisma,()=>{},createRemoteSessionStore,validateRemoteInput,()=>createRemoteTrialGate({REMOTE_AGENT_ENABLED:'true',REMOTE_AGENT_TRIAL_TERMINAL_ID:'t',REMOTE_AGENT_TRIAL_UNTIL:new Date(Date.now()+60000).toISOString()}));
 const call=async(key,req)=>{let status=200,body;const res={status(s){status=s;return this;},json(b){body=b;return this;}};for(const handler of routes.get(key)){let nextCalled=false;await handler(req,res,e=>{nextCalled=true;if(e)errors.push(e);});if(body!==undefined||errors.length)break;if(!nextCalled)break;}return {status,body,errors};};
 return {call,queries,audits,middleware};
}
test('pairing requires local consent and atomically consumes exact job/terminal/company/expiry',async()=>{const h=harness([{id:'j',createdBy:'admin',terminalId:'t'}]);const invalid=await h.call('POST /pair',{ip:'a',body:{jobId:'j',terminalId:'t',code:'123456'}});assert.equal(invalid.status,400);assert.equal(h.queries.length,0);const result=await h.call('POST /pair',{ip:'b',body:{jobId:'j',terminalId:'t',code:'123456',localConsent:true}});assert.equal(result.status,201);assert.equal(typeof result.body.token,'string');const sql=h.queries[0].sql;for(const protectedTerm of ['AWAITING_DEVICE','supportCodeHash','expiresAt','t."companyId"=j."companyId"','t."storeId"=j."storeId"','s."active"=true'])assert.ok(sql.includes(protectedTerm));assert.equal(h.audits[0].data.event,'REMOTE_AGENT_LOCAL_CONSENT');assert.ok(!JSON.stringify(h.audits).includes('123456'));});
test('unknown or already consumed pairing never grants secret',async()=>{const h=harness();const result=await h.call('POST /pair',{ip:'c',body:{jobId:'j',terminalId:'t',code:'123456',localConsent:true}});assert.equal(result.status,404);assert.equal(h.audits.length,0);});
test('feature is fail-closed by default and public device token cannot authorize controller',async()=>{const h=harness();assert.equal(createRemoteTrialGate({}).enabled(),false);const result=await h.call('GET /:jobId/frame',{params:{jobId:'missing'},user:{id:'other'}});assert.equal(result.errors[0].status,404);});

test('foreign terminal is rejected before database consumption',async()=>{const h=harness();const result=await h.call('POST /pair',{ip:'scope',body:{jobId:'j',terminalId:'foreign',code:'123456',localConsent:true}});assert.equal(result.status,403);assert.equal(h.queries.length,0);});

test('code-only pairing needs consent, accepts six digits and returns the server job ID',async()=>{
 const h=harness([{id:'resolved-job',createdBy:'admin',terminalId:'t'}]);
 for(const body of [{code:'123456'},{code:'12345',localConsent:true},{code:123456,localConsent:true},{code:'abcdef',localConsent:true}]){
  const r=await h.call('POST /pair-code',{ip:JSON.stringify(body),body});assert.equal(r.status,400);
 }
 assert.equal(h.queries.length,0);
 const r=await h.call('POST /pair-code',{ip:'valid',body:{code:'123456',localConsent:true,jobId:'foreign-job',terminalId:'foreign'}});
 assert.equal(r.status,201);assert.equal(r.body.jobId,'resolved-job');assert.equal(typeof r.body.token,'string');
 const {sql,values}=h.queries[0];
 assert.equal(values[0],'t');assert.equal(values[1],crypto.createHash('sha256').update('123456').digest('hex'));
 assert.ok(!values.includes('foreign-job'));assert.ok(!values.includes('foreign'));
 for(const guard of ['MATERIALIZED','LIMIT 2','HAVING COUNT(*)=1','REMOTE_ASSIST','AWAITING_DEVICE','supportCodeHash','expiresAt','t."companyId"=j."companyId"','t."storeId"=j."storeId"','t."active"=true','s."active"=true'])assert.ok(sql.includes(guard),guard);
 assert.ok(!JSON.stringify(h.audits).includes('123456'));
 const owner=await h.call('GET /:jobId/frame',{params:{jobId:'resolved-job'},user:{id:'other'}});
 assert.equal(owner.errors[0].status,403);
});
test('code-only unknown, expired, consumed or ambiguous lookup grants no token',async()=>{
 for(const rows of [[],[{id:'a'},{id:'b'}]]){
  const h=harness(rows);const r=await h.call('POST /pair-code',{ip:'deny',body:{code:'123456',localConsent:true}});
  assert.equal(r.status,404);assert.equal(r.body.token,undefined);assert.equal(h.audits.length,0);
 }
});
test('code-only pairing is limited to five attempts per minute',async()=>{
 const h=harness();
 for(let i=0;i<5;i++)assert.equal((await h.call('POST /pair-code',{ip:'repeat',body:{code:'123456',localConsent:true}})).status,404);
 assert.equal((await h.call('POST /pair-code',{ip:'repeat',body:{code:'123456',localConsent:true}})).status,429);
 assert.equal(h.queries.length,5);
});
