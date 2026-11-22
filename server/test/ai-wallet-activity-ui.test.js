import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {walletActivityFromRequest} from '../src/services/ai-wallet-activity.js';

test('mounted detailed history separates caller, background, resolver, sources and reserved money with exact filtered totals',async()=>{
 const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
 const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/voice/AiWalletActivityHistory.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const activity=walletActivityFromRequest({user:{id:'operator',operatorId:'operator',tokenType:'STORE_OPERATOR',companyId:'c',storeId:'s',fullName:'Synthetic POS operator',role:'MANAGER',terminalPos:'MAIN'}},{storeId:'s',purpose:'INVOICE_ASSISTANT',documentNumber:'SYNTHETIC-E'});
 const common={kind:'USAGE',feature:'INVOICE_OPENAI',storeId:'s',storeName:'Synthetic Store',createdAt:'2026-10-31T12:00:00Z',model:'synthetic',reservedMicros:'900000'};
 const entries=[{...common,id:'assistant',status:'SETTLED',chargedMicros:'100000',activity,inputTokens:'80',outputTokens:'20',customerCharge:{baseMicros:'79000',additionalMarkupMicros:'19750',callFeeMicros:'1000',invoiceFeeMicros:'250',totalMicros:'100000'}},{...common,id:'payment',status:'REVIEW',chargedMicros:'0',activity:{...activity,purpose:'PAYMENT_INVOICE_READ',surface:'PAYMENT_ENTRY',execution:'BACKGROUND',jobId:'job-e'}},{...common,id:'legacy',status:'SETTLED',chargedMicros:'20000',manuallyResolved:true,actionUser:{id:'reviewer',name:'Synthetic reviewer'},activity:null},{id:'credit',kind:'CREDIT',feature:'TRIAL_GRANT',status:'CREDITED',creditedMicros:'5000000',createdAt:common.createdAt,actionUser:{id:'platform',name:'Synthetic administrator'}}];
 const change=async(label,value)=>act(async()=>{const select=[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith(label)).querySelector('select');Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(select,value);select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 try{
  await act(async()=>root.render(React.createElement(mod.exports.default,{entries})));
  const totals=()=>document.querySelector('[role=status]').textContent;
  assert.match(totals(),/4 κινήσεις/);assert.match(totals(),/0,12/);assert.match(totals(),/0,90/);assert.match(totals(),/5,00/);
  assert.match(document.body.textContent,/Αρχικός αιτών: Synthetic POS operator/);assert.match(document.body.textContent,/Υπεύθυνος/);assert.match(document.body.textContent,/Ταμείο MAIN/);assert.match(document.body.textContent,/SYNTHETIC-E/);assert.match(document.body.textContent,/Αυτόματη εργασία/);
  const legacy=document.querySelector('.ai-wallet-activity-list>li:nth-child(3)');assert.match(legacy.textContent,/Αρχικός αιτών: Δεν έχει καταγραφεί/);assert.match(legacy.textContent,/επίλυση εκκρεμότητας απόSynthetic reviewer/);assert.doesNotMatch(legacy.textContent,/Αρχικός αιτών: Synthetic reviewer/);
  await change('Λειτουργία AI','PAYMENT_INVOICE_READ');assert.equal(document.querySelectorAll('.ai-wallet-activity-list>li').length,1);assert.match(totals(),/Οριστικές χρεώσεις: 0,00/);assert.match(totals(),/Εκκρεμείς δεσμεύσεις: 0,90/);assert.match(document.querySelector('.ai-wallet-activity-list').textContent,/Το ποσό δεν είναι οριστική χρέωση/);
  await act(async()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Καθαρισμός φίλτρων').click());
  await change('Χρήστης / χειριστής','POS:operator');assert.equal(document.querySelectorAll('.ai-wallet-activity-list>li').length,2);assert.match(totals(),/0,10/);assert.doesNotMatch(document.querySelector('.ai-wallet-activity-list').textContent,/Synthetic reviewer|Synthetic administrator/);
  await change('Προέλευση χρήσης','BACKGROUND');assert.equal(document.querySelectorAll('.ai-wallet-activity-list>li').length,1);assert.match(document.querySelector('.ai-wallet-activity-list').textContent,/job-e/);
  await change('Κατάσταση κίνησης','SETTLED');assert.match(document.body.textContent,/Δεν υπάρχουν κινήσεις με αυτά τα φίλτρα/);assert.match(totals(),/0 κινήσεις/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of prior)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
