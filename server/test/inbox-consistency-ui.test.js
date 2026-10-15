import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
async function mount(file,props){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});
 const keys=['window','document','navigator','HTMLElement','Event','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/'+file,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const root=createRoot(document.getElementById('root')),wait=()=>new Promise(r=>setTimeout(r,330));
 await act(async()=>{root.render(React.createElement(m.exports.default,props));await wait()});await act(wait);
 return {dom,act,wait,click:async el=>act(async()=>{assert.ok(el);el.click();await wait()}),type:async(el,value)=>act(async()=>{const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait()}),close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of before){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}};
}
test('mounted inbox defaults to pending, labels registered truthfully, opens existing order and hides stale review/delete actions',async()=>{
 const calls=[],rows=[{id:'done',processingStatus:'REGISTERED',linkedOrderId:'existing',status:'IN_REVIEW',filename:'DONE.pdf',note:'old ΠΡΟΣ ΕΛΕΓΧΟ',hasAttachment:true},{id:'draft',processingStatus:'DRAFT',linkedOrderId:'draft-order',status:'IN_REVIEW',filename:'DRAFT.pdf',hasAttachment:true}];
 const api=async path=>{calls.push(path);if(path.includes('/mydata/status'))return {enabled:false};const q=new URL(path,'https://isolated.invalid').searchParams;const items=q.get('processing')==='REGISTERED'?[rows[0]]:q.get('processing')==='ALL'?rows:[rows[1]];return {items,total:items.length,archiveTotal:items.length,suppliers:[]}};
 const f=await mount('InvoiceInboxPanel.jsx',{api,stores:[{id:'s',name:'LAB'}]});try{
  assert.ok(calls.filter(p=>p.includes('/archive')).every(p=>p.includes('processing=PENDING')));
  assert.equal(document.body.textContent.includes('DONE.pdf'),false);
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
  await f.click(button('Τιμολογημένα / καταχωρισμένα'));
  const article=[...document.querySelectorAll('article')].find(a=>a.textContent.includes('DONE.pdf'));assert.ok(article);
  assert.match(article.textContent,/Τιμολογημένο \/ καταχωρισμένο/);assert.doesNotMatch(article.textContent,/old ΠΡΟΣ ΕΛΕΓΧΟ/);
  assert.equal([...article.querySelectorAll('button')].some(b=>/Διαγραφή|Επανεπεξεργασία|Έλεγχος από βοηθό/.test(b.textContent)),false);
  let opened;document.addEventListener('purchase-orders:open',e=>opened=e.detail,{once:true});
  await f.click(button('Άνοιγμα καταχωρισμένου τιμολογίου'));assert.deepEqual(opened,{orderId:'existing',storeId:'s'});
  assert.equal(calls.some(p=>/reprocess|original|reconcile|sync/.test(p)),false);
 }finally{await f.close()}
});
test('mounted wrong-header merge needs original/header/table confirmation and submits exactly once without adding rows',async()=>{
 const preview={mark:'MARK',issuerVat:'099999999',documentNumber:'1ΤΔΑ846666',issueDate:'2026-10-14',totalGross:14.69,version:'b'.repeat(64),originalAvailable:true,files:[],lines:[],orders:[{orderId:'pos',invoiceNumber:'146066',documentDate:'2026-07-14',totalGross:12.34,lineCount:13,exact:false,headerReviewRequired:true,lineEvidence:{matchedRows:10,lineCount:13,leftTotal:14.69,rightTotal:14.69}},{orderId:'mydata',isMyData:true,lineCount:13}]};
 const calls=[];let finish;const api=async(path,options={})=>{calls.push({path,options});return options.method==='POST'?new Promise(r=>finish=r):preview};
 const f=await mount('InvoiceCommonDraftReview.jsx',{api,storeId:'s',item:{id:'inbox'},onClose(){},onComplete(){}});try{
  assert.match(document.body.textContent,/10 από 13/);const submit=()=>document.querySelector('footer .primary');
  await f.click(document.querySelector('.invoice-common-confirm input:not([aria-label])'));
  await f.type(document.querySelector('textarea'),'Compared both original invoices and reviewed the header');
  await f.click(document.querySelector('input[type="radio"][value="pos"]'));
  assert.equal(submit().disabled,true);
  await f.click(document.querySelector('[aria-label="Επιβεβαίωση διόρθωσης βασικών στοιχείων"]'));
  assert.equal(submit().disabled,false);await f.click(submit());await f.click(submit());
  const posts=calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);
  const body=JSON.parse(posts[0].options.body);assert.equal(body.confirmHeaderCorrection,true);assert.equal(body.selectedRowsOrderId,'pos');assert.equal(body.posOrderId,'pos');assert.equal(body.confirmSameInvoice,true);assert.equal(body.lines,undefined);
  await f.act(async()=>{finish({ok:true,orderId:'pos'});await f.wait()});
 }finally{await f.close()}
});
test('mounted registered review is read-only and opens the linked purchase instead of offering a second merge',async()=>{
 const calls=[],opened=[];const api=async(path,options={})=>{calls.push({path,options});return {registered:true,registeredOrderId:'done',documentNumber:'145327',totalGross:48.82,orders:[],files:[]}};
 const f=await mount('InvoiceCommonDraftReview.jsx',{api,storeId:'s',item:{id:'i'},onClose(){},onComplete:r=>opened.push(r)});try{
  assert.match(document.body.textContent,/έχει ήδη τιμολογηθεί/);assert.equal(document.querySelector('footer .primary'),null);assert.equal(document.querySelector('textarea'),null);
  await f.click([...document.querySelectorAll('button')].find(b=>b.textContent==='Άνοιγμα υπάρχουσας αγοράς'));
  assert.equal(opened[0].orderId,'done');assert.equal(calls.some(c=>c.options.method==='POST'),false);
 }finally{await f.close()}
});
