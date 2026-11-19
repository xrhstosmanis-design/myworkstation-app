import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const review=fs.readFileSync(new URL('../../client/src/purchase-order-review-reconciliation-bootstrap.js',import.meta.url),'utf8');
const resolution=fs.readFileSync(new URL('../../client/src/purchase-order-ocr-resolution-bootstrap.js',import.meta.url),'utf8');
const rows=[26.04,9.87,6.20,14.06,8.68,39.88,8.38].map((grossAmount,i)=>({id:`line-${i}`,productId:`product-${i}`,description:i===2?'ΜΑΝΤΗΛΙΑ ZEWASOFT ΤΣΕΠΗΣ 15τεμ.':`Synthetic item ${i}`,quantity:i===2?2:1,unitCost:i===2?2.5:1,grossAmount,ocrLineType:'PRODUCT',resolutionStatus:'MATCHED'}));
function panelPredicate(){const prefix=resolution.slice(0,resolution.indexOf('let lastOrderId='));return vm.runInNewContext(prefix+'\nisProductRow',{window:{fetch:()=>{}},localStorage:{getItem:()=>null}});}
async function mounted(callback){
 const dom=new JSDOM('<div class="po-modal-overlay"><section class="po-modal"><label>Αρ. τιμολογίου<input value="TEST-71942"></label></section></div>',{url:'https://isolated.invalid',runScripts:'outside-only'}),requests=[];
 let current=rows;
 dom.window.localStorage.setItem('user',JSON.stringify({role:'OWNER'}));
 dom.window.fetch=async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>path.includes('/ocr-lines')?{order:{id:'order',supplierId:'supplier',storeId:'store',status:'FINAL'},rows:current}:{purchases:[{documentNumber:'TEST-71942',totalGross:113.11}]}}};
 vm.runInContext(review+'\nwindow.checks={economicProduct,inspect};',dom.getInternalVMContext());
 try{await callback({dom,checks:dom.window.checks,requests,setRows:value=>current=value});}finally{dom.window.close()}
}
test('actual FINAL invoice banner includes linked tissue and all seven amounts without any write',async()=>mounted(async({dom,checks,requests})=>{
 const before=JSON.stringify(rows);await checks.inspect('order');
 const banner=dom.window.document.querySelector('.mws-invoice-reconciliation');
 assert.match(banner.textContent,/Σύνολο 7 γραμμών: 113,11/);assert.match(banner.textContent,/Διαφορά: 0,00/);assert.match(banner.textContent,/ΣΥΜΦΩΝΕΙ ΤΟ ΠΟΣΟ/);
 assert.equal(JSON.stringify(rows),before);assert.equal(requests.length,2);assert.ok(requests.every(x=>!x.options?.method||x.options.method==='GET'));
 assert.equal(panelPredicate()(rows[2]),true,'resolution panel must also retain the linked tissue row');
}));
test('actual filters preserve unmatched metadata and explicit INFO exclusion while retaining linked product names',async()=>mounted(async({checks})=>{
 const isProduct=panelPredicate();
 for(const description of ['ΜΑΝΤΗΛΙΑ ΤΣΕΠΗΣ','DATE syrup','TOTAL snack']){
  const row={...rows[0],description};assert.equal(checks.economicProduct(row),true);assert.equal(isProduct(row),true);
 }
 for(const description of ['ΤΗΛ 2100000000','ΣΥΝΟΛΟ','ΦΠΑ 24']){
  const row={...rows[0],description,productId:null};assert.equal(checks.economicProduct(row),false);assert.equal(isProduct(row),false);
 }
 const info={...rows[0],ocrLineType:'INFO'};assert.equal(checks.economicProduct(info),false);assert.equal(isProduct(info),false);
 for(const extra of [{quantity:0},{quantity:-1},{unitCost:0,grossAmount:0}])assert.equal(checks.economicProduct({...rows[0],...extra}),false);
}));
test('real amount mismatch remains a warning with unchanged five-cent tolerance',async()=>mounted(async({dom,checks,setRows})=>{
 setRows(rows.map((r,i)=>i===2?{...r,grossAmount:5.2}:r));await checks.inspect('order');
 const text=dom.window.document.querySelector('.mws-invoice-reconciliation').textContent;
 assert.match(text,/Σύνολο 7 γραμμών: 112,11/);assert.match(text,/Διαφορά: 1,00/);assert.match(text,/Ανοχή: 0,05/);assert.match(text,/ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟ/);
}));
