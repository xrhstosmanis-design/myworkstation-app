// Real shared React controls with an isolated DOM/API fixture. Not USER/LAB PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
const company={id:'owner-company',name:'Owner fixture'};
const stores=[{id:'A',name:'Store A',active:true},{id:'B',name:'Store B',active:true}];
function bootstrap(store,name){return {company,contextStore:store,stores,roles:[],shiftTemplates:[],ruleDefinitions:[],ruleSeverities:[],shiftCategories:[],capabilities:{rulesManagement:false,migrationApply:false},employees:[{id:'employee-'+store.id,fullName:name,baseStoreId:store.id,baseStoreName:store.name,active:true,paymentType:'HOURLY',roles:[],rules:[],hourlyRates:[],storeAccess:[{storeId:store.id,active:true}],maxDaysPerWeek:5,maxHoursPerWeek:40}]}}
test('Owner Workforce: shared panel, invitation, module denial and store switching',async t=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/cloud/OwnerWorkforceHub.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const Hub=module.exports.default,dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});
 const keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const mount=async(request,initialStoreId='')=>{await act(async()=>root.render(null));await act(async()=>root.render(React.createElement(Hub,{company,stores,request,initialStoreId})));};
 const select=async id=>act(async()=>{const el=document.querySelector('.owner-workforce>.panel-head select');el.value=id;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes(text));
 const click=async text=>act(async()=>button(text).dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
 try{
  await t.test('no automatic company-wide request when no store is selected',async()=>{const calls=[];await mount(async path=>{calls.push(path)});assert.equal(calls.length,0);assert.match(document.body.textContent,/Επίλεξε κατάστημα/);});
  await t.test('same employee actions and tabs, invitation scoped to the selected store',async()=>{
   const calls=[];await mount(async(path,options)=>{calls.push({path,options});return path.endsWith('/bootstrap')?bootstrap(stores[0],'Employee A'):{mobileUrl:'/store/A?employee-card=1&employee=employee-A'}},'A');
   for(const text of ['Εκτύπωση κάρτας','Αποστολή εφαρμογής','Ρόλοι','Κανόνες','Πρότυπα βαρδιών','Πρόγραμμα & Άδειες','Παρουσίες','Μισθοδοσία','Προεπισκόπηση μεταφοράς'])assert.ok(button(text),text);
   await click('Αποστολή εφαρμογής');assert.match(document.querySelector('[role="dialog"] input').value,/\/store\/A\?employee-card=1/);assert.equal(calls.at(-1).path,'/api/platform/store-modules/companies/owner-company/stores/A/workforce-v2/employees/employee-A/work-card');assert.equal(calls.at(-1).options.method,'POST');await click('Κλείσιμο');
  });
  await t.test('disabled module exposes the server denial without employee actions',async()=>{await mount(async()=>{throw new Error('Το πακέτο προσωπικού δεν είναι ενεργό για αυτό το κατάστημα.')},'B');assert.match(document.body.textContent,/δεν είναι ενεργό/);assert.equal(button('Εκτύπωση κάρτας'),undefined);});
  await t.test('late previous-store response cannot replace current employees',async()=>{
   const old=deferred();await mount(path=>path.includes('/stores/A/')?old.promise:Promise.resolve(bootstrap(stores[1],'Employee B')),'A');await select('B');assert.match(document.body.textContent,/Employee B/);await act(async()=>old.resolve(bootstrap(stores[0],'Employee A')));assert.match(document.body.textContent,/Employee B/);assert.doesNotMatch(document.body.textContent,/Employee A/);await select('');assert.equal(button('Εκτύπωση κάρτας'),undefined);
  });
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
