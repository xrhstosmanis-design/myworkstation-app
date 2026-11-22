import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../../client/src/invoice-advanced-online-search-bootstrap.js',import.meta.url),'utf8');
function mount(bound){
 const dom=new JSDOM(`<section ${bound?'data-invoice-search-order-id="owned-order"':''}><div class="po-product-search"><input data-product-q value="1234567890123"><button data-product-search>Local search</button></div></section>`,{url:'https://synthetic.invalid',runScripts:'outside-only'}),requests=[],alerts=[];
 dom.window.fetch=async url=>{requests.push(String(url));return {ok:true,json:async()=>String(url).includes('/options')?{searchStoreId:bound?'actual-store':null,stores:[{id:'first-unrelated-store',name:'First store'},{id:'actual-store',name:'Invoice store'}]}:{rows:[],advanced:{reason:'NOT_FOUND'}}};};
 dom.window.alert=value=>alerts.push(value);dom.window.eval(source+'\nwindow.testOpenAdvanced=openAdvanced;');
 return {dom,requests,alerts,host:dom.window.document.querySelector('.po-product-search')};
}
test('mounted invoice search uses persisted order/store binding without offering another store or selecting the first',async()=>{
 const f=mount(true);try{
  assert.ok(f.host.querySelector('[data-invoice-advanced-search]'));
  await f.dom.window.testOpenAdvanced(f.host);
  assert.equal(f.requests.length,2);const options=new URL(f.requests[0],'https://synthetic.invalid'),search=new URL(f.requests[1],'https://synthetic.invalid');
  assert.equal(options.searchParams.get('orderId'),'owned-order');assert.equal(search.searchParams.get('orderId'),'owned-order');assert.equal(search.searchParams.get('storeId'),'actual-store');
  assert.equal(f.dom.window.document.querySelector('[aria-label="Κατάστημα αναζήτησης"]'),null);assert.doesNotMatch(f.requests[1],/first-unrelated-store/);
 }finally{f.dom.window.close();}
});
test('mounted unbound company search waits for explicit store selection before making a search request',async()=>{
 const f=mount(false);try{
  const result=f.dom.window.testOpenAdvanced(f.host);await new Promise(resolve=>setImmediate(resolve));
  const select=f.dom.window.document.querySelector('[aria-label="Κατάστημα αναζήτησης"]');assert.ok(select);assert.equal(select.value,'');assert.equal(f.requests.length,1);
  const button=f.dom.window.document.querySelector('[data-continue]');assert.equal(button.disabled,true);select.value='actual-store';select.dispatchEvent(new f.dom.window.Event('change'));assert.equal(button.disabled,false);button.click();await result;
  assert.equal(f.requests.length,2);assert.equal(new URL(f.requests[1],'https://synthetic.invalid').searchParams.get('storeId'),'actual-store');
 }finally{f.dom.window.close();}
});
test('cancelling store attribution performs no paid search or invoice mutation',async()=>{
 const f=mount(false);try{
  const result=f.dom.window.testOpenAdvanced(f.host);await new Promise(resolve=>setImmediate(resolve));
  f.dom.window.document.querySelector('[data-cancel]').click();await result;assert.equal(f.requests.length,1);assert.match(f.requests[0],/\/options/);
 }finally{f.dom.window.close();}
});
