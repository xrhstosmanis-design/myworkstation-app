import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

test('mounted third-draft review keeps canonical row choice, confirms originals and sends one explicit additional-member request',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
 const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InvoiceCommonDraftReview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const root=createRoot(document.getElementById('root')),calls=[],completed=[];
 const canonical={orderId:'canonical',isMyData:true,status:'NEW',documentStatus:'DRAFT',lineCount:1,totalGross:10,invoiceNumber:'SYN 742'},extra={orderId:'third',isMyData:false,status:'NEW',documentStatus:'DRAFT',lineCount:1,totalGross:10,invoiceNumber:'SYN 000742',exact:true};
 const base={additionalDraftReviewSupported:true,inboxId:'i',mark:'synthetic-mark',issuerVat:'099999999',documentNumber:'SYN 742',issueDate:'2026-11-01',totalGross:10,version:'a'.repeat(64),originalAvailable:true,commonDraft:{completed:true,orderId:'canonical',documentId:'canonical-doc',aliasOrderIds:['old-alias']},orders:[canonical,extra],files:[],lines:[{id:'row-c',orderId:'canonical',description:'Canonical physical row',quantity:1,netAmount:10,vatAmount:0,grossAmount:10},{id:'row-third',orderId:'third',description:'Historical duplicate physical row',quantity:1,netAmount:10,vatAmount:0,grossAmount:10}]};
 let preview=base,finish;const api=async(path,options={})=>{calls.push({path,options});return options.method==='POST'?new Promise(r=>finish=r):preview};
 const props={api,storeId:'s',item:{id:'i'},onClose:()=>{},onComplete:r=>completed.push(r)},wait=()=>new Promise(r=>setTimeout(r,15));
 const render=key=>act(async()=>{root.render(React.createElement(mod.exports.default,{...props,key}));await wait()});
 const click=el=>act(async()=>{assert.ok(el);el.click();await wait()});
 const reason=()=>act(async()=>{const el=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(el,'Verified all originals and keep the canonical row table');el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait()});
 try{
  await render('first');await act(wait);
  assert.match(document.querySelector('[role="dialog"]').textContent,/Προσθήκη επιπλέον εγγραφής/);
  const options=[...document.querySelectorAll('select option')].map(x=>x.value);assert.ok(options.includes('third'));assert.ok(!options.includes('canonical'));
  const originalRadio=document.querySelector('input[type="radio"][value="canonical"]'),extraRadio=document.querySelector('input[type="radio"][value="third"]');assert.equal(originalRadio.disabled,false);assert.equal(extraRadio.disabled,true);
  const submit=()=>document.querySelector('footer .primary');assert.equal(submit().disabled,true);
  await click(document.querySelector('.invoice-common-confirm input'));await reason();assert.equal(submit().disabled,true,'canonical row choice is explicit');
  await click(originalRadio);assert.equal(submit().disabled,false);await click(submit());await click(submit());
  const posts=calls.filter(x=>x.options.method==='POST');assert.equal(posts.length,1);
  const body=JSON.parse(posts[0].options.body);assert.equal(body.posOrderId,'third');assert.equal(body.selectedRowsOrderId,'canonical');assert.equal(body.confirmSameInvoice,true);assert.equal(body.confirmMark,'synthetic-mark');assert.equal(body.expectedVersion,base.version);assert.equal(body.storeId,'s');assert.equal(Object.hasOwn(body,'canonicalOrderId'),false,'caller never gets authority to choose a new canonical');
  await act(async()=>{finish({orderId:'canonical',stockUpdated:false,paymentChanged:false});await wait()});assert.equal(completed[0].orderId,'canonical');
  preview={...base,orders:[{...canonical,lineCount:0},extra]};await render('empty');await act(wait);assert.match(document.querySelector('[role="alert"]').textContent,/δεν έχει γραμμές/);await click(document.querySelector('.invoice-common-confirm input'));await reason();assert.equal(submit().disabled,true);
  preview={...base,registered:true,registeredOrderId:'canonical'};await render('posted');await act(wait);assert.equal(submit(),null);assert.equal(document.querySelector('textarea'),null);assert.ok([...document.querySelectorAll('footer button')].some(b=>b.textContent.includes('Άνοιγμα υπάρχουσας')));
  preview={...base,orders:[{...canonical,status:'FINAL'},extra]};await render('final');await act(wait);assert.match(document.querySelector('[role="alert"]').textContent,/κατάσταση νέου/);assert.equal(submit().disabled,true);
  preview={...base,additionalDraftReviewSupported:undefined};await render('old-server');await act(wait);assert.equal(submit(),null);assert.equal(document.querySelector('textarea'),null);
  preview={...base,orders:[canonical]};await render('complete');await act(wait);assert.equal(submit(),null);assert.equal(document.querySelector('textarea'),null);assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
