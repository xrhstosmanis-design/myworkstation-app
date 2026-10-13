import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

test('actual reconciliation dialog requires both-original and payment-discrepancy confirmations, keeps typing, submits once and ignores old-store completion',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InvoiceCommonDraftReview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[],completed=[],preview={inboxId:'i',mark:'400015624303633',issuerVat:'099999999',documentNumber:'21-ΤΔΑ6836',issueDate:'2026-10-12',totalGross:153.17,version:'a'.repeat(64),originalAvailable:true,orders:[{orderId:'pos',invoiceNumber:'21-1AA006836',documentDate:'2023-10-12',totalGross:155.17,paymentAmount:155.17,lineCount:0,exact:false},{orderId:'mydata',isMyData:true,lineCount:0}],files:[{id:'photo',mimeType:'image/jpeg',filename:'POS.jpg'}]};
 let finish;
 const api=async(path,options={})=>{calls.push({path,options});if(options.method==='POST')return new Promise(r=>finish=r);return preview};
 const props={api,storeId:'s',item:{id:'i'},onClose:()=>{},onComplete:r=>completed.push(r)},wait=()=>new Promise(r=>setTimeout(r,15));
 const render=async extras=>act(async()=>{root.render(React.createElement(module.exports.default,{...props,...extras,key:extras?.storeId||'s'}));await wait()});
 const click=async el=>act(async()=>{assert.ok(el);el.click();await wait()});
 const type=async(text)=>act(async()=>{const field=document.querySelector('textarea'),setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set;setter.call(field,text);field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait()});
 try{
  await render();await act(wait);assert.equal(calls.length,1);assert.match(document.querySelector('[role="dialog"]').textContent,/155,17 €/);assert.match(document.querySelector('.invoice-common-payment').textContent,/2,00 €/);
  const submit=()=>document.querySelector('footer .primary');assert.equal(submit().disabled,true);
  await click(document.querySelector('.invoice-common-confirm input'));await type('Confirmed same original invoice and MARK');assert.equal(submit().disabled,true);
  await render({api:(...args)=>api(...args)});assert.equal(calls.length,1);assert.equal(document.querySelector('textarea').value,'Confirmed same original invoice and MARK');
  await click(document.querySelector('.invoice-common-payment input'));assert.equal(submit().disabled,false);await click(submit());await click(submit());
  const posts=calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);assert.deepEqual(JSON.parse(posts[0].options.body),{storeId:'s',posOrderId:'pos',expectedVersion:'a'.repeat(64),confirmSameInvoice:true,confirmMark:'400015624303633',confirmPaymentDiscrepancy:true,reason:'Confirmed same original invoice and MARK'});
  await render({storeId:'other'});await act(async()=>{finish({orderId:'pos',stockUpdated:false,paymentChanged:false});await wait()});assert.equal(completed.length,0);assert.ok(calls.some(c=>c.path.endsWith('storeId=other')));
  assert.equal(calls.some(c=>/sales|approve|finalize|payments|sync/.test(c.path)),false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
