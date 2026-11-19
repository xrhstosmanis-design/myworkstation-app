import test from 'node:test';
import assert from 'node:assert/strict';
import {createReportInstallerSession} from '../../client/src/components/platform/report-event-installation-context.mjs';
const now=Date.parse('2026-11-19T16:00:00Z');
const base='/api/platform/companies/company/stores/store/report-event-installation';
const claims={id:'admin',sessionId:'session',sessionVersion:3,tokenType:'BACKOFFICE_USER',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true,mustChangePassword:false,exp:now/1000+3600};
const token=patch=>'synthetic.'+Buffer.from(JSON.stringify({...claims,...patch})).toString('base64url')+'.synthetic';
function storage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function fixture(){const local=storage(),tab=storage();local.setItem('token',token());return {local,tab,session:createReportInstallerSession({storage:local,sessions:tab,now:()=>now})};}

test('mount capture retains issued native credential across same-session support changes without rewriting shared token',async()=>{
 const {local,tab,session}=fixture(),central=local.getItem('token');
 session.capture();assert.equal(tab.values.size,1);
 const support=token({companyId:'other-company',supportContext:{companyId:'other-company'}});local.setItem('token',support);
 const calls=[],request=session.bind(async(path,options)=>{calls.push({path,options});return {eligible:true};},base);
 assert.deepEqual(await request(base+'/inspect',{method:'POST',headers:{Authorization:'Bearer wrong'}}),{eligible:true});
 assert.equal(calls[0].options.headers.Authorization,'Bearer '+central);
 assert.equal(local.getItem('token'),support);
 assert.equal(local.values.size,1);
});
test('existing native platformToken can be reused only for the same current user/session/version',()=>{
 const {local,tab,session}=fixture();tab.setItem('platformToken',token());local.setItem('token',token({supportContext:{storeId:'store'}}));
 assert.equal(session.context().token,token());
 for(const patch of [{id:'another-admin'},{sessionId:'another-session'},{sessionVersion:4},{supportContext:{}},{exp:now/1000-1}]){
  const f=fixture();f.tab.setItem('platformToken',token(patch));f.local.setItem('token',token({supportContext:{}}));
  assert.throws(()=>f.session.context(),{code:'REPORT_INSTALLER_SESSION_REQUIRED'});
 }
});
test('operator, background, owner, expired and missing current credentials cannot use a retained central session',()=>{
 for(const patch of [{tokenType:'STORE_OPERATOR'},{tokenType:'POS_BACKGROUND'},{isSuperAdmin:false,platformRole:'OWNER'},{mustChangePassword:true},{exp:now/1000-1}]){
  const f=fixture();f.session.capture();f.local.setItem('token',token(patch));assert.throws(()=>f.session.context(),{code:'REPORT_INSTALLER_SESSION_REQUIRED'});
 }
 const f=fixture();f.session.capture();f.local.removeItem('token');assert.throws(()=>f.session.context(),{code:'REPORT_INSTALLER_SESSION_REQUIRED'});assert.equal([...f.tab.values.values()].some(value=>value===token()),false);
});
test('bound response is discarded after logout or identity change, while same-identity support movement remains valid',async()=>{
 for(const change of [f=>f.local.removeItem('token'),f=>f.local.setItem('token',token({id:'another-admin'})),f=>f.local.setItem('token',token({sessionVersion:4}))]){
  const f=fixture();let release;
  const request=f.session.bind(()=>new Promise(resolve=>{release=resolve}),base);
  const pending=request(base+'/inspect',{method:'POST'});change(f);release({packet:'old'});
  await assert.rejects(pending,{code:'REPORT_INSTALLER_CONTEXT_CHANGED'});
 }
 const f=fixture();let release;
 const request=f.session.bind(()=>new Promise(resolve=>{release=resolve}),base);
 const pending=request(base+'/inspect',{method:'POST'});f.local.setItem('token',token({supportContext:{storeId:'different'}}));release({eligible:true});assert.deepEqual(await pending,{eligible:true});
});
test('request binding admits only declared installer routes and methods',async()=>{
 const f=fixture();let calls=0;
 const request=f.session.bind(async()=>{calls++;return {};},base);
 for(const [path,method] of [[base+'/install','GET'],[base+'/inspect','PUT'],[base+'/describe?profile=UNKNOWN','GET'],[base+'/describe?profile=CAPTURE&other=1','GET'],['/api/platform/companies/other/stores/store/report-event-installation/install','POST']])await assert.rejects(request(path,{method}),{code:'REPORT_INSTALLER_REQUEST_REJECTED'});
 assert.equal(calls,0);
 await request(base+'/describe?profile=CAPTURE_REPORTS_ONLY_V2');assert.equal(calls,1);
});

test('another actor support context invalidates retained credentials until a native session is captured again',()=>{
 const f=fixture();f.session.capture();f.tab.setItem('platformToken',token());
 f.local.setItem('token',token({id:'another-admin',supportContext:{}}));
 assert.throws(()=>f.session.context(),{code:'REPORT_INSTALLER_SESSION_REQUIRED'});
 f.local.setItem('token',token({supportContext:{}}));
 assert.throws(()=>f.session.context(),{code:'REPORT_INSTALLER_SESSION_REQUIRED'});
 const remounted=createReportInstallerSession({storage:f.local,sessions:f.tab,now:()=>now});
 assert.throws(()=>remounted.context(),{code:'REPORT_INSTALLER_SESSION_REQUIRED'});
 f.local.setItem('token',token());remounted.capture();
 f.local.setItem('token',token({supportContext:{}}));assert.equal(remounted.context().token,token());
});
test('expired support context cannot use a still-live retained native credential',()=>{
 const f=fixture();f.session.capture();f.local.setItem('token',token({supportContext:{},exp:now/1000-1}));
 assert.throws(()=>f.session.context(),{code:'REPORT_INSTALLER_SESSION_REQUIRED'});
});

test('observed A to B to A identity transitions invalidate an in-flight A response',async()=>{
 const f=fixture();let release;const request=f.session.bind(()=>new Promise(resolve=>{release=resolve}),base);
 const pending=request(base+'/inspect',{method:'POST'});
 f.local.setItem('token',token({id:'another-admin'}));f.session.capture();
 f.local.setItem('token',token());f.session.capture();release({packet:'old-A'});
 await assert.rejects(pending,{code:'REPORT_INSTALLER_CONTEXT_CHANGED'});
});
