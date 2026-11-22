import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logLevel:'silent'});
export async function withMountedPos({keypad=true,notices=false,nested=false,textSize=null,ftextConfigured=false,apiOverride=null,run}={}){
 const dom=new JSDOM('<div class="compact-store-mode"><main class="compact-store-main" id="root"></main></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','sessionStorage','Event','fetch','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='fetch'?async()=>({ok:true,json:async()=>({})}):dom.window[k]});
 if(textSize)localStorage.setItem('myworkstation:pos-text-size:A',textSize);
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.querySelector('#root')),calls=[];
 const products=Array.from({length:20},(_,i)=>({id:'p'+i,sku:'SKU'+i,name:'ΕΛΛΗΝΙΚΟ ΠΡΟΪΟΝ '+(i+1)+' ΜΕΓΑΛΟ',categoryName:'ΟΜΑΔΑ '+(i+1),salePrice:2.2,currentStock:100,barcodes:[String(5200000000000+i)]}));
 const quickKeys=products.map((p,i)=>({id:'q'+i,label:p.name,productQuery:p.sku,productCodes:[p.id],visible:true,price:p.salePrice,color:'#087a52'}));
 const categories=products.map((p,i)=>({id:'c'+i,label:'ΚΑΤΗΓΟΡΙΑ '+(i+1),productCodes:[p.id],visible:true,color:'#087a52',...(nested&&i===0?{children:[{id:'child',label:'ΥΠΟΚΑΤΗΓΟΡΙΑ',productCodes:['p0']}]}:{})}));
 const api=async(path,options={})=>{calls.push({path,options});if(apiOverride){const result=await apiOverride(path,options);if(result!==undefined)return result}if(path.endsWith('/ftext-cash/capability'))return {storeId:path.split('/')[4],configured:ftextConfigured};if(/^\/api\/store-pos\/stores\/[^/]+$/.test(path))return {products,access:{closeWithoutPrint:true},layoutVersion:1,layout:{title:'POS',quickKeys,categories,showSku:true}};if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('disabled in isolated fixture');if(path.endsWith('/payment-terminals'))return {choices:[{deviceCode:'A',displayName:'SYNTHETIC',operationChannel:'COUNTER',transactionMode:'IMMEDIATE'}]};return {rows:[],items:[],requests:[],offers:[],stations:[],state:{}}};
 const render=storeId=>root.render(React.createElement(module.exports.default,{api,store:{id:storeId,name:'ΕΡΓΑΣΤΗΡΙΟ'},company:{id:'LAB'},operator:{id:'op',employeeId:'employee',fullName:'ΣΥΝΘΕΤΙΚΟΣ ΧΕΙΡΙΣΤΗΣ'},runtimeAccess:{confirmDeleteSale:false,deleteSaleReason:false}}));
 const click=async element=>{assert.ok(element);await act(async()=>element.click())};
 try{
  await act(async()=>render('A'));if(!keypad)await click(document.querySelector('.pos-keypad-toggle'));
  if(run)return await run({dom,act,click,calls,products,render});
  for(let i=0;i<15;i++)await click(document.querySelectorAll('.standard-quick>div>button')[i]);
  assert.equal(document.querySelectorAll('.standard-line').length,15);
  if(notices){const article=document.querySelector('article');article.querySelector('.store-pos-top').insertAdjacentHTML('afterend','<div class="store-pos-alert error" role="alert">Δεν ολοκληρώθηκε η ενέργεια. Ελέγξτε τα στοιχεία.</div><div class="store-pos-alert success store-pos-toast" role="status"><span>Η ενέργεια ολοκληρώθηκε.</span><button aria-label="Κλείσιμο μηνύματος">×</button></div>')}
  assert.equal(calls.some(c=>/checkout/.test(c.path)),false);return document.body.innerHTML;
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
}
