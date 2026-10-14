import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
test('mounted inbox shows only one day/archive list, retains archive search across toggles and scopes exports to its selected receipt period',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InvoiceInboxPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const calls=[],api=async(path,options)=>{calls.push({path,options});const u=new URL(path,'https://isolated.invalid');if(path.includes('/mydata/status'))return {enabled:false};assert.equal(u.searchParams.get('storeId'),'s');if(u.searchParams.get('format'))return {html:'<p>Report</p>',count:1};const today=u.searchParams.get('receivedToday')==='true';assert.equal(u.searchParams.get('receivedBeforeToday')==='true',!today);return {items:[{id:today?'today':'old',filename:today?'TODAY-INVOICE.jpg':'OLD-INVOICE.jpg',receivedAt:today?'2026-10-14T10:00Z':'2026-10-13T10:00Z',status:'IN_REVIEW',supplierName:'Supplier'}],total:1,archiveTotal:1,suppliers:['Supplier']};};
 const wait=()=>new Promise(r=>setTimeout(r,310)),click=el=>act(async()=>{el.click();});
 const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
 const popups=[];window.open=()=>{const popup={document:{body:{},open(){},write(html){this.html=html},close(){}},close(){}};popups.push(popup);return popup;};
 try{
  await act(async()=>root.render(React.createElement(m.exports.default,{api,stores:[{id:'s',name:'Selected store'}]})));await act(wait);
  assert.match(document.body.textContent,/TODAY-INVOICE/);assert.doesNotMatch(document.body.textContent,/OLD-INVOICE/);assert.equal(document.querySelector('.invoice-old-view'),null);assert.equal(button('Τιμολόγια ημέρας').getAttribute('aria-pressed'),'true');
  await click(button('Παλιά τιμολόγια'));assert.match(document.body.textContent,/OLD-INVOICE/);assert.doesNotMatch(document.body.textContent,/TODAY-INVOICE/);assert.equal(document.querySelector('.invoice-today'),null);
  const input=document.querySelector('input[placeholder="π.χ. 12548 ή Coca Cola"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'17113');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await click(button('Αναζήτηση'));await act(wait);
  await click(button('Τιμολόγια ημέρας'));await click(button('Παλιά τιμολόγια'));assert.equal(document.querySelector('input[placeholder="π.χ. 12548 ή Coca Cola"]').value,'17113');
  await click(button('Αναφορά PDF / Εκτύπωση'));const oldExport=new URL(calls.at(-1).path,'https://isolated.invalid');assert.equal(oldExport.searchParams.get('receivedBeforeToday'),'true');assert.equal(oldExport.searchParams.get('q'),'17113');
  await click(button('Τιμολόγια ημέρας'));await click(button('PDF ημέρας / Εκτύπωση'));const dayExport=new URL(calls.at(-1).path,'https://isolated.invalid');assert.equal(dayExport.searchParams.get('receivedToday'),'true');assert.equal(dayExport.searchParams.get('receivedBeforeToday'),'');assert.equal(dayExport.searchParams.get('q'),'');assert.equal(popups.length,2);
  assert.ok(calls.every(c=>!c.options?.method),'read-only list/status/report requests only');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of before){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
