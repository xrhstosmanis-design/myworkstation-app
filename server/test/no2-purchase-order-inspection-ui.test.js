import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
async function mounted(run){
 const dom=new JSDOM('<div class="commerce-hub" data-active-store-id="s"><div class="commerce-module-strip"><button data-purchase-orders-launch>Orders</button></div></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','localStorage','MutationObserver','Event','CustomEvent','fetch'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const calls=[];let handler=async()=>({readOnly:true,navigationOnly:true,order:{id:'o',storeId:'s',invoiceNumber:'A 12',supplierName:'Supplier',status:'NEW'},lines:[{description:'EXISTING <script> line',quantity:2,netAmount:10,vatAmount:2.4,grossAmount:12.4}],totals:{gross:12.4}});
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='fetch'?async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>handler(path,options)}}:dom.window[k]});
 localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)((id)=>id==='pdfjs-dist/build/pdf.mjs'?{GlobalWorkerOptions:{},getDocument:()=>{throw new Error('PDF not used in inspection')}}:id==='pdfjs-dist/build/pdf.worker.min.mjs?url'?'unused-worker':createRequire(import.meta.url)(id),module,module.exports);module.exports.installPurchaseOrdersSuite();
 const hub=document.querySelector('.commerce-hub'),open=(patch={})=>hub.dispatchEvent(new window.CustomEvent('purchase-orders:open',{bubbles:true,detail:{orderId:'o',storeId:'s',readOnly:true,navigationOnly:true,monthlyAudit:true,basis:'EXPLICIT',...patch}}));
 const flush=()=>new Promise(resolve=>setTimeout(resolve,15));
 try{await run({calls,hub,open,flush,setHandler:fn=>handler=fn})}finally{dom.window.close();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
}

test('monthly number opens actual saved order lines with one inspection GET, no report/bootstrap/reconcile or editing controls',()=>mounted(async({calls,open,flush})=>{
 open();await flush();assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/purchase-orders/o/detail?inspection=true&storeId=s');assert.equal(calls[0].options.method,undefined);const dialog=document.querySelector('[data-monthly-order-inspection]');assert.ok(dialog);assert.match(dialog.textContent,/A 12/);assert.match(dialog.textContent,/EXISTING <script> line/);assert.equal(dialog.querySelectorAll('script,input,select,textarea,button[type=submit]').length,0);assert.equal(dialog.querySelectorAll('button').length,1);assert.equal(document.querySelector('.purchase-orders-suite'),null);
}));

test('candidate inspection is explicit, rapid repeated opens keep only the latest modal, and wrong-store results are not shown',()=>mounted(async({open,flush,setHandler})=>{
 open({basis:'HEADER_CANDIDATE'});await flush();assert.match(document.querySelector('[data-monthly-order-inspection]').textContent,/Πιθανή αντιστοίχιση/);open();await flush();assert.equal(document.querySelectorAll('[data-monthly-order-inspection]').length,1);
 setHandler(async()=>({readOnly:true,navigationOnly:true,order:{id:'o',storeId:'other'},lines:[]}));open();await flush();assert.equal(document.querySelector('[data-monthly-order-inspection]'),null);assert.match(document.querySelector('.po-message').textContent,/επιλεγμένου καταστήματος/);
}));

test('store change, unmount and delayed earlier inspection cannot display another scope',()=>mounted(async({hub,open,flush,setHandler,calls})=>{
 let release;setHandler(()=>new Promise(resolve=>release=resolve));open();await flush();hub.dataset.activeStoreId='other';release({readOnly:true,navigationOnly:true,order:{id:'o',storeId:'s'},lines:[]});await flush();assert.equal(document.querySelector('[data-monthly-order-inspection]'),null);open();await flush();assert.equal(calls.length,1);
 hub.dataset.activeStoreId='s';setHandler(async()=>({readOnly:true,navigationOnly:true,order:{id:'o',storeId:'s',status:'INVOICED'},lines:[],totals:{}}));open();await flush();assert.ok(document.querySelector('[data-monthly-order-inspection]'));hub.remove();await flush();assert.equal(document.querySelector('[data-monthly-order-inspection]'),null);
}));
