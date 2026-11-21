import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {n40ReadHeaders,n40PublishRead,N40_LAB_STORE} from '../../shared/n40-read-trace.mjs';
import {createExpectedReceiptInstallationSession,sameExpectedReceiptCredential} from '../../client/src/components/commerce/expected-receipt-installation-context.mjs';
const now=Date.parse('2026-11-21T10:00:00Z'),base='/api/platform/expected-receipt-installation/stores/store';
const claims={id:'admin',sessionId:'session',sessionVersion:3,tokenType:'BACKOFFICE_USER',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true,mustChangePassword:false,exp:now/1000+3600};
const token=patch=>'synthetic.'+Buffer.from(JSON.stringify({...claims,...patch})).toString('base64url')+'.synthetic';
function storage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function fixture(){const local=storage(),tab=storage();local.setItem('token',token());return {local,tab,session:createExpectedReceiptInstallationSession({storage:local,sessions:tab,now:()=>now})};}

test('No14 retains an issued central credential only for the same support actor/session/version',async()=>{
 const f=fixture(),central=f.local.getItem('token'),bound=f.session.context();
 assert.deepEqual(bound.credentialIdentity,{actorId:'admin',sessionId:'session',sessionVersion:3,expiresAt:claims.exp*1000});
 const support=token({supportContext:{storeId:'foreign'}});f.local.setItem('token',support);
 const calls=[],request=f.session.bind(async(path,options)=>{calls.push({path,options});return {eligible:true};},base,bound);
 for(const headers of [{Authorization:'Bearer wrong',authorization:'Bearer lowercase','Content-Type':'application/json'},new Headers({authorization:'Bearer wrong','content-type':'application/json'})]){
  await request(base+'/inspect',{headers});
  const final=calls.at(-1).options.headers;
  assert.equal(final.Authorization,'Bearer '+central);
  assert.equal(new Headers(final).get('authorization'),'Bearer '+central);
  assert.equal(new Headers(final).get('content-type'),'application/json');
 }
 assert.equal(f.local.getItem('token'),support,'shared support credential is never rewritten');
 for(const patch of [{id:'other-admin'},{sessionId:'other-session'},{sessionVersion:4},{exp:now/1000-1},{tokenType:'STORE_OPERATOR'},{isSuperAdmin:false,platformRole:'OWNER'}]){
  f.local.setItem('token',token({...patch,supportContext:{}}));
  await assert.rejects(request(base+'/inspect'));
 }
});

test('No14 binding admits only its exact store, own endpoints and methods before transport',async()=>{
 const f=fixture();let calls=0;const request=f.session.bind(async()=>{calls++;return {};},base);
 for(const [path,method] of [[base+'/inspect','POST'],[base+'/install','GET'],[base+'/describe','POST'],[base+'/inspect?x=1','GET'],[base+'/inspect#x','GET'],[base+'/inspect/','GET'],[base.replace('/stores/store','/stores/foreign')+'/install','POST'],['https://example.invalid'+base+'/inspect','GET'],['/api/platform/companies/c/stores/store/report-event-installation/install','POST']])await assert.rejects(request(path,{method}));
 assert.equal(calls,0);
 await request(base+'/inspect');await request(base+'/describe');await request(base+'/install',{method:'POST',body:'{}'});assert.equal(calls,3);
 for(const invalid of [base+'?x=1',base+'#x','https://example.invalid'+base,base+'/extra'])assert.throws(()=>f.session.bind(async()=>{},invalid));
});

for(const outcome of ['resolve','reject'])test('No14 discards '+outcome+' after logout, changed identity/session/version or renewed expiry',async()=>{
 for(const [field,change] of [['logout',f=>f.local.removeItem('token')],...['id','sessionId','sessionVersion','exp'].map(key=>[key,f=>f.local.setItem('token',token({[key]:key==='sessionVersion'?4:key==='exp'?claims.exp+600:'changed'}))])]){
  const f=fixture();let release;
  const request=f.session.bind(()=>new Promise((resolve,reject)=>{release=outcome==='resolve'?()=>resolve({packet:'stale'}):()=>reject(Error('transport failure'));}),base);
  const pending=request(base+'/inspect');change(f);release();await assert.rejects(pending,{code:field==='exp'?'EXPECTED_RECEIPT_INSTALL_CONTEXT_CHANGED':'REPORT_INSTALLER_CONTEXT_CHANGED'});
 }
});

