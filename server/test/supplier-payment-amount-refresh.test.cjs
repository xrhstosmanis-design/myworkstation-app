const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const path=require('node:path');
const repo=path.resolve(__dirname,'../..');
const dep=createRequire(path.join(repo,'server/package.json'));
const {build}=dep('esbuild'),{JSDOM}=dep('jsdom');
async function load(){
 const source=path.join(repo,'client/src/components/store/StoreSupplierOpenInvoicePayment.jsx');
 const out=await build({entryPoints:[source],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-review',setup(b){
 b.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'review'}));b.onLoad({filter:/^icons$/,namespace:'review'},()=>({contents:'export const Camera=()=>null,FileText=()=>null,Upload=()=>null,Wallet=()=>null;'}));
 b.onResolve({filter:/useMobileDocumentPhotos\.js$/},()=>({path:'mobile',namespace:'review'}));b.onLoad({filter:/^mobile$/,namespace:'review'},()=>({contents:'export default function(){return {pending:false}}'}));
 b.onResolve({filter:/DocumentPhotoList\.jsx$|MobileDocumentPhotosQr\.jsx$|DocumentCameraFocus\.jsx$/},()=>({path:'empty',namespace:'review'}));b.onLoad({filter:/^empty$/,namespace:'review'},()=>({contents:'export default ()=>null;'}));
 }}]});const m={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(dep,m,m.exports);return m.exports.default;
}
async function run(){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
 const keys=['window','document','navigator','HTMLElement','File','FileReader','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],saved=keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 // React DOM is loaded only after the DOM exists, matching native input event handling.
 const React=dep('react'),{createRoot}=dep('react-dom/client'),root=createRoot(document.getElementById('root'));
 const Component=await load(),calls=[],messages=[],pending=[];
 const data=(id)=>({items:[{id,documentNumber:id,outstandingAmount:657.54,storeName:'LAB'}]});
 const api=(url)=>{calls.push(url);return Promise.resolve(data(url.includes('supplierId=b')?'B':'A'))};
 let props={api,store:{id:'one'},suppliers:[{id:'a',name:'A'},{id:'b',name:'B'}],setMessage:x=>messages.push(x)};
 const render=()=>React.act(async()=>root.render(React.createElement(Component,props)));
 const change=(el,value)=>React.act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 try{
 await render();await change(document.querySelector('select'),'a');
 let input=document.querySelector('[aria-label="Ποσό για A"]');assert.ok(input);input.focus();await change(input,'123,');input.setSelectionRange(4,4);
 props={...props,api:url=>api(url),setMessage:x=>messages.push(x)};await render();
 assert.equal(calls.length,1,'parent callback recreation must not fetch invoices again');
 assert.equal(document.querySelector('[aria-label="Ποσό για A"]'),input,'same input must remain mounted');assert.equal(input.value,'123,');assert.equal(document.activeElement,input);assert.equal(input.selectionStart,4);
 await change(input,'123,45');props={...props,setMessage:()=>{}};await render();assert.equal(input.value,'123,45');assert.match(document.body.textContent,/123,45/);
 await change(document.querySelector('select'),'b');assert.equal(calls.length,2);assert.equal(document.querySelector('[aria-label="Ποσό για B"]').value,'');assert.equal(document.querySelector('[aria-label="Ποσό για A"]'),null);
 // Simulate two delayed requests and make old supplier/store replies arrive last.
 props={...props,api:url=>{calls.push(url);return new Promise((resolve,reject)=>pending.push({url,resolve,reject}))}};await render();
 await change(document.querySelector('select'),'a');assert.equal(pending.length,1);
 props={...props,store:{id:'two'}};await render();assert.equal(pending.length,2);
 await React.act(async()=>pending[1].resolve(data('NEW')));input=document.querySelector('[aria-label="Ποσό για NEW"]');assert.ok(input);await change(input,'22,50');
 await React.act(async()=>pending[0].resolve(data('OLD')));assert.equal(document.querySelector('[aria-label="Ποσό για NEW"]'),input);assert.equal(input.value,'22,50');assert.equal(document.querySelector('[aria-label="Ποσό για OLD"]'),null);
 // Error must go to the current notification callback, without starting another request.
 await change(document.querySelector('select'),'b');const latest=[];props={...props,setMessage:x=>latest.push(x)};await render();assert.equal(pending.length,3);
 await React.act(async()=>pending[2].reject(Error('expected review failure')));assert.equal(latest.length,1);assert.match(latest[0],/expected review failure/);
 assert.ok(calls.every(url=>url.includes('supplier-open-invoices?')),'no payment POST or business state action');
 return 'PASS: parent callback refresh, raw comma decimal, DOM/focus/caret, supplier reset, store reset, late-response rejection, latest error callback, GET-only';
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const[k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
}
const test=require('node:test');
test('supplier allocation survives callback refresh with focus and decimals, resets by scope and rejects late responses',async()=>{await run()});
