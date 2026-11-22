import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createBackofficeCompanyInstallationRouter} from '../src/routes/backoffice-company-installation.js';

async function fixture({runtimePrerequisites=async()=>({ready:true})}={}){
 const calls=[],actor={id:'admin',sessionId:'session',sessionVersion:3,tokenType:'BACKOFFICE_USER',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true,companyId:'company'};
 const session={userId:'admin',expiresAt:'2030-01-01',revokedAt:null,user:{id:'admin',companyId:'company',role:'SUPER_ADMIN',sessionVersion:3,mustChangePassword:false}};
 let missing=false,dbFailure=false,serviceError=null,sessionReads=0;
 const db={userSession:{findUnique:async()=>{sessionReads++;if(dbFailure)throw Error('PRIVATE DATABASE DETAIL');return missing?null:session}}};
 const env={RENDER_GIT_COMMIT:'a'.repeat(40)};
 const app=express();app.use(express.json({limit:'200kb'}));app.use((req,_res,next)=>{if(req.headers['x-actor'])req.user={...actor};next()});
 app.use('/api/platform/backoffice-company-installation',createBackofficeCompanyInstallationRouter(db,{env,clock:()=>new Date('2026-11-18T20:00Z'),runtimePrerequisites,createInstallation:async(_db,options)=>{calls.push({options});return Object.fromEntries(['describe','inspect','install'].map(action=>[action,async(...args)=>{calls.push({action,args});if(serviceError)throw serviceError;return action==='describe'?{profile:options.profile}:{installed:action==='install',eligible:action==='inspect',packet:{sourceRevision:options.sourceRevision,profile:options.profile}}}]))}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/platform/backoffice-company-installation`;
 const send=async(path,body,headers={'x-actor':'1'})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return{calls,actor,session,db,env,send,setMissing:v=>missing=v,setDbFailure:v=>dbFailure=v,setServiceError:v=>serviceError=v,sessionReads:()=>sessionReads,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}
const installBody=()=>({profile:'CURRENT_CAPTURE',packet:{sourceRevision:'a'.repeat(40),sourcePlanHash:'b'.repeat(64)},requestEnvelope:{requestJson:'{"protocol":"synthetic-request"}',mac:'c'.repeat(64)},proofEnvelope:{proofJson:'{"protocol":"synthetic-proof"}',mac:'d'.repeat(64)},explicitAuthorization:true});

test('Company installer HTTP binds current and legacy profiles, full opaque proof packet and server enablement',async()=>{
 const f=await fixture();try{
  for(const profile of ['BASE','CAPTURE','CURRENT_CAPTURE']){const r=await f.send('/describe?profile='+profile);assert.equal(r.status,200);assert.equal((await r.json()).profile,profile);assert.equal(r.headers.get('cache-control'),'no-store');}
  assert.equal((await f.send('/inspect',{profile:'CURRENT_CAPTURE'})).status,200);assert.deepEqual(f.calls.at(-1).args,[f.actor,undefined]);
  const body=installBody();let r=await f.send('/install',body);assert.equal(r.status,200);assert.equal((await r.json()).installationEnabled,false);
  assert.deepEqual(f.calls.at(-2).options,{sourceRevision:'a'.repeat(40),enabled:false,profile:'CURRENT_CAPTURE',env:f.env});
  const {profile,...expected}=body;assert.deepEqual(f.calls.at(-1).args,[f.actor,expected]);
  f.env.BACKOFFICE_COMPANY_INSTALL_ENABLED='true';await f.send('/install',body);assert.equal(f.calls.at(-2).options.enabled,false);
  f.env.BACKOFFICE_COMPANY_INSTALL_ENABLED='1';r=await f.send('/install',body);assert.equal(r.status,200);assert.equal((await r.json()).installationEnabled,true);assert.equal(f.calls.at(-2).options.enabled,true);
 }finally{await f.close()}
});

test('Company installer HTTP revalidates persisted session and rejects scoped or forged identities before service creation',async()=>{
 const f=await fixture();try{
  assert.equal((await f.send('/describe?profile=BASE',undefined,{})).status,401);
  for(const changes of [{supportContext:{}},{staffAccess:false},{ownerCompanyId:'other'},{companyAuthority:{}},{companyCapabilities:[]},{storeId:'store'},{role:'EMPLOYEE'},{platformRole:'OWNER'},{isSuperAdmin:false},{tokenType:'STORE_OPERATOR'},{tokenType:'UNKNOWN'}]){Object.assign(f.actor,changes);const r=await f.send('/describe?profile=BASE');assert.equal(r.status,403,JSON.stringify(changes));for(const key of Object.keys(changes))delete f.actor[key];Object.assign(f.actor,{role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true,tokenType:'BACKOFFICE_USER'});}
  for(const [object,key,bad]of [[f.session,'revokedAt',new Date()],[f.session,'expiresAt','2020-01-01'],[f.session,'userId','other'],[f.session.user,'companyId','other'],[f.session.user,'id','other'],[f.session.user,'role','OWNER'],[f.session.user,'sessionVersion',4],[f.session.user,'mustChangePassword',true]]){const original=object[key];object[key]=bad;assert.equal((await f.send('/describe?profile=BASE')).status,401,key);object[key]=original;}
  f.setMissing(true);assert.equal((await f.send('/describe?profile=BASE')).status,401);f.setMissing(false);
  f.setDbFailure(true);const r=await f.send('/describe?profile=BASE');assert.equal(r.status,503);assert.ok(!(await r.text()).includes('PRIVATE DATABASE DETAIL'));assert.equal(f.calls.length,0);
 }finally{await f.close()}
});

test('Company installer HTTP refuses malformed DTOs, profiles and proof shapes without invoking business service',async()=>{
 const f=await fixture();try{
  for(const path of ['/describe','/describe?profile=CURRENT_CAPTURE&extra=1','/describe?profile=CAPTURE_REPORTS_ONLY','/describe?profile=BASE&profile=CAPTURE'])assert.equal((await f.send(path)).status,400,path);
  for(const [path,body]of [['/inspect',{}],['/inspect',{profile:'CURRENT_CAPTURE',companyId:'foreign'}],['/inspect?profile=BASE',{profile:'BASE'}],['/install',{...installBody(),explicitAuthorization:false}],['/install',{...installBody(),extra:true}],['/install',{...installBody(),packet:null}],['/install',{...installBody(),requestEnvelope:{requestJson:'x',mac:'0'}}],['/install',{...installBody(),proofEnvelope:{proofJson:'x',mac:'d'.repeat(64),extra:true}}]])assert.equal((await f.send(path,body)).status,400,path+JSON.stringify(body));
  for(const body of [{...installBody(),packet:{value:'x'.repeat(98304)}},{...installBody(),requestEnvelope:{requestJson:'x'.repeat(32769),mac:'c'.repeat(64)}},{...installBody(),proofEnvelope:{proofJson:'x'.repeat(32769),mac:'d'.repeat(64)}}])assert.equal((await f.send('/install',body)).status,400);
  assert.equal(f.calls.length,0);f.env.RENDER_GIT_COMMIT='invalid';assert.equal((await f.send('/inspect',{profile:'BASE'})).status,503);assert.equal(f.calls.length,0);
 }finally{await f.close()}
});

test('production issueSession passes actual auth into Company installer; revoked sessions and forged owners refuse',async()=>{
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
  app.use('/api/platform/backoffice-company-installation',auth,createBackofficeCompanyInstallationRouter(db,{env:{RENDER_GIT_COMMIT:'a'.repeat(40)},createInstallation:async()=>({describe:()=>{calls.push('describe');return {profile:'CURRENT_CAPTURE'}}})}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/platform/backoffice-company-installation/describe?profile=CURRENT_CAPTURE`;
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


test('Company installer HTTP preserves stale-proof status and redacts unexpected service failures',async()=>{
 const f=await fixture();try{
  f.setServiceError(Object.assign(Error('PRIVATE SIGNED PROOF'),{status:409,code:'COMPANY_INSTALL_STALE_PACKET'}));let r=await f.send('/install',installBody());assert.equal(r.status,409);let body=await r.json();assert.equal(body.code,'COMPANY_INSTALL_STALE_PACKET');assert.ok(!body.error.includes('PRIVATE'));
  f.setServiceError(Object.assign(Error('PRIVATE STORAGE CREDENTIAL'),{status:500,code:'UNKNOWN'}));r=await f.send('/inspect',{profile:'CURRENT_CAPTURE'});assert.equal(r.status,503);body=await r.json();assert.equal(body.code,'COMPANY_INSTALL_UNCONFIRMED');assert.ok(!body.error.includes('PRIVATE'));
 }finally{await f.close()}
});


test('Company installer HTTP withholds eligibility when fixed runtime prerequisites are missing without altering signed packet',async()=>{
 const prerequisites={pythonAvailable:true,postgresClientAvailable:false,postgresDumpAvailable:false,postgresVersionsMatch:false,awsCliAvailable:true,databaseConfigured:true,storageConfigured:true,storageCredentialsConfigured:true,signingConfigured:true,ready:false};
 let observations=0;const f=await fixture({runtimePrerequisites:async()=>{observations++;return prerequisites}});try{
  const response=await f.send('/inspect',{profile:'CURRENT_CAPTURE'});assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.eligible,false);assert.deepEqual(body.packet,{sourceRevision:'a'.repeat(40),profile:'CURRENT_CAPTURE'});assert.deepEqual(body.runtimePrerequisites,prerequisites);
  assert.deepEqual(Object.keys(body.runtimePrerequisites).sort(),['pythonAvailable','postgresClientAvailable','postgresDumpAvailable','postgresVersionsMatch','awsCliAvailable','databaseConfigured','storageConfigured','storageCredentialsConfigured','signingConfigured','ready'].sort());
  assert.ok(Object.values(body.runtimePrerequisites).every(value=>typeof value==='boolean'));assert.equal(observations,1);assert.equal(f.calls.filter(call=>call.action==='inspect').length,1);assert.equal(f.calls.filter(call=>call.action==='install').length,0);assert.deepEqual(f.calls.at(-1).args,[f.actor,undefined]);
 }finally{await f.close()}
});
