import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

// Mount the actual dialog; no copy of the component's eligibility logic.
test('mounted third-credit series review requires server capability, originals and the original table even with an empty extra',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InvoiceCommonDraftReview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[],completed=[];
 const fixture=extraRows=>({
  appliedCreditReviewSupported:true,additionalDraftReviewSupported:true,additionalCreditSeriesReviewSupported:true,
  documentType:'CREDIT_NOTE',mark:'synthetic-mark',documentNumber:'CN 40',issuerVat:'099999999',issueDate:'2026-10-12',totalGross:7,
  version:'a'.repeat(64),originalAvailable:true,commonDraft:{completed:true,orderId:'canonical',documentId:'credit',paymentTransactionId:'negative',aliasOrderIds:['old']},
  orders:[
   {orderId:'canonical',documentId:'credit',isMyData:true,invoiceNumber:'CN 0040',status:'NEW',documentStatus:'DRAFT',lineCount:1,totalGross:7,paymentTransactionId:'negative',paymentAmount:-7,creditPaymentVerified:true,exact:true},
   {orderId:'third',documentId:'extra',isMyData:false,invoiceNumber:'OCR 00040',status:'NEW',documentStatus:'DRAFT',lineCount:extraRows,totalGross:7,paymentTransactionId:null,paymentAmount:null,headerReviewRequired:true,additionalCreditSeriesReviewEligible:true}
  ],files:[],lines:[{id:'row',orderId:'canonical',description:'Original credit row',quantity:1,netAmount:6,vatAmount:1,grossAmount:7}]
 });
 let preview=fixture(0),failPost=false;
 const wait=()=>new Promise(r=>setTimeout(r,15));
 const api=async(path,options={})=>{calls.push({path,options});if(options.method==='POST'){if(failPost)throw Error('Τα πρόχειρα άλλαξαν. Άνοιξε νέα προεπισκόπηση.');return {orderId:'canonical',paymentChanged:false,stockUpdated:false}}return structuredClone(preview)};
 const render=async key=>{await act(async()=>{root.render(React.createElement(module.exports.default,{key,api,storeId:'s',item:{id:'i'},onClose:()=>{},onComplete:r=>completed.push(r)}));await wait()});await act(wait)};
 const click=async el=>act(async()=>{assert.ok(el);el.click();await wait()});
 const type=async text=>act(async()=>{const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(field,text);field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait()});
 const confirm=async()=>{
  await click(document.querySelector('input[aria-label="Επιβεβαίωση διόρθωσης βασικών στοιχείων"]'));
  await click(document.querySelector('.invoice-common-confirm input:not([aria-label])'));
  await type('Compared both originals: only the unpaid third series was wrong');
 };
 const posts=()=>calls.filter(c=>c.options.method==='POST');
 try{
  for(const extraRows of [0,1]){
   preview=fixture(extraRows);const count=posts().length;await render('eligible-'+extraRows);
   assert.match(document.querySelector('[role="dialog"]').textContent,/μόνο η σειρά/);assert.equal(document.querySelector('.invoice-common-payment'),null);
   assert.match(document.querySelector('[role="dialog"]').textContent,/-7,00 €/);
   const radio=document.querySelector('input[type="radio"][value="canonical"]');assert.ok(radio);assert.equal(radio.disabled,false);
   if(extraRows)assert.equal(document.querySelector('input[type="radio"][value="third"]').disabled,true);
   await confirm();assert.equal(document.querySelector('footer .primary').disabled,true,'table confirmation is not implicit');
   await click(radio);assert.equal(document.querySelector('footer .primary').disabled,false);
   await click(document.querySelector('footer .primary'));assert.equal(posts().length,count+1);
   const body=JSON.parse(posts().at(-1).options.body);
   assert.equal(body.posOrderId,'third');assert.equal(body.selectedRowsOrderId,'canonical');assert.equal(body.expectedVersion,preview.version);
   assert.equal(body.confirmHeaderCorrection,true);assert.equal(body.confirmSameInvoice,true);assert.equal(body.confirmMark,'synthetic-mark');
   assert.equal(body.confirmPaymentDiscrepancy,false);assert.equal(body.additionalCreditSeriesReviewEligible,undefined,'client does not authorize itself');
   assert.equal(completed.at(-1).orderId,'canonical');
  }
  const denied={
   'unsupported':p=>delete p.additionalCreditSeriesReviewSupported,
   'string support':p=>p.additionalCreditSeriesReviewSupported='true',
   'missing eligibility':p=>delete p.orders[1].additionalCreditSeriesReviewEligible,
   'string eligibility':p=>p.orders[1].additionalCreditSeriesReviewEligible='true',
   'unverified credit':p=>p.orders[0].creditPaymentVerified=false,
   'paid extra':p=>p.orders[1].paymentTransactionId='negative',
   'supplier correction':p=>p.orders[1].supplierReviewRequired=true,
   'posted extra':p=>p.orders[1].documentStatus='APPROVED',
   'empty original table':p=>p.orders[0].lineCount=0,
   'missing original':p=>p.originalAvailable=false
  };
  for(const[name,mutate]of Object.entries(denied)){
   preview=fixture(1);mutate(preview);const count=posts().length;await render(name);await confirm();
   const radio=document.querySelector('input[type="radio"][value="canonical"]');if(radio&&!radio.disabled)await click(radio);
   assert.equal(document.querySelector('footer .primary').disabled,true,name);await click(document.querySelector('footer .primary'));assert.equal(posts().length,count,name);
  }
  preview=fixture(0);failPost=true;await render('stale');await confirm();await click(document.querySelector('input[type="radio"][value="canonical"]'));
  const done=completed.length,count=posts().length;await click(document.querySelector('footer .primary'));
  assert.equal(posts().length,count+1);assert.equal(completed.length,done);assert.match(document.querySelector('[role="alert"]').textContent,/νέα προεπισκόπηση/);
  assert.ok(calls.every(c=>c.path.includes('/reconcile-pos')),'no financial, credit-application, approval or stock endpoint');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
