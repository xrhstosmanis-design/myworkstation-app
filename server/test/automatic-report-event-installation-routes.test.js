import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAutomaticReportEventInstallationRouter} from '../src/routes/automatic-report-event-installation.js';

test('event installation HTTP requires current platform session and binds packet, scope and server controls',async()=>{
 const calls=[];let revoked=false,role='SUPER_ADMIN',sessionVersion=3,mustChangePassword=false,catalogDrift=false;
 const actor={id:'admin',sessionId:'session',sessionVersion:3,tokenType:'BACKOFFICE_USER',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true};
 const db={userSession:{findUnique:async()=>({userId:'admin',expiresAt:'2030-01-01',revokedAt:revoked?new Date():null,user:{id:'admin',role,sessionVersion,mustChangePassword}})}};
 const env={RENDER_GIT_COMMIT:'a'.repeat(40)};
 const createInstallation=async(_db,options)=>{
  if(catalogDrift)throw Object.assign(new Error("private catalogue details"),{status:409,code:"REPORT_COLUMN_CATALOGUE_CHANGED"});
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
  sessionVersion=4;assert.equal((await send('/describe?profile=BASE')).status,401);sessionVersion=3;
  mustChangePassword=true;assert.equal((await send('/describe?profile=BASE')).status,401);mustChangePassword=false;
  role='OWNER';assert.equal((await send('/describe?profile=BASE')).status,401);role='SUPER_ADMIN';
  for(const tokenType of ['STORE_OPERATOR','INVENTORY_COUNTER','BACKGROUND','UNKNOWN','']){
   actor.tokenType=tokenType;
   assert.equal((await send('/describe?profile=BASE')).status,403);
  }
  actor.tokenType='BACKOFFICE_USER';
  actor.isSuperAdmin=false;actor.platformRole='OWNER';
  assert.equal((await send('/describe?profile=BASE')).status,403);
  actor.isSuperAdmin=true;actor.platformRole='SUPER_ADMIN';
  assert.equal(calls.length,0);
  assert.equal((await send('/describe?profile=BASE')).status,200);
  delete actor.tokenType;assert.equal((await send('/describe?profile=BASE')).status,200);actor.tokenType='BACKOFFICE_USER';
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
  catalogDrift=true;
  const drift=await send('/inspect',{profile:'CAPTURE_REPORTS_ONLY_V2'});
  assert.equal(drift.status,409);
  const rejected=await drift.json();assert.equal(rejected.code,'REPORT_COLUMN_CATALOGUE_CHANGED');
  assert.doesNotMatch(rejected.error,/private catalogue/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('production issueSession token passes auth middleware into installer while unknown types and forged owners refuse',async()=>{
 const previousSecret=process.env.JWT_SECRET,previousPrisma=globalThis.prisma;
 process.env.JWT_SECRET='synthetic-installer-session-regression-secret';
 const user={id:'native-admin',companyId:'company',role:'SUPER_ADMIN',sessionVersion:2,mustChangePassword:false,email:'synthetic@example.invalid',fullName:'Synthetic',company:{id:'company',active:true}};
 let session;
 const db={userSession:{
  create:async({data})=>session={...data,id:'native-session',lastSeenAt:new Date(),user},
  findUnique:async()=>session,
  update:async()=>session
 }};
 globalThis.prisma=db;
 let server;
 try{
  const {issueSession}=await import('../src/routes/auth.js');
  const {auth}=await import('../src/middleware/auth.js');
  const {default:jwt}=await import('jsonwebtoken');
  const issued=await issueSession(user,{headers:{},ip:'127.0.0.1'},'Synthetic',db);
  const claims=jwt.verify(issued.token,process.env.JWT_SECRET);
  assert.equal(claims.tokenType,'BACKOFFICE_USER');assert.equal(claims.role,'OWNER');assert.equal(claims.platformRole,'SUPER_ADMIN');
  const calls=[],app=express();app.use(express.json());
  app.use('/companies/:companyId/stores/:storeId',auth,createAutomaticReportEventInstallationRouter(db,{env:{RENDER_GIT_COMMIT:'a'.repeat(40)},createInstallation:async()=>({describe:()=>{calls.push('describe');return {profile:'CAPTURE_REPORTS_ONLY'}}})}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/companies/company/stores/store/describe?profile=CAPTURE_REPORTS_ONLY`;
  const send=token=>fetch(base,{headers:{authorization:'Bearer '+token}});
  assert.equal((await send(issued.token)).status,200);assert.deepEqual(calls,['describe']);
  const {iat,exp,...unsigned}=claims;
  const unknown=jwt.sign({...unsigned,tokenType:'UNKNOWN'},process.env.JWT_SECRET,{expiresIn:'1h'});
  assert.equal((await send(unknown)).status,403);
  user.role='OWNER';
  assert.equal((await send(issued.token)).status,401,'persisted owner cannot use forged platform flags');
  user.role='SUPER_ADMIN';session.revokedAt=new Date();
  assert.equal((await send(issued.token)).status,401);assert.deepEqual(calls,['describe']);
 }finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;
  if(previousPrisma===undefined)delete globalThis.prisma;else globalThis.prisma=previousPrisma;
 }
});
