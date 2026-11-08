import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const pdf=marker=>'data:application/pdf;base64,'+Buffer.from('%PDF-1.7\n'+marker).toString('base64');
const a=pdf('A'),b=pdf('B'),image='data:image/jpeg;base64,/9j/2Q==';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
async function component(name,parent=false){
  const entry=fileURLToPath(new URL(`../../client/src/components/store/${name}.jsx`,import.meta.url));
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'metadata-test-dependencies',setup(builder){
    builder.onResolve({filter:/invoice-pdf-count-loader\.js$/},()=>({path:'pdf-loader',namespace:'fixture'}));
    if(parent){
      builder.onResolve({filter:/^\./},args=>args.importer===entry&&!['./InvoiceFilePageSummary.jsx','./DocumentPagePreview.jsx','../../lib/invoice-fast-header-request.js','../../lib/invoice-fast-supplier-match.js'].includes(args.path)?{path:args.path,namespace:'fixture'}:undefined);
      builder.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'fixture'}));
    }
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>{
      let contents='export default function Stub(){return null}';
      if(args.path==='pdf-loader')contents='export const getDocument=options=>globalThis.__ocr4CountTask(options);';
      else if(args.path.includes('useCameraAcquisition'))contents='export default()=>({cancel(){},checkpoint(){return 0},current(){return true}})';
      else if(args.path.includes('camera-acquisition'))contents='export const captureCameraFrame=()=>{throw Error("no camera")};';
      else if(args.path.includes('useMobileDocumentPhotos'))contents='export default()=>({pending:false})';
      else if(args.path.includes('document-image-quality'))contents='export const prepareDocumentFile=async file=>({file,changed:false,quality:null})';
      else if(args.path.includes('invoice-fast-header-merge'))contents='export const mergeFastInvoiceHeaders=rows=>({supplierHeader:rows[0],documentHeader:rows[0],totalHeader:rows[0],confidence:99})';
      else if(args.path.includes('pos-uploaded-credit-cash'))contents='export const settleUploadedCredit=()=>{throw Error("no payment")};';
      else if(args.path==='icons')contents='export const Camera=()=>null,FileUp=()=>null,Wallet=()=>null';
      return{contents,loader:'js'};
    });
  }}]});
  const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);return mod.exports.default;
}
async function domTest(run){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),saved=new Map();
  const names=['window','document','navigator','HTMLElement','File','FileReader','localStorage','sessionStorage','IS_REACT_ACT_ENVIRONMENT','__ocr4CountTask'];
  for(const name of names){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]})}
  const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
  const tick=()=>React.act(()=>new Promise(r=>setTimeout(r,10)));
  try{await run({React,root,dom,tick})}finally{await React.act(()=>root.unmount());dom.window.close();for(const [name,prior]of saved){if(prior)Object.defineProperty(globalThis,name,prior);else delete globalThis[name]}}
}

