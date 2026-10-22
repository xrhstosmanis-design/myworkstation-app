import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {scannerCanFocus} from '../../client/src/utils/pos-scanner.js';

const source=await readFile(new URL('../../client/src/pos-payment-minimize-bootstrap.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM(`<div id="root"><div class="mws-standard-pos"><section class="standard-sale-panel"><div class="standard-search"><input data-pos-scanner></div><div class="standard-lines">Second customer</div></section></div></div><div class="pos-standard-modal" aria-modal="true"><section><header><h2>Πληρωμές</h2><button aria-label="Κλείσιμο">×</button></header><form><button type="button">Πληρωμή προμηθευτή</button><button type="button">Λοιπά έξοδα</button><input id="amount" value="83.17"><input id="photos" type="file"><button id="submit" type="submit">Καταχώριση</button><div id="result"></div></form></section></div>`,{runScripts:'outside-only',url:'https://isolated.invalid'});
 const w=dom.window,observers=[],Observer=w.MutationObserver;let interval,writes=0,submits=0,restores=0;
 w.MutationObserver=class extends Observer{constructor(fn){super(fn);observers.push(this)}};
 w.setInterval=fn=>{interval=fn;return 0};w.requestAnimationFrame=fn=>fn();
 w.fetch=()=>{writes++;throw Error('Network is forbidden in isolated UI test')};
 w.document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submits++});
 w.addEventListener('mws-payment-restored',()=>restores++);w.eval(source);
 return {w,d:w.document,tick:()=>interval(),counts:()=>({writes,submits,restores}),close:()=>{observers.forEach(o=>o.disconnect());w.close()}};
}

test('repeated minimize/restore retains original payment fields, uploaded file and late result without submitting',()=>{
 const s=setup(),{w,d}=s;
 try{
  const amount=d.querySelector('#amount'),photos=d.querySelector('#photos'),file=new w.File(['fixture'],'invoice.jpg',{type:'image/jpeg'});
  Object.defineProperty(photos,'files',{configurable:true,value:[file]});
  for(let cycle=0;cycle<3;cycle++){
   d.querySelector('[data-mws-payment-minimize-button]').click();
   d.querySelector('[data-mws-payment-minimize-button]').click();
   amount.value=String(83.17+cycle);d.querySelector('#result').textContent='Background result '+cycle;s.tick();
   const restores=d.querySelectorAll('[data-mws-payment-restore]');assert.equal(restores.length,1);
   restores[0].click();assert.equal(d.querySelector('#amount'),amount);assert.equal(d.querySelector('#photos'),photos);assert.equal(d.querySelector('.pos-standard-modal').style.visibility,'');
   assert.equal(photos.files[0],file);assert.equal(amount.value,String(83.17+cycle));assert.equal(d.querySelector('#result').textContent,'Background result '+cycle);
  }
  assert.deepEqual(s.counts(),{writes:0,submits:0,restores:3});
 }finally{s.close()}
});

test('minimized draft permits second customer input while another visible modal keeps scanner protection',()=>{
 const s=setup(),{d}=s;
 try{
  const scanner=d.querySelector('[data-pos-scanner]'),amount=d.querySelector('#amount');assert.equal(scannerCanFocus(scanner),false);
  d.querySelector('[data-mws-payment-minimize-button]').click();assert.equal(scannerCanFocus(scanner),true);
  scanner.focus();scanner.value='5200000000001';scanner.dispatchEvent(new s.w.Event('input',{bubbles:true}));
  assert.equal(d.activeElement,scanner);assert.equal(amount.value,'83.17');
  const confirmation=d.createElement('div');confirmation.setAttribute('aria-modal','true');d.body.appendChild(confirmation);
  assert.equal(scannerCanFocus(scanner),false,'separate modal still blocks scanner');confirmation.remove();
  d.querySelector('[data-mws-payment-restore]').click();assert.equal(scanner.value,'5200000000001');assert.equal(amount.value,'83.17');assert.equal(scannerCanFocus(scanner),false);
  assert.deepEqual(s.counts(),{writes:0,submits:0,restores:1});
 }finally{s.close()}
});

test('removing a minimized payment removes stale restore affordance without resurrecting or submitting it',()=>{
 const s=setup(),{d}=s;
 try{
  d.querySelector('[data-mws-payment-minimize-button]').click();d.querySelector('.pos-standard-modal').remove();s.tick();
  const restore=d.querySelector('[data-mws-payment-restore]');assert.ok(!restore||restore.style.display==='none','removed payment must not offer stale restore');
  assert.equal(d.querySelector('.pos-standard-modal'),null);assert.deepEqual(s.counts(),{writes:0,submits:0,restores:0});
 }finally{s.close()}
});

test('old restore cannot switch its ownership to a replacement payment before observer cleanup',()=>{
 const s=setup(),{d}=s;
 try{
  const original=d.querySelector('.pos-standard-modal');d.querySelector('[data-mws-payment-minimize-button]').click();
  const staleRestore=d.querySelector('[data-mws-payment-restore]'),replacement=original.cloneNode(true);
  replacement.style.visibility='visible';replacement.style.pointerEvents='auto';replacement.style.opacity='1';replacement.querySelector('#amount').value='19.25';
  original.replaceWith(replacement);staleRestore.click();
  assert.equal(replacement.style.visibility,'visible');assert.equal(replacement.style.pointerEvents,'auto');assert.equal(replacement.style.opacity,'1');assert.equal(replacement.querySelector('#amount').value,'19.25');
  assert.ok(!staleRestore.isConnected||staleRestore.style.display==='none');assert.deepEqual(s.counts(),{writes:0,submits:0,restores:0});
 }finally{s.close()}
});
