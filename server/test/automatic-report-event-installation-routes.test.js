import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAutomaticReportEventInstallationRouter} from '../src/routes/automatic-report-event-installation.js';

test('event installation HTTP requires current platform session and binds packet, scope and server controls',async()=>{
 const calls=[];let revoked=false,role='SUPER_ADMIN';
 const actor={id:'admin',sessionId:'session',sessionVersion:3,isSuperAdmin:true};
 const db={userSession:{findUnique:async()=>({userId:'admin',expiresAt:'2030-01-01',revokedAt:revoked?new Date():null,user:{id:'admin',role,sessionVersion:3,mustChangePassword:false}})}};
 const env={RENDER_GIT_COMMIT:'a'.repeat(40)};
 const createInstallation=async(_db,options)=>{
  calls.push({options});
  return {describe:()=>({profile:options.profile}),inspect:async(user,input)=>{calls.push({user,input,action:'inspect'});return {eligible:true}},install:async(user,input)=>{calls.push({user,input,action:'install'});return {installed:true}}};
 };
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{if(req.headers['x-actor'])req.user={...actor,...(req.headers['x-support']?{supportContext:{}}:{})};next()});
 app.use('/companies/:companyId/stores/:storeId',createAutomaticReportEventInstallationRouter(db,{env,createInstallation}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/companies/c/stores/s`;
 const send=(path,body,headers={'x-actor':'1'})=>fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await send('/describe?profile=BASE',null,{})).status,401);
  assert.equal((await send('/describe?profile=BASE',null,{'x-actor':'1','x-support':'1'})).status,403);
  revoked=true;assert.equal((await send('/describe?profile=BASE')).status,401);revoked=false;
  role='OWNER';assert.equal((await send('/describe?profile=BASE')).status,401);role='SUPER_ADMIN';
  assert.equal(calls.length,0);
  assert.equal((await send('/describe?profile=BASE')).status,200);
  assert.deepEqual(calls.at(-1).options,{sourceRevision:'a'.repeat(40),enabled:false,profile:'BASE'});
  assert.equal((await send('/inspect',{profile:'CAPTURE'})).status,200);
  assert.deepEqual(calls.at(-1).input,{companyId:'c',storeId:'s'});
  const packet={sourceRevision:'a'.repeat(40),evidence:'opaque'};
  assert.equal((await send('/install',{profile:'CAPTURE',packet,explicitAuthorization:false})).status,400);
  assert.equal((await send('/install',{profile:'CAPTURE',packet,explicitAuthorization:true,companyId:'other'})).status,400);
  env.AUTOMATIC_REPORT_EVENT_INSTALL_ENABLED='true';
  assert.equal((await send('/install',{profile:'CAPTURE',packet,explicitAuthorization:true})).status,200);
  assert.equal(calls.at(-2).options.enabled,false);
  assert.deepEqual(calls.at(-1),{action:'install',user:actor,input:{companyId:'c',storeId:'s',packet,explicitAuthorization:true}});
  env.AUTOMATIC_REPORT_EVENT_INSTALL_ENABLED='1';
  assert.equal((await send('/install',{profile:'CAPTURE',packet,explicitAuthorization:true})).status,200);
  assert.equal(calls.at(-2).options.enabled,true);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
