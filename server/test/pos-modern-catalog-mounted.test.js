import test from 'node:test';
import assert from 'node:assert/strict';
import {withMountedPos} from './helpers/pos-modern-fixture.mjs';

test('actual modern POS keeps all20 quicks, inline nested catalog, original cart/scanner and store reset',async()=>{
 await withMountedPos({nested:true,run:async({dom,act,click,calls,render})=>{
  assert.ok(document.querySelector('.pos-modern .pos-modern-catalog'));assert.ok(document.querySelector('.pos-modern-cart .standard-lines'));assert.ok(document.querySelector('.standard-sale-panel .standard-search [data-pos-scanner]'));
  const quicks=[...document.querySelectorAll('.standard-quick>div>button')];assert.equal(quicks.length,20);assert.equal(quicks.filter(b=>!b.disabled).length,20);
  await click(quicks.at(-1));assert.equal(document.querySelectorAll('.standard-line').length,1);assert.match(document.querySelector('.standard-line').textContent,/ΠΡΟΪΟΝ 20/);
  const categories=[...document.querySelectorAll('.standard-category-strip>div>button')];assert.equal(categories.length,20);
  await click(categories[0]);assert.equal(categories[0].getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('.standard-quick').hidden,true);assert.equal(document.querySelector('.pos-category-products-modal'),null);
  await click(document.querySelector('.pos-modern-subcategory'));assert.match(document.querySelector('.pos-modern-catalog-title').textContent,/ΥΠΟΚΑΤΗΓΟΡΙΑ/);
  const product=document.querySelector('.pos-modern-product');assert.ok(product);assert.equal(product.tagName,'BUTTON');assert.equal(product.type,'button');await click(product);
  assert.equal(document.querySelectorAll('.standard-line').length,2);assert.equal(document.querySelectorAll('.pos-modern-product').length,1,'add retains selected category');
  await click(document.querySelector('[aria-label="Πίσω στην προηγούμενη κατηγορία"]'));assert.ok(document.querySelector('.pos-modern-subcategory'));
  await click(document.querySelector('.pos-modern-quick-tab'));assert.equal(document.querySelector('.standard-quick').hidden,false);
  const scanner=document.querySelector('[data-pos-scanner]');await act(async()=>{scanner.focus();Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(scanner,'5200000000001');scanner.dispatchEvent(new dom.window.Event('input',{bubbles:true}));scanner.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}))});
  assert.equal(document.querySelectorAll('.standard-line').length,3);assert.equal(scanner.value,'');
  await click(document.querySelector('.standard-category-strip>div>button'));await act(async()=>render('B'));assert.equal(document.querySelector('.pos-modern-quick-tab').getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('.standard-quick').hidden,false);
  assert.equal(calls.some(c=>/checkout/.test(c.path)),false);assert.ok(calls.filter(c=>c.path.endsWith('/audit')).length>=3);
 }});
});
