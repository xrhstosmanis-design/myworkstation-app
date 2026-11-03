import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const source=await readFile(new URL('../../client/src/purchase-order-review-reconciliation-bootstrap.js',import.meta.url),'utf8');
const products=()=>[
 {id:'a',description:'ΧΑΡΤΟΜΑΝΤΗΛΑ',ocrLineType:'PRODUCT',quantity:1,unitCost:2,grossAmount:2},
 {id:'b',description:'ΥΓΡΑ ΜΑΝΤΗΛΑΚΙΑ',ocrLineType:'PRODUCT',quantity:1,unitCost:3,grossAmount:3},
 {id:'c',description:'ΝΕΡΟ',ocrRawText:'ΤΗΛ ΣΥΝΟΛΟ',ocrLineType:'PRODUCT',quantity:1,unitCost:5,grossAmount:5}
];
async function render(rows,total=10){
 const original=structuredClone(rows),calls=[],timers=[];
 const dom=new JSDOM('<button data-po-open="synthetic-order">Open</button><div class="po-modal-overlay"><section class="po-modal"><label>Αρ. τιμολογίου<input value="SYN-123"></label><footer>10,00 €</footer></section></div>',{url:'https://isolated.invalid',runScripts:'outside-only'});
 const w=dom.window;w.localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));
 w.setTimeout=(callback,delay)=>{timers.push({callback,delay});return timers.length;};
 w.fetch=async(url,options={})=>{
  calls.push({url,method:options.method||'GET'});
  const value=url==='/api/commerce/purchase-orders/synthetic-order/ocr-lines'?{order:{supplierId:'synthetic-supplier'},rows:structuredClone(rows)}
   :url==='/api/commerce/suppliers/synthetic-supplier/detail'?{purchases:[{documentNumber:'SYN-123',totalGross:total}]}:null;
  assert.ok(value,'only existing reconciliation reads are permitted');
  return {ok:true,json:async()=>value};
 };
 try{
  w.eval(source);w.document.querySelector('[data-po-open]').click();
  assert.deepEqual(timers.map(t=>t.delay),[80,250,700,1400]);
  await Promise.all(timers.map(t=>t.callback()));
  assert.deepEqual(rows,original,'source descriptions, quantities and amounts remain unchanged');
  assert.equal(calls.length,8);assert.ok(calls.every(c=>c.method==='GET'));
  assert.equal(w.document.querySelector('footer').textContent,'10,00 €');
  assert.equal(w.document.querySelectorAll('.mws-invoice-reconciliation').length,1);
  return w.document.querySelector('.mws-invoice-reconciliation').textContent.replace(/\s+/g,' ');
 }finally{w.close();}
}

test('actual banner counts genuine tissue products and agrees with the three-row footer without changing source data',async()=>{
 const text=await render([...products(),
  {description:'Πληροφορία',ocrLineType:'INFO',quantity:0,unitCost:0,grossAmount:0},
  {description:'Μηδενική ποσότητα',ocrLineType:'PRODUCT',quantity:0,unitCost:9,grossAmount:9},
  {description:'',ocrLineType:'PRODUCT',quantity:1,unitCost:9,grossAmount:9}
 ]);
 assert.match(text,/Σύνολο 3 γραμμών: 10,00/);
 assert.match(text,/Διαφορά: 0,00/);assert.match(text,/ΣΥΜΦΩΝΕΙ ΤΟ ΠΟΣΟ/);
});

test('actual banner respects PRODUCT classification and raw-text fallback instead of lexical header fragments',async()=>{
 const text=await render([
  {description:'',ocrRawText:'ΧΑΡΤΟΜΑΝΤΗΛΑ DATE BAR',ocrLineType:'PRODUCT',quantity:1,unitCost:10,grossAmount:10},
  {description:'Πληροφορία',ocrLineType:'INFO',quantity:1,unitCost:99,grossAmount:99},
  {description:'Χωρίς ταξινόμηση',quantity:1,unitCost:99,grossAmount:99}
 ]);
 assert.match(text,/Σύνολο 1 γραμμών: 10,00/);assert.match(text,/Διαφορά: 0,00/);
});

test('actual banner retains the five-cent tolerance and flags a real six-cent discrepancy',async()=>{
 assert.match(await render(products(),10.05),/ΣΥΜΦΩΝΕΙ ΤΟ ΠΟΣΟ/);
 const mismatch=await render(products(),10.06);
 assert.match(mismatch,/Διαφορά: 0,06/);assert.match(mismatch,/ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟ/);
});
