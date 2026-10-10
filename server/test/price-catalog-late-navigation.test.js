import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

test('leaving price catalog through a later installed module restores its content',async()=>{
  const dom=new JSDOM('<div class="commerce-hub"><section class="panel"><div class="commerce-module-strip"><button id="modules">Modules</button></div></section><div id="late-host">Operators</div></div>',{url:'https://isolated.invalid'});
  const keys=['window','document','localStorage','fetch'];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const calls=[];
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='fetch'?async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>path.endsWith('/lookups')?{stores:[],customers:[]}:{items:[],total:0,pages:1}}}:dom.window[k]});
  localStorage.setItem('user',JSON.stringify({role:'OWNER'}));
  try{
    const {installPriceCatalogSuite}=await import('../../client/src/components/commerce/installPriceCatalogSuite.js');
    installPriceCatalogSuite();
    const hub=document.querySelector('.commerce-hub'),strip=hub.querySelector('.commerce-module-strip'),host=document.getElementById('late-host');
    const late=document.createElement('button');late.innerHTML='<span>Operators</span>';strip.append(late);
    late.addEventListener('click',()=>{hub.classList.remove('commerce-external-tab-active');hub.classList.add('operator-management-active')});
    const price=strip.querySelector('[data-price-catalog-launch]');
    price.click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(host.classList.contains('pc-native-hidden'),true);
    late.querySelector('span').click();
    assert.equal(host.classList.contains('pc-native-hidden'),false,'late module content must be restored on the first direct navigation');
    assert.equal(hub.querySelector('.price-catalog-suite').hidden,true);
    assert.equal(price.classList.contains('active'),false);
    assert.equal(hub.classList.contains('operator-management-active'),true);
    price.click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(hub.querySelector('.price-catalog-suite').hidden,false,'price catalog still opens');
    document.getElementById('modules').click();
    assert.equal(host.classList.contains('pc-native-hidden'),false,'original navigation remains usable');
    assert.equal(hub.querySelector('.price-catalog-suite').hidden,true);
    assert.ok(calls.length>0);assert.ok(calls.every(x=>!x.options?.method||x.options.method==='GET'),'navigation never mutates data');
  }finally{dom.window.close();for(const [k,d] of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
