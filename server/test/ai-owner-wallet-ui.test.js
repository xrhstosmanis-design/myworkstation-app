import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('mounted wallet clears previous-store balances and late results, explains company scope and shows renewal instructions without payment actions',async()=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/voice/AiOwnerWallet.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root')),calls=[];let late;
  const summary=id=>({asOf:'2026-10-21T21:30:00Z',localDate:'2026-10-22',monthStartDate:'2026-10-01',timeZone:'Europe/Athens',allTimeMicros:id==='a'?'25000000':'9000000',monthMicros:id==='a'?'12000000':'5000000',todayMicros:id==='a'?'3000000':'90000',categories:id==='a'?[{category:'INVOICES',allTimeMicros:'20000000',monthMicros:'10000000',todayMicros:'2000000'},{category:'QUESTIONS',allTimeMicros:'5000000',monthMicros:'2000000',todayMicros:'1000000'}]:[{category:'INVOICES',allTimeMicros:'9000000',monthMicros:'5000000',todayMicros:'90000'}],daily:[{date:'2026-10-22',category:'INVOICES',chargedMicros:id==='a'?'2000000':'90000'}]});
  const data=id=>({runtimeEnabled:true,enabled:true,companyId:'company',storeId:id,availableMicros:id==='a'?'1110000':'2220000',reservedMicros:'0',state:'LOW',usage:[],usageSummary:summary(id),entries:[{id:'invoice-'+id,createdAt:'2026-10-21T21:10:00Z',settledAt:'2026-10-21T21:15:00Z',kind:'USAGE',status:'SETTLED',feature:'INVOICE_AZURE',chargedMicros:'2000000'}],notices:[],paymentInstructions:'Πληρωμή στο MyWorkStation · συνθετικές οδηγίες'});
  const api=async(path,options)=>{calls.push({path,...options});return path.includes('/slow')?new Promise(resolve=>late=resolve):path.endsWith('/off')?{...data('b'),storeId:'off',enabled:false,entries:[{id:'trial',kind:'CREDIT',feature:'TRIAL_GRANT',creditedMicros:'5000000',createdAt:'2026-10-22T00:00:00Z'}]}:data(path.endsWith('/a')?'a':'b')};
  const render=(storeId,enabled=true)=>act(async()=>root.render(React.createElement(module.exports.default,{api,storeId,enabled})));
  try{
    await render('',true);assert.equal(calls.length,0);await render('a',false);assert.equal(calls.length,0);
    await render('a');assert.match(document.body.textContent,/1,11/);assert.match(document.body.textContent,/Κοινό υπόλοιπο/);
    const costs=document.querySelector('[aria-label="Κόστος χρήσης AI επιλεγμένου καταστήματος"]');assert.match(costs.textContent,/25,00/);assert.match(costs.textContent,/12,00/);assert.match(costs.textContent,/01\/10\/2026/);assert.match(costs.textContent,/22\/10\/2026/);assert.match(costs.textContent,/00:30/);assert.match(costs.textContent,/Τιμολόγια/);assert.match(costs.textContent,/Ερωτήσεις στον βοηθό/);assert.equal(costs.querySelectorAll('tbody tr').length,2);
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Πληρωμές και κατανάλωση').click());assert.match(document.body.textContent,/Ημερήσια ανάλυση τρέχοντος μήνα/);assert.match(document.querySelector('.ai-wallet-activity-list>li').textContent,/Τιμολόγιο[\s\S]*2,00/);assert.match(document.body.textContent,/Τελευταίες έως 100 κινήσεις/);
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Ανανέωση υπολοίπου AI').click());assert.match(document.body.textContent,/συνθετικές οδηγίες/);assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);
    await render('slow');assert.doesNotMatch(document.body.textContent,/1,11|25,00|συνθετικές οδηγίες/);const old=calls.at(-1);await render('b');assert.equal(old.signal.aborted,true);await act(async()=>late(data('a')));assert.match(document.body.textContent,/2,22/);assert.match(document.body.textContent,/9,00/);assert.doesNotMatch(document.body.textContent,/1,11|25,00|Ερωτήσεις στον βοηθό/);
    await render('off');assert.match(document.body.textContent,/χρέωση AI είναι ανενεργή/);assert.match(document.body.textContent,/κόστος του MyWorkStation/);assert.match(document.body.textContent,/2,22/);
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Πληρωμές και κατανάλωση').click());assert.match(document.body.textContent,/Δοκιμαστική πίστωση από MyWorkStation.*5,00/);
    await render('b',false);assert.equal(document.body.textContent,'');
  }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of prior)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
});
