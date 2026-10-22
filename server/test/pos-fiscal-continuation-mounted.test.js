import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('actual POS reload continues saved issued CASH with original identifiers and omits null payments',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='fetch'?async()=>({ok:true}):dom.window[k]});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root')),calls=[];
 const r={id:'00000000-0000-4000-8000-000000000001',clientTransactionId:'00000000-0000-4000-8000-000000000002',paymentMethod:'CASH',status:'DISPATCHED',total:2.7,checkout:{paymentMethod:'CASH',payments:null,items:[{productId:'water',quantity:1}]}},product={id:'water',name:'Water',sku:'WATER',salePrice:2.7,currentStock:10,barcodes:[]};let completed=false;
 const api=async(path,options={})=>{
  calls.push({path,options});if(path.endsWith('/ftext-cash/capability'))return {storeId:path.split('/')[4],configured:false};if(path.endsWith('/checkout')){completed=true;return {saleId:'sale',total:2.7,payments:[{method:'CASH',amount:2.7}]}};
  if(path.endsWith('/rbs-capdriver-v1/pending'))return {requests:completed?[]:[r]};if(path.endsWith('/rbs-capdriver-v1/'+r.id))return {request:completed?{...r,status:'SALE_COMMITTED',saleId:'sale'}:r};
  if(path==='/api/store-pos/stores/A')return {products:[product],layout:{quickKeys:[],categories:[]},access:{}};if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('not enabled');return {rows:[],items:[],requests:[],offers:[],stations:[],state:{}};
 };
 try{
  await act(async()=>root.render(React.createElement(m.exports.default,{api,store:{id:'A',name:'Fixture'}})));
  const posts=calls.filter(x=>x.path.endsWith('/checkout'));assert.equal(posts.length,1);const body=JSON.parse(posts[0].options.body);assert.equal(body.clientTransactionId,r.clientTransactionId);assert.equal(body.fiscalRequestId,r.id);assert.equal(Object.hasOwn(body,'payments'),false);assert.equal(document.querySelector('.standard-line'),null);assert.equal(document.querySelector('[data-pos-scanner]').disabled,false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
