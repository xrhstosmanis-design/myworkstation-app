import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted common draft warns missing VAT and disables automatic merge of the flagged candidate',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InvoiceCommonDraftReview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const requests=[],preview={version:'v',mark:'M',issuerVat:'099999999',documentNumber:'505 17113',issueDate:'2026-10-14',totalGross:77.66,originalAvailable:true,files:[],orders:[{orderId:'pos',invoiceNumber:'505/17113',documentDate:'2026-10-14',totalGross:77.66,lineCount:0,taxId:null,supplierName:'Short OCR name',supplierReviewRequired:true,exact:false,paymentAmount:77.66},{orderId:'mydata',isMyData:true,lineCount:0}]};
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api:async(path,options)=>{requests.push({path,options});return preview},storeId:'s',item:{id:'inbox'},onClose:()=>{},onComplete:()=>assert.fail('must not merge')})));
  assert.match(document.body.textContent,/Πιθανό διπλό με διαφορετικό ή κενό ΑΦΜ/);assert.match(document.body.textContent,/ΑΦΜ λείπει/);assert.match(document.body.textContent,/099999999/);assert.match(document.body.textContent,/μην πληρώσεις/);
  await act(async()=>document.querySelector('input[type=checkbox]').click());
  await act(async()=>{const textarea=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Compared both original files');textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));textarea.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  const merge=[...document.querySelectorAll('button')].find(b=>b.textContent==='Ενοποίηση σε ένα πρόχειρο');assert.equal(merge.disabled,true);await act(async()=>merge.click());assert.equal(requests.length,1);assert.equal(requests[0].options,undefined,'read-only preview, no merge request despite confirmation');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of before){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});

