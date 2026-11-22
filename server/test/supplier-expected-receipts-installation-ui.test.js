import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('No14 UI capability gate, explicit shared-schema approval and ambiguous same-packet retry',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
 const keys=['window','document','navigator','HTMLElement','Node','Event','sessionStorage','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/ExpectedReceiptInstallationPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const nativeClaims={id:'admin',sessionId:'native-session',sessionVersion:3,tokenType:'BACKOFFICE_USER',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true,mustChangePassword:false,exp:Math.floor(Date.now()/1000)+3600};
 const credential=patch=>'synthetic.'+Buffer.from(JSON.stringify({...nativeClaims,...patch})).toString('base64url')+'.synthetic';
 const nativeCredential=credential({});dom.window.localStorage.setItem('token',nativeCredential);
 const root=createRoot(document.getElementById('root')),calls=[];
 let permitted=false,ambiguous=true,installed=false,heldInstall,hold=false,actorId='admin',revision='a'.repeat(40),inspectFails=false,postRefreshFails=false,enabled=false,enrollmentGeneration=0,malformedInspection,postMalformed=false;
 const packet={actorId:'admin',companyId:'c',storeId:'s',sourceRevision:'a'.repeat(40),oldPlanHash:'b'.repeat(64),targetPlanHash:'c'.repeat(64),targetProfile:'NO14',schema:'public',enrollments:[{companyId:'c',storeId:'s',generation:0}],installed:false};
 const api=async(path,options)=>{assert.equal(options?.headers?.Authorization,'Bearer '+nativeCredential);calls.push({path,options});if(path.endsWith('/inspect')){if(malformedInspection!==undefined)return malformedInspection;if(!permitted||inspectFails)throw Error('denied');return {eligible:enabled,reasons:enabled?[]:['EXPECTED_RECEIPT_INSTALL_DISABLED'],packet:{...packet,enrollments:[{companyId:'c',storeId:'s',generation:enrollmentGeneration}],actorId,sourceRevision:revision,storeId:path.includes('/stores/B/')?'B':'s',installed}};}if(path.endsWith('/install')){assert.deepEqual(JSON.parse(options.body),{packet,explicitAuthorization:true});if(ambiguous)throw Error('connection lost');if(hold)return new Promise(resolve=>heldInstall=resolve);installed=true;if(postMalformed)malformedInspection={eligible:true};if(postRefreshFails)inspectFails=true;return {installed:true};}throw Error('unexpected path');};
 const render=(storeId='s')=>act(async()=>root.render(React.createElement(module.exports.default,{api,storeId})));
 const button=label=>[...document.querySelectorAll('button')].find(n=>n.textContent===label);
 try{
  await render();assert.equal(document.querySelector('input[type=checkbox]'),null,'a denied server preflight cannot reveal installation authority');
  assert.equal(button('Ρητή εγκατάσταση αναμενόμενων παραλαβών'),undefined);
  assert(button('Επανέλεγχος εγκατάστασης'),'locally admitted central session can retry a failed server GET without an install action');
  for(const malformed of [null,{}, {actorId:'owner',companyId:'c',storeId:'s',rows:[]}, {eligible:true}, {eligible:true,packet:{}}, {eligible:true,packet:{...packet,installed:null}}, {eligible:true,packet:{...packet,actorId:''}}, {eligible:true,packet:{...packet,enrollments:null}}]){
   await act(async()=>root.render(null));malformedInspection=malformed;await render();
   assert.equal(document.querySelector('input[type=checkbox]'),null,'malformed capability response must not reveal installer controls');
   assert.equal(button('Ρητή εγκατάσταση αναμενόμενων παραλαβών'),undefined);
   assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,0);
  }
  malformedInspection=undefined;
  await act(async()=>root.render(null));permitted=true;await render();
  assert.match(document.body.textContent,/κοινό schema/);
  assert.equal(button('Ρητή εγκατάσταση αναμενόμενων παραλαβών').disabled,true);
  await act(async()=>document.querySelector('input[type=checkbox]').click());
  assert.equal(button('Ρητή εγκατάσταση αναμενόμενων παραλαβών').disabled,true,'installer flag OFF cannot authorize POST');
  assert.match(document.body.textContent,/απενεργοποιημένη/);
  enabled=true;await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  await act(async()=>document.querySelector('input[type=checkbox]').click());
  dom.window.localStorage.setItem('token',credential({supportContext:{storeId:'other-store'}}));
  await act(async()=>dom.window.dispatchEvent(new Event('storage')));
  await act(async()=>button('Ρητή εγκατάσταση αναμενόμενων παραλαβών').click());
  assert.match(document.querySelector('[role=alert]').textContent,/connection lost/);
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,1,'no automatic retry');
  assert.deepEqual(JSON.parse(sessionStorage.getItem('mws:no14-install:admin:c:s')).packet,packet);
  malformedInspection={eligible:true,packet:{}};
  await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.match(document.querySelector('[role=alert]').textContent,/Μη έγκυρη απάντηση/);
  assert.deepEqual(JSON.parse(sessionStorage.getItem('mws:no14-install:admin:c:s')).packet,packet,'malformed explicit refresh cannot clear or replace the retained packet');
  assert.equal(button('Επανάληψη ίδιου αιτήματος'),undefined,'malformed refresh disables action while retaining original journal');
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,1);
  malformedInspection=undefined;
  await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,1);
  enrollmentGeneration=1;await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(button('Επανάληψη ίδιου αιτήματος').disabled,true,'flag ON cannot authorize stale original enrollment after fresh inspection');
  assert.deepEqual(JSON.parse(sessionStorage.getItem('mws:no14-install:admin:c:s')).packet,packet);
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,1);
  enrollmentGeneration=0;await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  actorId='other-admin';await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(button('Επανάληψη ίδιου αιτήματος'),undefined,'response for changed actor cannot reveal a retry action');
  actorId='admin';revision='b'.repeat(40);await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(button('Επανάληψη ίδιου αιτήματος').disabled,true,'changed revision cannot relabel pending request');
  revision='a'.repeat(40);await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  // Remount preserves the immutable pending packet across closing the panel.
  await act(async()=>root.render(null));await render();
  assert(button('Επανάληψη ίδιου αιτήματος'));
  ambiguous=false;await act(async()=>button('Επανάληψη ίδιου αιτήματος').click());
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,2);
  assert.equal(sessionStorage.getItem('mws:no14-install:admin:c:s'),null);
  assert.match(document.body.textContent,/τρέχον target επαληθεύτηκε/);
  installed=false;await act(async()=>root.render(null));await render();
  await act(async()=>document.querySelector('input[type=checkbox]').click());postMalformed=true;
  await act(async()=>button('Ρητή εγκατάσταση αναμενόμενων παραλαβών').click());
  assert.match(document.querySelector('[role=alert]').textContent,/Μη έγκυρη απάντηση/);
  assert.deepEqual(JSON.parse(sessionStorage.getItem('mws:no14-install:admin:c:s')).packet,packet,'malformed verification after successful POST must retain the original packet');
  const postsAfterMalformed=calls.filter(c=>c.path.endsWith('/install')).length;
  assert(button('Επανάληψη ίδιου αιτήματος'));
  postMalformed=false;malformedInspection=undefined;
  await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(sessionStorage.getItem('mws:no14-install:admin:c:s'),null);
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,postsAfterMalformed,'recovering malformed verification uses GET without another POST');
  installed=false;await act(async()=>root.render(null));await render();
  await act(async()=>document.querySelector('input[type=checkbox]').click());postRefreshFails=true;
  await act(async()=>button('Ρητή εγκατάσταση αναμενόμενων παραλαβών').click());
  assert(sessionStorage.getItem('mws:no14-install:admin:c:s'),'successful POST followed by failed verification retains original packet');
  assert(button('Επανάληψη ίδιου αιτήματος'));
  inspectFails=false;postRefreshFails=false;enabled=false;enrollmentGeneration=1;
  const postsBeforeReconcile=calls.filter(c=>c.path.endsWith('/install')).length;
  await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert(sessionStorage.getItem('mws:no14-install:admin:c:s'),'different enrollment cannot resolve original pending request');
  assert.equal(button('Επανάληψη ίδιου αιτήματος').disabled,true);
  enrollmentGeneration=0;await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(sessionStorage.getItem('mws:no14-install:admin:c:s'),null,'explicit GET can reconcile exact current target even after installer flag OFF');
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,postsBeforeReconcile,'GET reconciliation performs zero POST');
  enabled=true;
  installed=false;await act(async()=>root.render(null));await render();
  await act(async()=>document.querySelector('input[type=checkbox]').click());hold=true;
  await act(async()=>button('Ρητή εγκατάσταση αναμενόμενων παραλαβών').click());
  await render('B');
  assert.equal(button('Επανέλεγχος εγκατάστασης').disabled,false,'old pending POST cannot leave next store busy');
  await act(async()=>heldInstall({installed:true}));
  assert.equal(button('Επανέλεγχος εγκατάστασης').disabled,false);
  assert(sessionStorage.getItem('mws:no14-install:admin:c:s'),'late previous-store success cannot clear its retained journal');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];}
});

