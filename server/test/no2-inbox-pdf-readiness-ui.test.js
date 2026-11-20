import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

test('explicit PDF acquisition gates reading by exact saved readiness and fences every scope',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});
 const keys=['window','document','navigator','HTMLElement','Event','CustomEvent','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
 const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InvoiceInboxPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const root=createRoot(document.getElementById('root')),calls=[],events=[];let resolveOriginal;
 const item={id:'pdf-inbox',mark:'700001',filename:'TEST-73001.pdf',mimeType:'application/pdf',linkedOrderId:'saved-order',status:'IN_REVIEW',processingStatus:'PENDING',hasAttachment:true};
 const makeApi=()=>async(path,options={})=>{calls.push({path,options});if(path.includes('/reconcile-pos?'))return {orders:[],files:[]};if(path.endsWith('/original'))return new Promise(r=>resolveOriginal=r);if(path.includes('/archive?'))return {items:[item],total:1,archiveTotal:1,suppliers:[]};return {enabled:false,serverAutomatic:true}};
 let api=makeApi(),readOnly=false;
 const render=()=>root.render(React.createElement(mod.exports.default,{api,readOnly,stores:[{id:'s',name:'S'},{id:'other',name:'Other'}],onOpenOrder:d=>events.push(d)}));
 const wait=fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,290))});
 const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
 const dto=(extra={})=>({version:'MYDATA_PDF_READINESS_V1',storeId:'s',inboxId:item.id,orderId:'saved-order',state:'NEEDS_READING',needsPdfReading:true,orderLineCount:0,documentLineCount:0,...extra});
 const answer=async(result,explicit=false)=>{await wait(()=>button(explicit?'Έλεγχος από βοηθό AI':'Άνοιγμα υπάρχοντος προχείρου').click());await wait(()=>resolveOriginal({purchaseOrderId:'saved-order',...result}));};
 try{
  await wait(render);await wait();assert.equal(events.length,0,'GET/polling cannot open AI');
  await wait(()=>{const b=button('Άνοιγμα υπάρχοντος προχείρου');b.click();b.click()});assert.equal(calls.filter(c=>c.path.endsWith('/original')).length,1,'singleflight ref precedes rerender');
  await wait(()=>resolveOriginal({purchaseOrderId:'saved-order',pdfReadiness:dto()}));assert.equal(events.at(-1).openAssistant,true);assert.equal(events.at(-1).assistantSource.inboxId,item.id);
  await answer({pdfReadiness:dto({state:'HAS_LINES',needsPdfReading:false,orderLineCount:2})});assert.equal(events.at(-1).openAssistant,false);
  await answer({pdfReadiness:dto({state:'HAS_LINES',needsPdfReading:false,documentLineCount:2})},true);assert.equal(events.at(-1).openAssistant,true);
  await answer({readOnly:true,pdfReadiness:dto()});assert.equal(events.at(-1).readOnly,true);assert.equal(events.at(-1).openAssistant,false);
  for(const malformed of [null,dto({storeId:'foreign'}),dto({orderId:'wrong'}),dto({orderLineCount:null}),dto({version:'future'}),dto({state:'UNAVAILABLE'}),dto({needsPdfReading:'true'}),dto({documentLineCount:-1})]){await answer({pdfReadiness:malformed},true);assert.equal(events.at(-1).openAssistant,false)}
  await answer({pdfReadiness:dto({state:'READ_ONLY',needsPdfReading:false,orderLineCount:null,documentLineCount:null})},true);assert.equal(events.at(-1).readOnly,true);assert.equal(events.at(-1).openAssistant,false);
  await answer({},true);assert.equal(events.at(-1).openAssistant,true,'legacy explicit action preserved');
  await answer({});assert.equal(events.at(-1).openAssistant,false,'legacy ordinary open does not infer reading');
  const originalCount=calls.filter(c=>c.path.endsWith('/original')).length;
  item.mimeType='image/jpeg';await wait(()=>button('Ανανέωση').click());await wait(()=>button('Άνοιγμα υπάρχοντος προχείρου').click());assert.equal(calls.filter(c=>c.path.endsWith('/original')).length,originalCount,'image keeps original navigation');
  item.mimeType='application/pdf';item.processingStatus='REGISTERED';await wait(()=>button('Ανανέωση').click());await wait(()=>button('Άνοιγμα καταχωρισμένου τιμολογίου').click());assert.equal(events.at(-1).readOnly,true);assert.equal(calls.filter(c=>c.path.endsWith('/original')).length,originalCount,'registered never re-acquires');
  item.processingStatus='PENDING';await wait(()=>button('Ανανέωση').click());
  const before=events.length;await answer({reconciliationRequired:true,pdfReadiness:dto()});assert.equal(events.length,before,'reconciliation never navigates');
  // API replacement, store A→B→A, permission change and unmount invalidate pending acquisition.
  for(const change of ['api','store','readOnly']){
   await wait(()=>button('Άνοιγμα υπάρχοντος προχείρου').click());const finish=resolveOriginal;
   if(change==='api'){api=makeApi();await wait(render)}
   if(change==='store'){const select=document.querySelector('.invoice-inbox-head select');for(const id of ['other','s'])await wait(()=>{select.value=id;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
   if(change==='readOnly'){readOnly=true;await wait(render);readOnly=false;await wait(render)}
   await wait(()=>finish({purchaseOrderId:'stale',pdfReadiness:dto()}));assert.equal(events.length,before);
   await wait();
  }
  await wait(()=>button('Άνοιγμα υπάρχοντος προχείρου').click());const finish=resolveOriginal;await act(async()=>root.unmount());finish({purchaseOrderId:'stale',pdfReadiness:dto()});await new Promise(r=>setTimeout(r,20));assert.equal(events.length,before);
  assert.ok(calls.filter(c=>c.options.method).every(c=>c.options.method==='POST'&&c.path.endsWith('/original')),'no AI/provider or apply writer from inbox bridge');
 }finally{if(document.getElementById('root').childNodes.length)await act(async()=>root.unmount());dom.window.close();for(const[k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});

// CI executes a real Chromium child; local targeted runs intentionally exclude it.
test('real Chromium PDF readiness preserves explicit same-record desktop/mobile reading',{timeout:120000},async t=>{
 const {existsSync}=await import('node:fs');
 const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(existsSync);
 if(!chrome&&process.env.CI!=='true'){t.skip('Chromium unavailable locally');return}
 assert.ok(chrome,'Chromium mandatory in CI');
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');
 const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../e2e/no2-inbox-pdf-readiness-browser-flow.mjs',import.meta.url))],{env:{...process.env,CHROME_BIN:chrome},timeout:110000,maxBuffer:1024*1024});
 assert.match(stdout,/Chromium PDF readiness passed/);
});
