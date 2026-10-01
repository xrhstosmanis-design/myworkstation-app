import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRemoteSessionStore,validateRemoteInput} from '../src/lib/remote-agent-session.js';
function harness(rows=[]){
 const routes=new Map(),middleware=[],queries=[],audits=[],errors=[];
 const router={use(...f){middleware.push(f);},post(path,...f){routes.set(`POST ${path}`,f);},get(path,...f){routes.set(`GET ${path}`,f);}};
 const prisma={$queryRaw:async(strings,...values)=>{queries.push({sql:strings.join('?'),values});return rows;},$executeRaw:async()=>1,authAudit:{create:async x=>audits.push(x)}};
 const source=fs.readFileSync(new URL('../src/routes/remote-agent.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export default router;','return router;');
 new Function('Router','crypto','prisma','auth','createRemoteSessionStore','validateRemoteInput',source)(()=>router,crypto,prisma,()=>{},createRemoteSessionStore,validateRemoteInput);
 const call=async(key,req)=>{let status=200,body;const res={status(s){status=s;return this;},json(b){body=b;return this;}};for(const handler of routes.get(key)){let nextCalled=false;await handler(req,res,e=>{nextCalled=true;if(e)errors.push(e);});if(body!==undefined||errors.length)break;if(!nextCalled)break;}return {status,body,errors};};
 return {call,queries,audits,middleware};
}
test('pairing requires local consent and atomically consumes exact job/terminal/company/expiry',async()=>{const h=harness([{id:'j',createdBy:'admin',terminalId:'t'}]);const invalid=await h.call('POST /pair',{ip:'a',body:{jobId:'j',terminalId:'t',code:'123456'}});assert.equal(invalid.status,400);assert.equal(h.queries.length,0);const result=await h.call('POST /pair',{ip:'b',body:{jobId:'j',terminalId:'t',code:'123456',localConsent:true}});assert.equal(result.status,201);assert.equal(typeof result.body.token,'string');const sql=h.queries[0].sql;for(const protectedTerm of ['AWAITING_DEVICE','supportCodeHash','expiresAt','t."companyId"=j."companyId"','t."storeId"=j."storeId"','s."active"=true'])assert.ok(sql.includes(protectedTerm));assert.equal(h.audits[0].data.event,'REMOTE_AGENT_LOCAL_CONSENT');assert.ok(!JSON.stringify(h.audits).includes('123456'));});
test('unknown or already consumed pairing never grants secret',async()=>{const h=harness();const result=await h.call('POST /pair',{ip:'c',body:{jobId:'j',terminalId:'t',code:'123456',localConsent:true}});assert.equal(result.status,404);assert.equal(h.audits.length,0);});
test('feature is fail-closed by default and public device token cannot authorize controller',async()=>{const h=harness();const previous=process.env.REMOTE_AGENT_ENABLED;delete process.env.REMOTE_AGENT_ENABLED;let status;h.middleware[0][0]({}, {status(s){status=s;return this;},json(){}},()=>assert.fail());assert.equal(status,503);if(previous!==undefined)process.env.REMOTE_AGENT_ENABLED=previous;const result=await h.call('GET /:jobId/frame',{params:{jobId:'missing'},user:{id:'other'}});assert.equal(result.errors[0].status,404);});
