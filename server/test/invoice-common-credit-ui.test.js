import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
test('mounted applied credit uses signed zero difference, preserves original row choice and refuses unverified proof',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InvoiceCommonDraftReview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[],completed=[];
 const preview={appliedCreditReviewSupported:true,documentType:'CREDIT_NOTE',mark:'synthetic-mark',documentNumber:'CN 40',issuerVat:'099999999',issueDate:'2026-10-12',totalGross:7,version:'a'.repeat(64),originalAvailable:true,orders:[{orderId:'pos',invoiceNumber:'CN 0040',lineCount:1,totalGross:7,exact:true},{orderId:'mydata',isMyData:true,invoiceNumber:'CN 40',lineCount:1,totalGross:7,paymentTransactionId:'negative',paymentAmount:-7,creditPaymentVerified:true,exact:true}],lines:[],files:[]};
 const wait=()=>new Promise(r=>setTimeout(r,15)),api=async(path,options={})=>{calls.push({path,options});return options.method==='POST'?{orderId:'mydata'}:structuredClone(preview)};
 const render=async key=>act(async()=>{root.render(React.createElement(module.exports.default,{key,api,storeId:'s',item:{id:'i'},onClose:()=>{},onComplete:r=>completed.push(r)}));await wait()});
 const click=async el=>act(async()=>{assert.ok(el);el.click();await wait()});
 const type=async()=>act(async()=>{const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(field,'Original credit and both files compared');field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait()});
 try{
  await render('verified');await act(wait);assert.match(document.querySelector('[role="dialog"]').textContent,/-7,00 €/);assert.equal(document.querySelector('.invoice-common-payment'),null);
  const choices=[...document.querySelectorAll('input[type="radio"]')];assert.equal(choices.find(x=>x.value==='pos').disabled,true);assert.equal(choices.find(x=>x.value==='mydata').disabled,false);
  await click(choices.find(x=>x.value==='mydata'));await click(document.querySelector('.invoice-common-confirm input'));await type();assert.equal(document.querySelector('footer .primary').disabled,false);await click(document.querySelector('footer .primary'));
  const posts=calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);const body=JSON.parse(posts[0].options.body);assert.equal(body.selectedRowsOrderId,'mydata');assert.equal(body.confirmPaymentDiscrepancy,false);assert.equal(body.posOrderId,'pos');assert.equal(completed[0].orderId,'mydata');
  preview.orders[1].creditPaymentVerified=false;await render('unverified');await act(wait);await click(document.querySelector('input[value="mydata"]'));await click(document.querySelector('.invoice-common-confirm input'));await type();assert.equal(document.querySelector('footer .primary').disabled,true);assert.match(document.querySelector('[role="alert"]').textContent,/χωριστό έλεγχο/);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
  assert.ok(calls.every(c=>!/^.*\/(payments|sales|approve|finalize)/.test(c.path)));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
