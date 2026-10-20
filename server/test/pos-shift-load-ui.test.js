import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted shift view publishes overview before slow sales, exposes failure/retry, ignores stale scope and ends stalled reads',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','MutationObserver','IS_REACT_ACT_ENVIRONMENT','setTimeout','clearTimeout'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),realSet=setTimeout,realClear=clearTimeout,deadlines=new Map();
 for(const k of keys.slice(0,7))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 globalThis.setTimeout=(fn,ms,...args)=>{const id=realSet(fn,ms,...args);if(ms===15000)deadlines.set(id,fn);return id};globalThis.clearTimeout=id=>{deadlines.delete(id);realClear(id)};
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreShiftTransactionsModal.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'no-child-requests',setup(b){b.onResolve({filter:/\.\/(MyShiftEntriesPanel|PaymentAmountCorrectionAction)\.jsx$/},a=>({path:a.path,namespace:'child'}));b.onLoad({filter:/.*/,namespace:'child'},()=>({contents:'export default ()=>null',loader:'jsx'}))}}]});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);const root=createRoot(document.getElementById('root')),pending=[],calls=[];
 const api=(path,options)=>{calls.push({path,options});return new Promise((resolve,reject)=>pending.push({path,resolve,reject,used:false}))};
 const take=part=>{const p=pending.find(x=>!x.used&&x.path.includes(part));assert.ok(p,part);p.used=true;return p};
 const settle=fn=>act(async()=>{await fn();await new Promise(r=>realSet(r,10))});
 const render=store=>root.render(React.createElement(m.exports.default,{api,store:{id:store,name:'Store '+store},operator:{id:'operator',employeeId:'employee'},allowAll:true,onClose(){}}));
 const overview=id=>({store:{id},openSession:{id:'shift-'+id,openedAt:'2026-10-20T03:16:47Z',shiftLabel:'Active '+id},recent:[]});
 const sales=id=>({store:{id},rows:[{id:'sale-'+id,sessionId:'shift-'+id,total:2.20,createdAt:'2026-10-20T06:00:00Z',actorName:'Virtual',source:'POS',lines:[{description:'Product '+id,quantity:1,lineTotal:2.20}],payments:[{method:'CASH',amount:2.20}]}]});
 const refresh=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Ανανέωση'));
 try{
  await settle(()=>render('A'));assert.match(document.body.textContent,/Έλεγχος ενεργής βάρδιας/);assert.doesNotMatch(document.body.textContent,/Δεν υπάρχει ανοιχτή βάρδια/);
  await settle(()=>take('/A/overview').resolve(overview('A')));assert.match(document.body.textContent,/Active A/);assert.match(document.body.textContent,/06:16:47/);assert.match(document.body.textContent,/Φόρτωση συναλλαγών/);assert.doesNotMatch(document.body.textContent,/Δεν υπάρχει ανοιχτή βάρδια/);
  await settle(()=>take('/A/sales/recent').reject(Error('Sales unavailable')));assert.match(document.body.textContent,/Sales unavailable/);assert.match(document.body.textContent,/δεν φορτώθηκε πλήρως/);assert.equal(refresh().disabled,false);assert.doesNotMatch(document.body.textContent,/Δεν υπάρχουν συναλλαγές/);
  await settle(()=>refresh().click());await settle(()=>{take('/A/overview').resolve(overview('A'));take('/A/sales/recent').resolve(sales('A'))});assert.match(document.body.textContent,/Product A/);
  window.open=()=>null;await settle(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Εκτύπωση αντιγράφου')).click());assert.match(document.body.textContent,/μπλόκαρε/);assert.match(document.body.textContent,/Product A/);assert.match(document.body.textContent,/Active A/);assert.doesNotMatch(document.body.textContent,/Δεν ολοκληρώθηκε ο έλεγχος βάρδιας/);
  await settle(()=>refresh().click());const lateOverview=take('/A/overview'),lateSales=take('/A/sales/recent');await settle(()=>render('B'));await settle(()=>{take('/B/overview').resolve(overview('B'));take('/B/sales/recent').resolve(sales('B'))});await settle(()=>{lateOverview.resolve(overview('A'));lateSales.resolve(sales('A'))});assert.match(document.body.textContent,/Product B/);assert.doesNotMatch(document.body.textContent,/Product A|Active A/);
  await settle(()=>refresh().click());const stalledOverview=take('/B/overview'),stalledSales=take('/B/sales/recent');await settle(()=>{for(const fn of [...deadlines.values()])fn()});assert.match(document.body.textContent,/καθυστέρησε/);assert.equal(refresh().disabled,false);assert.doesNotMatch(document.body.textContent,/Δεν υπάρχει ανοιχτή βάρδια/);await settle(()=>{stalledOverview.resolve(overview('B'));stalledSales.resolve(sales('B'))});assert.match(document.body.textContent,/δεν φορτώθηκε πλήρως/,'late timed-out results cannot overwrite the error');
  await settle(()=>refresh().click());await settle(()=>{take('/B/overview').resolve({store:{id:'B'},openSession:null,recent:[]});take('/B/sales/recent').resolve({store:{id:'B'},rows:[]})});assert.match(document.body.textContent,/Δεν υπάρχει ανοιχτή βάρδια/);assert.ok(calls.every(c=>!c.options?.method),'no diagnostic writes');
 }finally{await act(async()=>root.unmount());for(const id of deadlines.keys())realClear(id);dom.window.close();for(const [k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