test('No14 watch observes A/B/A and invalidates old epoch while durable identity survives real remount',async()=>{
 const f=fixture(),timers=new Map();let sequence=0,changed=0;
 const win=new EventTarget(),doc=new EventTarget();
 win.setInterval=fn=>{const id=++sequence;timers.set(id,fn);return id;};win.clearInterval=id=>timers.delete(id);
 const stop=f.session.watch(()=>changed++,win,doc),original=f.session.context();let release;
 const old=f.session.bind(()=>new Promise(resolve=>{release=resolve}),base,original)(base+'/inspect');
 f.local.setItem('token',token({id:'other-admin'}));win.dispatchEvent(new Event('storage'));
 f.local.setItem('token',token());win.dispatchEvent(new Event('focus'));
 assert.equal(changed,2);release({packet:'old'});await assert.rejects(old,{code:'REPORT_INSTALLER_CONTEXT_CHANGED'});
 const fresh=f.session.context();assert.notEqual(fresh.key,original.key);assert.deepEqual(fresh.credentialIdentity,original.credentialIdentity);
 const remounted=createExpectedReceiptInstallationSession({storage:f.local,sessions:f.tab,now:()=>now});
 assert.deepEqual(remounted.context().credentialIdentity,fresh.credentialIdentity,'durable journal proof excludes per-instance epoch');
 assert.notEqual(remounted.context().key,fresh.key);
 stop();assert.equal(timers.size,0);
});

test('No14 same-session support movement remains valid while platformToken fallback requires exact identity',async()=>{
 const f=fixture(),bound=f.session.context();let release;
 const pending=f.session.bind(()=>new Promise(resolve=>{release=resolve}),base,bound)(base+'/inspect');
 f.local.setItem('token',token({supportContext:{storeId:'other'}}));release({eligible:true});assert.deepEqual(await pending,{eligible:true});
 const g=fixture();g.tab.setItem('platformToken',token());g.local.setItem('token',token({supportContext:{}}));assert.equal(g.session.context().token,token());
 const h=fixture();h.tab.setItem('platformToken',token({sessionId:'foreign'}));h.local.setItem('token',token({supportContext:{}}));assert.throws(()=>h.session.context());
});


test('No14 durable credential proof rejects missing or malformed fields instead of matching undefined',()=>{
 const valid={actorId:'admin',sessionId:'session',sessionVersion:3,expiresAt:claims.exp*1000};
 assert.equal(sameExpectedReceiptCredential(valid,{...valid}),true);
 for(const malformed of [null,undefined,{},[],{...valid,actorId:''},{...valid,sessionId:''},{...valid,sessionVersion:-1},{...valid,sessionVersion:'3'},{...valid,sessionVersion:0.5},{...valid,expiresAt:NaN},{...valid,expiresAt:Infinity},{...valid,expiresAt:0},{...valid,expiresAt:String(valid.expiresAt)}]){
  assert.equal(sameExpectedReceiptCredential(malformed,malformed),false);
  assert.equal(sameExpectedReceiptCredential(valid,malformed),false);
 }
});


test('No14 rejects a caller-replaced bound token before transport',async()=>{
 const f=fixture(),bound=f.session.context();let calls=0;
 const request=f.session.bind(async()=>{calls++;},base,{...bound,token:token({extraClaim:true})});
 await assert.rejects(request(base+'/inspect'),{code:'EXPECTED_RECEIPT_INSTALL_CONTEXT_CHANGED'});assert.equal(calls,0);
});


test('No14 native binding survives the actual common main API and preserves real N40 read headers',async()=>{
 const source=readFileSync(new URL('../../client/src/main.jsx',import.meta.url),'utf8');
 const matches=[...source.matchAll(/^const api=async\(path,options=\{\}\)=>\{[\s\S]*?^\};/gm)];
 assert.equal(matches.length,1,'actual main API extraction contract changed');
 const f=fixture(),bound=f.session.context(),scope={companyId:'company',storeId:N40_LAB_STORE},calls=[],published=[];
 f.local.setItem('token',token({supportContext:scope}));f.local.setItem('supportContext',JSON.stringify(scope));
 const fetch=async(path,options)=>{calls.push({path,options});return {ok:true,status:200,json:async()=>({eligible:true})};};
 const actualApi=new Function('localStorage','fetch','n40ReadHeaders','n40PublishRead',matches[0][0]+'\nreturn api;')(f.local,fetch,
  (path,selected,method)=>n40ReadHeaders(path,selected,method,()=> '1'.repeat(32)),
  (path,selected,trace,status)=>n40PublishRead(path,selected,trace,status,null,{console:{info:(...values)=>published.push(values)}}));
 const ownBase='/api/platform/expected-receipt-installation/stores/'+N40_LAB_STORE;
 await f.session.bind(actualApi,ownBase,bound)(ownBase+'/inspect',{headers:{authorization:'Bearer caller','content-type':'application/json'}});
 const sent=calls[0];assert.equal(sent.path,ownBase+'/inspect');
 assert.equal(new Headers(sent.options.headers).get('authorization'),'Bearer '+token());
 assert.equal(new Headers(sent.options.headers).get('content-type'),'application/json');
 assert.equal(sent.options.headers['X-MWS-N40-Trace'],'n40-'+'1'.repeat(32));
 assert.equal(sent.options.headers['X-MWS-N40-Store'],N40_LAB_STORE);assert.equal(sent.options.headers['X-MWS-N40-Company'],'company');
 assert.equal(published.length,1);assert.equal(JSON.parse(published[0][1]).status,200);
 assert.equal(f.local.getItem('token'),token({supportContext:scope}));
});
