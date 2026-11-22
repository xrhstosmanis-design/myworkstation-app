import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
async function fixture({strict=false,initial={}}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const code=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InternetProductSearchPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react/jsx-runtime']});
 const m={exports:{}};new Function('require','module','exports',code.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 let responder=null;const calls=[],pending=[],api=async(path,options)=>{calls.push({path,options});if(responder){const value=responder(path,options);if(value!==undefined)return value}if(options?.method==='POST')return {ok:true};if(path.includes('/market-search?')){const d=deferred();pending.push(d);return d.promise}return {rows:[]}};
 const root=createRoot(document.getElementById('root'));let props={api,stores:[{id:'A',name:'Store A'},{id:'B',name:'Store B'}],onClose(){},...initial};
 const render=async update=>{props={...props,...update};await act(async()=>root.render(strict?React.createElement(React.StrictMode,null,React.createElement(m.exports.default,props)):React.createElement(m.exports.default,props)))};
 const change=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))});
 const selectStore=value=>change(document.querySelector('select'),value),search=async value=>{await change(document.querySelector('input[placeholder^="π.χ."]'),value);await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))};
 const resolve=async(d,value)=>act(async()=>d.resolve(value));
 await render();
 return {dom,act,calls,pending,render,selectStore,search,resolve,change,setResponder(fn){responder=fn},async cleanup(){await act(async()=>root.unmount());dom.window.close();for(const [key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}};
}
const response=label=>({id:label,configured:true,own:{id:'p-'+label,name:label,costPrice:1,salePrice:2,marginPercent:50},rows:[],recommendation:label,warning:'synthetic'});

test('actual mounted history and proposal reads follow selected store and reject absent membership',async()=>{
 const h=await fixture();try{
  for(const suffix of ['/history','/price-proposals'])assert.ok(h.calls.some(c=>new URL(c.path,'https://test.invalid').pathname.endsWith(suffix)&&new URL(c.path,'https://test.invalid').searchParams.get('storeId')==='A'));
  await h.selectStore('B');for(const suffix of ['/history','/price-proposals'])assert.ok(h.calls.some(c=>new URL(c.path,'https://test.invalid').pathname.endsWith(suffix)&&new URL(c.path,'https://test.invalid').searchParams.get('storeId')==='B'));
  const before=h.calls.length;await h.render({stores:[]});assert.equal(h.calls.length,before);assert.equal(document.querySelector('button.internet-search-submit').disabled,true);
 }finally{await h.cleanup()}
});

test('actual mounted A-to-B-to-A search lifetime discards old success, error and close replies without business writes',async()=>{
 const h=await fixture();try{
  await h.search('old A');const old=h.pending.at(-1);await h.selectStore('B');await h.selectStore('A');await h.resolve(old,response('STALE_A'));
  assert.doesNotMatch(document.body.textContent,/STALE_A/);
  await h.search('current A');await h.resolve(h.pending.at(-1),response('CURRENT_A'));assert.match(document.body.textContent,/CURRENT_A/);
  await h.selectStore('B');assert.doesNotMatch(document.body.textContent,/CURRENT_A/);assert.equal(document.querySelector('input[placeholder^="π.χ."]').value,'');
  await h.search('close pending');const closing=h.pending.at(-1);await h.act(async()=>document.querySelector('button[aria-label="Κλείσιμο"]').click());await h.resolve(closing,response('CLOSED_RESULT'));assert.doesNotMatch(document.body.textContent,/CLOSED_RESULT/);
  assert.equal(h.calls.filter(c=>c.options?.method==='POST').length,0);
 }finally{await h.cleanup()}
});

test('StrictMode and API authority replacement retain current reads but discard previous errors',async()=>{
 const h=await fixture({strict:true});try{
  await h.search('old API');const old=h.pending.at(-1);
  const replacementCalls=[],replacementApi=async(path)=>{replacementCalls.push(path);return path.includes('/market-search?')?response('NEW_API_RESULT'):{rows:[]}};
  await h.render({api:replacementApi});await h.act(async()=>old.reject(Error('OLD_API_ERROR')));assert.doesNotMatch(document.body.textContent,/OLD_API_ERROR/);
  await h.search('new API');assert.match(document.body.textContent,/NEW_API_RESULT/);assert.ok(replacementCalls.some(p=>p.includes('/history?storeId=A')));
 }finally{await h.cleanup()}
});

test('late proposal completion cannot reload or clear the newly selected store, and writer payload stays captured',async()=>{
 const h=await fixture();try{
  await h.search('own A');await h.resolve(h.pending.at(-1),response('A_RESULT'));
  const write=deferred();h.setResponder((_path,options)=>options?.method==='POST'?write.promise:undefined);
  const submit=[...document.querySelectorAll('button')].find(b=>b.textContent==='Υποβολή πρότασης');await h.act(async()=>submit.click());
  const post=h.calls.find(c=>c.options?.method==='POST'),payload=JSON.parse(post.options.body);assert.equal(payload.storeId,'A');assert.equal(payload.productId,'p-A_RESULT');assert.equal(payload.searchId,'A_RESULT');
  await h.selectStore('B');await h.search('B pending');const readsBefore=h.calls.filter(c=>new URL(c.path,'https://test.invalid').pathname.endsWith('/price-proposals')).length;
  await h.resolve(write,{ok:true});assert.equal(h.calls.filter(c=>new URL(c.path,'https://test.invalid').pathname.endsWith('/price-proposals')).length,readsBefore);assert.equal(document.querySelector('button.internet-search-submit').disabled,true,'stale finally must not clear current busy');
  await h.resolve(h.pending.at(-1),response('B_RESULT'));assert.match(document.body.textContent,/B_RESULT/);assert.doesNotMatch(document.body.textContent,/A_RESULT/);assert.equal(h.calls.filter(c=>c.options?.method==='POST').length,1);
 }finally{await h.cleanup()}
});

test('dropdown and inventory typing share latest catalog generation and ignore prior query or scope replies',async()=>{
 const h=await fixture();try{
  const requests=[];h.setResponder((path,options)=>{if(!options&&path.includes('/products?')){const d=deferred();requests.push({path,...d});return d.promise}});
  const input=document.querySelector('input[placeholder="Γράψε όνομα, SKU ή barcode"]');await h.change(input,'old');await h.act(async()=>new Promise(r=>setTimeout(r,230)));assert.equal(requests.length,1);
  await h.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Αποθήκη προϊόντων')).click());await h.act(async()=>new Promise(r=>setTimeout(r,5)));
  const picker=document.querySelector('input[placeholder="Αναζήτηση στην αποθήκη..."]');await h.change(picker,'new');await h.act(async()=>new Promise(r=>setTimeout(r,5)));const latest=requests.at(-1);
  await h.resolve(latest,{rows:[{id:'new',name:'NEW_CATALOG',barcodes:['123'],costPrice:1,salePrice:2}]});assert.match(document.body.textContent,/NEW_CATALOG/);
  await h.resolve(requests[0],{rows:[{id:'old',name:'OLD_CATALOG'}]});assert.doesNotMatch(document.body.textContent,/OLD_CATALOG/);
  await h.selectStore('B');assert.doesNotMatch(document.body.textContent,/NEW_CATALOG/);assert.equal(document.querySelector('input[placeholder="Αναζήτηση στην αποθήκη..."]'),null);
 }finally{await h.cleanup()}
});

test('retained prior-render proposal callback cannot retarget a new store result',async()=>{
 const h=await fixture();try{
  await h.search('A');await h.resolve(h.pending.at(-1),response('A_RESULT'));
  const oldButton=[...document.querySelectorAll('button')].find(b=>b.textContent==='Υποβολή πρότασης'),propsKey=Object.keys(oldButton).find(k=>k.startsWith('__reactProps$'));assert.ok(propsKey);const retained=oldButton[propsKey].onClick;
  await h.selectStore('B');await h.search('B');await h.resolve(h.pending.at(-1),response('B_RESULT'));
  await h.act(async()=>retained());assert.equal(h.calls.filter(c=>c.options?.method==='POST').length,0,'old render callback must not capture new authority');
  await h.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Υποβολή πρότασης').click());
  const post=h.calls.find(c=>c.options?.method==='POST');assert.equal(JSON.parse(post.options.body).storeId,'B');assert.equal(JSON.parse(post.options.body).productId,'p-B_RESULT');
 }finally{await h.cleanup()}
});

test('platform company change never issues a transient old-store request and rejects previous company result',async()=>{
 const h=await fixture({initial:{companies:[{id:'one',name:'Company One',stores:[{id:'A',name:'Store A'}]},{id:'two',name:'Company Two',stores:[{id:'B',name:'Store B'}]}]}});try{
  await h.search('one');const old=h.pending.at(-1);await h.change(document.querySelectorAll('select')[0],'two');await h.resolve(old,response('OLD_COMPANY'));
  assert.doesNotMatch(document.body.textContent,/OLD_COMPANY/);assert.equal(document.querySelectorAll('select')[1].value,'B');
  for(const call of h.calls){const u=new URL(call.path,'https://test.invalid');if(u.searchParams.get('companyId')==='two')assert.equal(u.searchParams.get('storeId'),'B')}
  const before=h.calls.length;await h.render({companies:[{id:'one',name:'Company One',stores:[]},{id:'two',name:'Company Two',stores:[]}]});assert.equal(h.calls.length,before);assert.equal(document.querySelector('button.internet-search-submit').disabled,true);
 }finally{await h.cleanup()}
});

test('retained older search callbacks cannot propose, add local order items or acknowledge reused result IDs',async()=>{
 const h=await fixture();try{
  const rich=label=>({...response(label),rows:[{id:'internet:0',productName:label,sourceDomain:'fixture.invalid',matchLevel:'PROBABLE',comparablePrice:0.5,price:0.5,matchReason:'Synthetic'}]});
  const callback=text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);return button[Object.keys(button).find(k=>k.startsWith('__reactProps$'))].onClick};
  await h.search('first');await h.resolve(h.pending.at(-1),rich('FIRST'));
  const oldSubmit=callback('Υποβολή πρότασης'),oldConfirm=callback('Επιβεβαίωση');await h.act(async()=>oldConfirm());const oldAdd=callback('Προσθήκη στην πρόταση παραγγελίας');
  await h.search('second');await h.resolve(h.pending.at(-1),rich('SECOND'));
  await h.act(async()=>{oldSubmit();oldConfirm()});assert.equal(h.calls.filter(c=>c.options?.method==='POST').length,0);assert.doesNotMatch(document.body.textContent,/✓ Επιβεβαιώθηκε από χρήστη/);
  await h.selectStore('B');await h.search('third');await h.resolve(h.pending.at(-1),rich('THIRD'));await h.act(async()=>{oldAdd();oldConfirm()});
  assert.equal(document.querySelectorAll('aside article.internet-proposal').length,0);assert.doesNotMatch(document.body.textContent,/✓ Επιβεβαιώθηκε από χρήστη/);assert.equal(h.calls.filter(c=>c.options?.method==='POST').length,0);
 }finally{await h.cleanup()}
});

test('invalid retained result callback cannot consume the current write generation or leave busy stuck',async()=>{
 const h=await fixture();try{
  const submit=()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Υποβολή πρότασης');return b[Object.keys(b).find(k=>k.startsWith('__reactProps$'))].onClick};
  await h.search('old');await h.resolve(h.pending.at(-1),response('OLD'));const old=submit();
  await h.search('new');await h.resolve(h.pending.at(-1),response('NEW'));const write=deferred();h.setResponder((_path,options)=>options?.method==='POST'?write.promise:undefined);
  await h.act(async()=>{submit()()});assert.equal(document.querySelector('button.internet-search-submit').disabled,true);await h.act(async()=>old());assert.equal(h.calls.filter(c=>c.options?.method==='POST').length,1);
  await h.resolve(write,{ok:true});assert.equal(document.querySelector('button.internet-search-submit').disabled,false,'valid current completion still owns its busy generation');
 }finally{await h.cleanup()}
});
