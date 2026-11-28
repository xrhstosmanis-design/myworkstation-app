import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {installSalesProductActions} from '../../client/src/components/commerce/salesProductActions.js';

test('Sales right-click goes through the actual launcher handler into the actual full Warehouse card and shared Warehouse purchase history',async()=>{
 const dom=new JSDOM('<div id="workspace"><section id="sales"><div data-product-id="p" tabindex="0">Product</div></section><div id="mount"></div></div>',{url:'https://isolated.invalid/'}),w=dom.window;
 const keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:w[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InventoryArchivePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const launcher=await readFile(new URL('../../client/src/components/commerce/CommerceLauncher.jsx',import.meta.url),'utf8');
 const handler=launcher.slice(launcher.indexOf('const openCard=event=>{'),launcher.indexOf('workspace.addEventListener("mws:price-catalog-full-card"'));
 let initialProduct,selectedStore,mode,context={storeId:'A',valid:true,token:'test',tab:'items'};const lock={current:false};
 const openCard=new Function('stores','wholesaleLockRef','setInventoryInitialProduct','setInventoryStoreId','setMode',handler+';return openCard')([{id:'A'}],lock,value=>{initialProduct=value},value=>{selectedStore=value},value=>{mode=value});
 document.getElementById('workspace').addEventListener('mws:price-catalog-full-card',openCard);
 const sales=document.getElementById('sales');installSalesProductActions(sales,()=>context,async path=>api(path));
 const calls=[],product={id:'p',name:'Full product',sku:'SKU',unit:'PIECE',vatRate:24,stores:[{storeId:'OTHER',salePrice:999},{storeId:'A',salePrice:2.1,currentStock:41}],barcodes:[{barcode:'5201261031023',unitMultiplier:1}]};
 const archive={items:[{productId:'p',name:product.name,lastPurchasePrice:1,currentStock:41}],categories:[],subcategories:[],taxonomy:{categories:[],subcategories:[]},page:1,pages:1,total:1,totals:{}};
 const api=async(path,options)=>{calls.push({path,options});if(path.startsWith('/api/owner-products/p/purchases?'))return {purchases:[{id:'purchase',supplierName:'Native supplier',invoiceNumber:'NATIVE-INVOICE',quantity:2,initialUnitCost:1.4,unitCost:1,discount1:10,discount2:5,discount3:2,netAmount:2,grossAmount:2.48,vatRate:24}]};if(options?.method&&options.method!=='GET')throw Error('Unexpected write');if(path.startsWith('/api/owner-products/catalog?'))return [product];if(path.startsWith('/api/owner-products/p/details?'))return {purchases:[{id:'purchase',supplierName:'Native supplier',documentNumber:'NATIVE-INVOICE',quantity:2,unitCost:1,netAmount:2,grossAmount:2.48,vatRate:24}],suppliers:[],supplierCodes:[],statistics:{}};if(path.startsWith('/api/inventory-archive?'))return archive;throw Error(path)};
 const root=createRoot(document.getElementById('mount'));
 const choose=kind=>{sales.firstElementChild.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));document.querySelector(`[data-kind="${kind}"]`).click()};
 const render=()=>act(async()=>root.render(React.createElement(module.exports.default,{api,storeId:selectedStore,stores:[{id:'A',name:'Selected store'}],initialProduct,onClose(){}})));
 try{
  choose('purchases');await act(async()=>{await new Promise(r=>setTimeout(r,100))});
  assert.match(document.querySelector('.mws-inv-modal').textContent,/NATIVE-INVOICE/);assert.match(document.querySelector('.mws-inv-modal').textContent,/Native supplier/);assert.match(document.querySelector('.mws-inv-modal').textContent,/Αρχική αγορά/);assert.ok(document.querySelector('.mws-inv-modal [data-export]'));
  const purchaseCall=calls.find(x=>x.path.includes('/purchases?'));assert.equal(new URL(purchaseCall.path,'https://test.invalid').searchParams.get('storeId'),'A');
  document.querySelector('.mws-inv-modal [data-close]').click();
  choose('card');assert.equal(mode,'inventory');assert.equal(selectedStore,'A');assert.equal(initialProduct.productId,'p');await render();
  for(const tab of ['Βασικά στοιχεία','Barcodes','Κωδικοί προμηθευτών','Στατιστικά','Αγορές','Συσκευασία'])assert.ok(document.querySelector('.ia-card-tabs').textContent.includes(tab),tab);
  assert.ok(calls.some(x=>x.path==='/api/owner-products/p/details?storeId=A'));assert.equal(document.querySelector('.sas-product-dialog'),null);
  assert.equal(document.querySelector('.ia-card-tabs .active').textContent,'Βασικά στοιχεία');assert.equal([...document.querySelectorAll('.ia-form-grid.edit label')].find(x=>x.firstChild?.textContent==='Περιγραφή').querySelector('input').value,'Full product');assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Καταχώρηση'&&!b.disabled));
  const before=initialProduct;context={...context,storeId:'DENIED'};choose('card');assert.equal(initialProduct,before);assert.match(document.querySelector('.sas-product-dialog').textContent,/δεν είναι διαθέσιμη/);
  assert.equal(calls.some(x=>x.options?.method&&x.options.method!=='GET'),false);
 }finally{await act(async()=>root.unmount());w.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
