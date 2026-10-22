import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAutomaticReportDispatchRouter} from '../src/routes/automatic-report-dispatch.js';

test('actual mounted dispatch routes recheck database role, bind URL scope and redact uncertain failures',async()=>{
 const calls=[];let role='SUPER_ADMIN',failure=null;
 const methods=['getDispatchManagement','saveDispatchPolicy','saveAutomationGrant','saveRecipient','revokeRecipient','issueRecipientVerification','confirmRecipientVerification','issueRecipientConsent','confirmRecipientConsent','saveRecipientConsent'];
 const management=Object.fromEntries(methods.map(method=>[method,async(scope,input)=>{calls.push({method,scope,input});if(failure)throw failure;return {ok:true}}]));
 const db={user:{findUnique:async({where})=>({id:where.id,role})}};
 const app=express();app.use(express.json({limit:'16kb'}));
 app.use((req,_res,next)=>{if(req.headers['x-test-user'])req.user={id:req.headers['x-test-user'],isSuperAdmin:true};next()});
 app.use('/api/platform/companies/:companyId/stores/:storeId/report-dispatch',createAutomaticReportDispatchRouter(db,{management}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/platform/companies/c/stores/s/report-dispatch`;
 const send=(suffix='',method='GET',body,identity='actor')=>fetch(base+suffix,{method,headers:{'content-type':'application/json',...(identity?{'x-test-user':identity}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  assert.equal((await send('', 'GET',undefined,null)).status,401);assert.equal(calls.length,0);
  role='OWNER';assert.equal((await send()).status,403);assert.equal(calls.length,0,'browser super-admin flag cannot create actual role');
  role='SUPER_ADMIN';let response=await send();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls.at(-1).scope,{actorId:'actor',companyId:'c',storeId:'s'});
  const cases=[['/policy','PUT','saveDispatchPolicy'],['/grant','PUT','saveAutomationGrant'],['/recipients','PUT','saveRecipient'],['/recipients/url-id','DELETE','revokeRecipient'],['/recipients/url-id/verification','POST','issueRecipientVerification'],['/recipients/url-id/verification/confirm','POST','confirmRecipientVerification'],['/recipients/url-id/consent/request','POST','issueRecipientConsent'],['/recipients/url-id/consent/confirm','POST','confirmRecipientConsent'],['/recipients/url-id/consent','PUT','saveRecipientConsent']];
  for(const [suffix,method,expected]of cases){response=await send(suffix,method,{expectedVersion:1,recipientId:'body-id',actorId:'body-actor'});assert.equal(response.status,200);const call=calls.at(-1);assert.equal(call.method,expected);assert.deepEqual(call.scope,{actorId:'actor',companyId:'c',storeId:'s'});if(suffix.includes('/url-id'))assert.equal(call.input.recipientId,'url-id','body cannot redirect recipient URL');}
  role='EMPLOYEE';const before=calls.length;assert.equal((await send('/grant','PUT',{})).status,403);assert.equal(calls.length,before,'role is freshly rechecked after prior success');
  role='SUPER_ADMIN';failure=Object.assign(new Error('private SMTP password/token/provider recipient'),{status:502});response=await send('/recipients/url-id/verification','POST',{});assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/password|token|provider|recipient/);
  failure=Object.assign(new Error('stale controlled configuration'),{status:409,code:'REPORT_CHANGED'});response=await send('/policy','PUT',{});assert.equal(response.status,409);assert.equal((await response.json()).code,'REPORT_CHANGED');
  failure=Object.assign(new Error('private token body'),{name:'ZodError'});response=await send('/grant','PUT',{});assert.equal(response.status,400);assert.doesNotMatch(await response.text(),/private|token/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
