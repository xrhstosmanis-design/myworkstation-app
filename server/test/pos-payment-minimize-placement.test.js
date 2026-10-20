import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {JSDOM} from 'jsdom';

const source=await readFile(new URL('../../client/src/pos-payment-minimize-bootstrap.js',import.meta.url),'utf8');
const css=await readFile(new URL('../../client/src/components/store/store-pos.css',import.meta.url),'utf8');
function setup(pos){const dom=new JSDOM(fixture(pos),{runScripts:'outside-only'}),w=dom.window,observers=[],Observer=w.MutationObserver;w.MutationObserver=class extends Observer{constructor(fn){super(fn);observers.push(this)}};w.setInterval=()=>0;w.requestAnimationFrame=fn=>fn();return{dom,w,close:()=>{for(const o of observers)o.disconnect();w.close()}}}
const fixture=pos=>`<style>${css}</style>${pos?'<div id="root"><div class="mws-standard-pos"><section class="standard-sale-panel"><div class="standard-search"><input data-pos-scanner placeholder="Barcode, SKU ή αναζήτηση προϊόντος"></div><div class="standard-lines">Προϊόν πελάτη 2,20 €</div></section><footer class="standard-action-bar"><button id="cash">ΜΕΤΡΗΤΑ</button><button id="card">ΚΑΡΤΑ</button><strong id="total">ΣΥΝΟΛΟ 2,20 €</strong></footer></div></div>':''}<div class="pos-standard-modal"><section><header><h2>Πληρωμές</h2><button aria-label="Κλείσιμο">×</button></header><main><button>Πληρωμή προμηθευτή</button><button>Λοιπά έξοδα</button><input id="draft" value="7.25"><div id="late"></div></main></section></div>`;

test('payment restore stays in POS search flow, preserves the same draft and never occupies checkout',()=>{
 const {w,close}=setup(true),d=w.document;
 w.setInterval=()=>0;w.requestAnimationFrame=fn=>fn();let writes=0;w.fetch=()=>{writes++;throw Error('unexpected request')};
 w.eval(source);const overlay=d.querySelector('.pos-standard-modal'),input=d.getElementById('draft');input.value='83.17';
 d.querySelector('[data-mws-payment-minimize-button]').click();const pill=d.querySelector('[data-mws-payment-restore]');
 assert.equal(pill.parentElement,d.querySelector('.standard-search'));assert.equal(pill.style.position,'static');assert.equal(pill.style.bottom,'');assert.equal(pill.style.display,'block');
 assert.equal(pill.getAttribute('aria-label'),'Συνέχεια πληρωμής');assert.equal(w.getComputedStyle(overlay).visibility,'hidden');
 d.getElementById('late').textContent='Background result';pill.click();
 assert.equal(d.getElementById('draft'),input);assert.equal(input.value,'83.17');assert.equal(d.getElementById('late').textContent,'Background result');assert.equal(pill.style.display,'none');assert.equal(overlay.style.visibility,'');assert.equal(writes,0);close();
});

test('payment restore outside Store POS uses the top edge instead of checkout footer',()=>{
 const {w,close}=setup(false);w.eval(source);
 w.document.querySelector('[data-mws-payment-minimize-button]').click();const pill=w.document.querySelector('[data-mws-payment-restore]');
 assert.equal(pill.parentElement,w.document.body);assert.equal(pill.style.top,'20px');assert.equal(pill.style.bottom,'');close();
});

let chrome=process.env.CHROME_BIN;
for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'])if(!chrome){try{await access(bin);chrome=bin}catch{}}
// Isolated synthetic browser only. No hosted account, business request or user session.
test('Chromium hit testing leaves cash, card and total fully exposed while payment is minimized',{skip:!chrome&&!process.env.CI,timeout:40000},async()=>{
 assert.ok(chrome,'Chromium is required in CI');const dir=await mkdtemp(path.join(tmpdir(),'mws-payment-placement-'));
 const verify=`const check=(v,m)=>{if(!v)throw Error(m)};try{const input=document.getElementById('draft');input.value='83.17';document.querySelector('[data-mws-payment-minimize-button]').click();const pill=document.querySelector('[data-mws-payment-restore]'),search=document.querySelector('.standard-search');check(pill.parentElement===search,'search host');const p=pill.getBoundingClientRect(),s=search.getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect();check(p.width>100&&p.height>=32,'visible touch restore');check(p.left>=s.left&&p.right<=s.right&&p.top>=s.top&&p.bottom<=s.bottom,'inside search');check(p.bottom<footer.top,'above checkout');check(document.querySelector('[data-pos-scanner]').getBoundingClientRect().width>100,'scanner remains visible');for(const id of ['cash','card','total']){const el=document.getElementById(id),r=el.getBoundingClientRect();check(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el,id+' hit target');}document.getElementById('late').textContent='Background result';pill.click();check(document.getElementById('draft')===input&&input.value==='83.17','same draft');check(document.getElementById('late').textContent==='Background result','late result');document.body.dataset.result='PASS'}catch(e){document.body.dataset.result='FAIL:'+e.message}`;
 try{const html='<!doctype html><meta charset="utf-8">'+fixture(true)+'<style>body{margin:0}.mws-standard-pos{display:block}.standard-sale-panel{display:block;margin:100px 20px}.standard-action-bar{position:fixed;bottom:0;left:0;right:0;height:70px;display:flex}.standard-action-bar>*{flex:1}.pos-standard-modal{position:fixed;inset:0;background:#fff}</style><script>'+source+'</script><script>'+verify+'</script>';
  const file=path.join(dir,'fixture.html');await writeFile(file,html);const result=await new Promise((resolve,reject)=>{const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--window-size=1366,768','--user-data-dir='+path.join(dir,'profile'),'--virtual-time-budget=1000','--dump-dom','file://'+file]);let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>resolve({code,out,err}));});
  assert.equal(result.code,0,result.err.slice(-1000));assert.match(result.out,/<body[^>]*data-result="PASS"/,result.out.match(/data-result="[^"]*"/)?.[0]||result.err.slice(-1000));
 }finally{await rm(dir,{recursive:true,force:true})}
});