test('actual React summary isolates replacement/removal/store scope, cancels stale tasks, and does not recount unchanged headers',async()=>{
  const Summary=await component('InvoiceFilePageSummary');
  await domTest(async({React,root,tick})=>{
    const tasks=[];globalThis.__ocr4CountTask=options=>{const doc=deferred(),task={source:Buffer.from(options.data).toString(),doc,destroys:0};tasks.push(task);return{promise:doc.promise,destroy(){task.destroys++}}};
    const render=async(sources,scopeKey='LAB')=>{await React.act(()=>root.render(React.createElement(Summary,{pages:sources.map(dataUrl=>({dataUrl})),scopeKey})));await tick()};
    await render([a]);assert.equal(tasks.length,1);assert.match(document.body.textContent,/καταμέτρηση/);assert.doesNotMatch(document.body.textContent,/1 φυσική σελίδα/);
    await React.act(async()=>tasks[0].doc.resolve({numPages:2}));assert.match(document.body.textContent,/1 αρχείο/);assert.match(document.body.textContent,/2 φυσικές σελίδες PDF/);
    await render([a]);assert.equal(tasks.length,1,'new parent/header objects with unchanged bytes cannot restart the parser');
    await render([b]);assert.equal(tasks.length,2);assert.doesNotMatch(document.body.textContent,/2 φυσικές σελίδες/);
    await render([b],'OTHER-LAB');assert.equal(tasks.length,3);assert.equal(tasks[1].destroys,1);
    await React.act(async()=>tasks[1].doc.resolve({numPages:99}));assert.doesNotMatch(document.body.textContent,/99/);
    await React.act(async()=>tasks[2].doc.resolve({numPages:3}));assert.match(document.body.textContent,/3 φυσικές σελίδες PDF/);
    await render([],'OTHER-LAB');assert.equal(document.querySelector('.invoice-file-page-summary'),null);
    await render([a,b]);assert.equal(tasks.length,4,'only first PDF worker starts, not all in parallel');
    await React.act(async()=>tasks[3].doc.resolve({numPages:2}));await tick();assert.equal(tasks.length,5);
    await React.act(async()=>tasks[4].doc.resolve({numPages:4}));assert.match(document.body.textContent,/Αρχείο 1: 2 φυσικές/);assert.match(document.body.textContent,/Αρχείο 2: 4 φυσικές/);
    await render([b,a]);assert.equal(tasks.length,6);assert.doesNotMatch(document.body.textContent,/Αρχείο 1: 2 φυσικές/);
    await render([image]);assert.equal(tasks[5].destroys,1);assert.match(document.body.textContent,/1 εικόνα/);assert.match(document.body.textContent,/δεν επιβεβαιώνει πλήθος φυσικών σελίδων/);
    await React.act(async()=>tasks[5].doc.resolve({numPages:77}));assert.doesNotMatch(document.body.textContent,/77/);
    await render([a]);assert.equal(tasks.length,7);await React.act(()=>root.render(null));assert.equal(tasks[6].destroys,1);await React.act(async()=>tasks[6].doc.resolve({numPages:88}));assert.equal(document.body.textContent,'');
  });
});
test('actual React summary shows parser errors and unsupported originals as unknown, not as one page',async()=>{
  const Summary=await component('InvoiceFilePageSummary');
  await domTest(async({React,root,tick})=>{
    let calls=0,destroys=0;globalThis.__ocr4CountTask=()=>{calls++;return{promise:Promise.reject(Error('encrypted')),destroy(){destroys++}}};
    await React.act(()=>root.render(React.createElement(Summary,{pages:[{dataUrl:a},{originalDataUrl:'https://private.invalid/original',dataUrl:b}],scopeKey:'LAB'})));await tick();
    assert.equal(calls,1);assert.equal(destroys,1);assert.match(document.body.textContent,/άγνωστο πλήθος σελίδων PDF/);assert.match(document.body.textContent,/μη διαθέσιμος τύπος/);assert.doesNotMatch(document.body.textContent,/1 φυσική σελίδα/);assert.match(document.body.textContent,/δεν επιβεβαιώνει πλήρη ανάγνωση OCR/);
  });
});
test('actual FAST form counts independently of its one pending header request and leaves amount/type/settlement semantics unchanged',async()=>{
  const Parent=await component('StoreSupplierInvoicePremiumFast',true);
  await domTest(async({React,root,dom,tick})=>{
    const header=deferred(),calls=[];let counts=0;
    globalThis.__ocr4CountTask=()=>{counts++;return{promise:Promise.resolve({numPages:2}),destroy(){}}};
    const api=(url,options)=>{calls.push({url,body:JSON.parse(options.body)});assert.equal(url,'/api/commerce/ai-reader/fast-header');return header.promise};
    await React.act(()=>root.render(React.createElement(Parent,{store:{id:'LAB'},api,suppliers:[{id:'synthetic',name:'SYNTHETIC'}]})));
    const file=new dom.window.File(['%PDF-1.7\nsynthetic'],'two.pdf',{type:'application/pdf'}),input=document.querySelector('input[type=file]');
    Object.defineProperty(input,'files',{configurable:true,value:[file]});await React.act(()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
    for(let i=0;i<40&&(!calls.length||!document.body.textContent.includes('2 φυσικές σελίδες PDF'));i++)await tick();
    assert.equal(calls.length,1);assert.equal(counts,1);assert.match(document.body.textContent,/2 φυσικές σελίδες PDF/);assert.match(document.body.textContent,/FAST AI ανάγνωση/);
    assert.equal(calls[0].body.storeId,'LAB');assert.equal(calls[0].body.filename,'two.pdf');assert.equal(calls[0].body.dataUrl,pdf('synthetic'));assert.equal(calls[0].body.mimeType,'application/pdf');assert.equal(calls[0].body.pdfHeaderPriority,true);
    await React.act(async()=>header.resolve({supplierId:'synthetic',supplierName:'SYNTHETIC',documentNumber:'SYN-2',documentDate:'2026-11-05',totalGross:24.8,confidence:99,productLines:[]}));await tick();
    assert.equal(calls.length,1);assert.equal(counts,1);assert.match(document.body.textContent,/1 αρχείο έτοιμο/);assert.doesNotMatch(document.body.textContent,/1 σελίδα έτοιμη/);
    assert.equal(document.querySelector('input[placeholder="0,00"]').value,'24,80');assert.equal(document.querySelector('input[type=date]').value,'2026-11-05');
    assert.equal(document.querySelector('.pos-invoice-document-type select').value,'');assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='ΠΛΗΡΩΜΕΝΟ').getAttribute('aria-pressed'),'false');
    await React.act(()=>document.querySelector('button[title="Αφαίρεση αρχείου"]').click());assert.equal(document.querySelector('.invoice-file-page-summary'),null);assert.equal(document.querySelector('input[placeholder="0,00"]').value,'');assert.equal(calls.length,1);
  });
});
const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&existsSync(p));
test('actual Chromium counts original PDFs using the client PDF.js worker at desktop and narrow widths',{skip:!chrome,timeout:90000},async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../e2e/invoice-file-page-count-flow.mjs',import.meta.url))],{env:{...process.env,CHROME_BIN:chrome},timeout:85000,maxBuffer:1024*1024});
  assert.match(stdout,/Invoice file page count actual Chromium PASS 16 cases/);
});
