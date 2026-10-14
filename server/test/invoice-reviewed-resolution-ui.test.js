import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
test('actual mounted two-table resolution requires supplier/payment/row choices, displays each table and submits one explicit reviewed POST',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InvoiceCommonDraftReview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const preview={version:'a'.repeat(64),mark:'MARK',issuerVat:'099999999',totalGross:77.66,originalAvailable:true,files:[],orders:[{orderId:'pos',invoiceNumber:'505/17113',lineCount:1,supplierReviewRequired:true,paymentTransactionId:'payment',paymentTaxId:null,paymentAmount:77.66},{orderId:'mydata',isMyData:true,lineCount:1}],verifiedSuppliers:[{id:'sup',taxId:'099999999',name:'Verified supplier'}],lines:[{id:'a',orderId:'pos',description:'POS original row',quantity:2,netAmount:68.71,vatAmount:8.90,grossAmount:77.61},{id:'b',orderId:'mydata',description:'myDATA reviewed row',quantity:2,netAmount:68.73,vatAmount:8.90,grossAmount:77.63}]};
 const calls=[],done=[],root=createRoot(document.getElementById('root'));let finish;
 const api=async(path,options)=>{calls.push({path,options});if(options?.method==='POST')return new Promise(r=>finish=r);return preview};
 const click=el=>act(async()=>el.click()),change=(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
 try{
  await act(async()=>root.render(React.createElement(m.exports.default,{api,storeId:'s',item:{id:'i'},onClose:()=>{},onComplete:r=>done.push(r)})));
  const submit=()=>document.querySelector('footer .primary');assert.equal(submit().disabled,true);assert.match(document.body.textContent,/POS original row/);assert.match(document.body.textContent,/myDATA reviewed row/);
  await click(document.querySelector('.invoice-common-confirm input'));await change(document.querySelector('textarea'),'Both originals independently compared');assert.equal(submit().disabled,true);
  await change(document.querySelector('[aria-label="Σωστός προμηθευτής"]'),'sup');await click(document.querySelector('[aria-label="Επιβεβαίωση διόρθωσης προμηθευτή"]'));assert.equal(submit().disabled,true);
  await click(document.querySelector('[aria-label="Επιβεβαίωση προμηθευτή πληρωμής"]'));assert.equal(submit().disabled,true);
  await click(document.querySelector('input[type=radio][value=mydata]'));assert.equal(submit().disabled,false);await click(submit());await click(submit());
  const posts=calls.filter(c=>c.options?.method==='POST');assert.equal(posts.length,1);assert.deepEqual(JSON.parse(posts[0].options.body),{storeId:'s',posOrderId:'pos',expectedVersion:'a'.repeat(64),confirmSameInvoice:true,confirmMark:'MARK',confirmPaymentDiscrepancy:false,reason:'Both originals independently compared',verifiedSupplierId:'sup',confirmSupplierCorrection:true,confirmPaymentSupplierCorrection:true,selectedRowsOrderId:'mydata'});
  await act(async()=>finish({orderId:'mydata'}));assert.equal(done.length,1);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of before){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