test('No14 mounted central-session epochs preserve stable journals across reload and reject changed credentials',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
 const keys=['window','document','navigator','HTMLElement','Node','Event','sessionStorage','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/ExpectedReceiptInstallationPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const claims={id:'admin',sessionId:'session-A',sessionVersion:2,tokenType:'BACKOFFICE_USER',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true,mustChangePassword:false,exp:Math.floor(Date.now()/1000)+3600};
 const credential=patch=>'synthetic.'+Buffer.from(JSON.stringify({...claims,...patch})).toString('base64url')+'.synthetic';
 dom.window.localStorage.setItem('token',credential({}));
 const packet={actorId:'admin',companyId:'c',storeId:'s',sourceRevision:'a'.repeat(40),oldPlanHash:'b'.repeat(64),targetPlanHash:'c'.repeat(64),targetProfile:'NO14',schema:'public',enrollments:[{companyId:'c',storeId:'s',generation:0}],installed:false};
 const root=createRoot(document.getElementById('root')),calls=[],key='mws:no14-install:admin:c:s';
 let installed=false,postMode='ambiguous',releasePost,holdInspect=false,releaseInspect,failInspect=false;
 const inspection=()=>({eligible:true,packet:{...packet,installed}});
 const api=async(path,options)=>{
  calls.push({path,options});
  if(path.endsWith('/inspect')){if(failInspect)throw Object.assign(Error('synthetic service unavailable'),{status:503});return holdInspect?new Promise(resolve=>{releaseInspect=resolve}):inspection();}
  assert.equal(path.endsWith('/install'),true);
  assert.deepEqual(JSON.parse(options.body),{packet,explicitAuthorization:true});
  assert.equal(options.headers.Authorization,'Bearer '+credential({}));
  if(postMode==='ambiguous')throw Error('ambiguous synthetic response');
  if(postMode==='hold')return new Promise(resolve=>{releasePost=resolve});
  installed=true;return {installed:true};
 };
 const render=()=>act(async()=>root.render(React.createElement(module.exports.default,{api,storeId:'s'})));
 const close=()=>act(async()=>root.render(null));
 const button=label=>[...document.querySelectorAll('button')].find(n=>n.textContent===label);
 const change=async patch=>act(async()=>{patch===null?dom.window.localStorage.removeItem('token'):dom.window.localStorage.setItem('token',credential(patch));dom.window.dispatchEvent(new Event('storage'));});
 const begin=async()=>{await act(async()=>document.querySelector('input[type=checkbox]').click());await act(async()=>button('Ρητή εγκατάσταση αναμενόμενων παραλαβών').click());};
 try{
  for(const denied of [null,{isSuperAdmin:false,platformRole:'OWNER'},{tokenType:'STORE_OPERATOR'},{supportContext:{storeId:'foreign'}}]){
   denied===null?dom.window.localStorage.removeItem('token'):dom.window.localStorage.setItem('token',credential(denied));
   await render();assert.equal(document.querySelector('section'),null);assert.equal(calls.length,0,'ordinary/missing/unretained credentials cannot call privileged capability API');await close();
  }
  dom.window.localStorage.setItem('token',credential({}));failInspect=true;await render();
  assert.match(document.querySelector('[role=alert]').textContent,/synthetic service unavailable/);
  assert.equal(button('Ρητή εγκατάσταση αναμενόμενων παραλαβών'),undefined);
  failInspect=false;await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,0,'explicit recovery of a failed capability uses GET only');
  await change({id:'other-admin'});await change({});
  assert.equal(button('Ρητή εγκατάσταση αναμενόμενων παραλαβών'),undefined,'observed A/B/A consumes old capability and acknowledgement');
  await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  await change({supportContext:{storeId:'foreign'}});
  await begin();
  const saved=JSON.parse(sessionStorage.getItem(key));
  assert.deepEqual(saved,{version:2,packet,credentialIdentity:{actorId:'admin',sessionId:'session-A',sessionVersion:2,expiresAt:claims.exp*1000}});
  assert.equal('token' in saved,false);assert.equal('contextKey' in saved,false,'opaque per-instance epoch must not be durable proof');
  await close();await render();
  assert.equal(button('Επανάληψη ίδιου αιτήματος').disabled,false,'fresh adapter epoch permits explicit retry for unchanged issued credential');
  postMode='success';await act(async()=>button('Επανάληψη ίδιου αιτήματος').click());
  assert.equal(sessionStorage.getItem(key),null);
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,2);
  // A failed initial capability cannot lose the original journal when explicit GET later succeeds.
  await close();sessionStorage.setItem(key,JSON.stringify(saved));dom.window.localStorage.setItem('token',credential({}));installed=false;failInspect=true;await render();
  assert.equal(button('Επανάληψη ίδιου αιτήματος'),undefined);
  failInspect=false;await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(button('Επανάληψη ίδιου αιτήματος').disabled,false);
  assert.deepEqual(JSON.parse(sessionStorage.getItem(key)),saved,'recovery restores stable proof and unchanged original packet');
  assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,2);
  // Malformed persisted evidence remains review-only, with its original bytes intact.
  await close();sessionStorage.setItem(key,'{malformed');await render();
  assert.equal(button('Επανάληψη ίδιου αιτήματος').disabled,true);
  await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(sessionStorage.getItem(key),'{malformed');assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,2);
  // Same actor but a different session, version or renewed expiry cannot relabel the old packet.
  for(const patch of [{sessionId:'session-B'},{sessionVersion:3},{exp:claims.exp+600}]){
   await close();sessionStorage.setItem(key,JSON.stringify(saved));dom.window.localStorage.setItem('token',credential(patch));await render();
   assert.equal(button('Επανάληψη ίδιου αιτήματος').disabled,true);
   const count=calls.filter(c=>c.path.endsWith('/install')).length;
   await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
   assert.deepEqual(JSON.parse(sessionStorage.getItem(key)),saved,'exact target alone cannot reconcile a v2 journal under another credential');
   assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,count);
  }
  // Legacy packets can be reviewed and resolved with an exact target GET, never posted.
  await close();sessionStorage.setItem(key,JSON.stringify(packet));dom.window.localStorage.setItem('token',credential({}));installed=false;await render();
  assert.equal(button('Επανάληψη ίδιου αιτήματος').disabled,true);
  const beforeLegacy=calls.filter(c=>c.path.endsWith('/install')).length;installed=true;
  await act(async()=>button('Επανέλεγχος εγκατάστασης').click());
  assert.equal(sessionStorage.getItem(key),null);assert.equal(calls.filter(c=>c.path.endsWith('/install')).length,beforeLegacy);
  // A response arriving after logout cannot verify installation or erase its journal.
  await close();installed=false;postMode='hold';await render();await begin();
  const beforeLogout=sessionStorage.getItem(key),gets=calls.filter(c=>c.path.endsWith('/inspect')).length;
  await change(null);await act(async()=>releasePost({installed:true}));
  assert.equal(sessionStorage.getItem(key),beforeLogout);assert.equal(calls.filter(c=>c.path.endsWith('/inspect')).length,gets,'late POST cannot issue a verification GET after logout');
  assert.equal(button('Επανάληψη ίδιου αιτήματος'),undefined);
  // A renewed expiry is observed even though No7's identity epoch itself does not change.
  await close();sessionStorage.removeItem(key);dom.window.localStorage.setItem('token',credential({}));await render();
  await act(async()=>document.querySelector('input[type=checkbox]').click());await change({exp:claims.exp+600});
  assert.equal(button('Ρητή εγκατάσταση αναμενόμενων παραλαβών'),undefined);
  // Initial asynchronous capability cannot survive an observed A/B/A transition.
  await close();dom.window.localStorage.setItem('token',credential({}));holdInspect=true;await render();
  await change({id:'other-admin'});await change({});
  await act(async()=>releaseInspect(inspection()));
  assert.equal(document.querySelector('section'),null);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];}
});
