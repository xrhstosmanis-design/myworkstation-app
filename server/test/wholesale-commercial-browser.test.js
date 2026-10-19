import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,access,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

let chrome=process.env.CHROME_BIN;
for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])if(!chrome){try{await access(bin);chrome=bin}catch{}}
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
// This is an isolated synthetic software check. It never connects to hosted
// accounts or resumes a protected native/browser session.
test('actual Chromium persists encrypted offline orders across browser restart; shell never caches private API responses', {skip:!chrome&&!process.env.CI,timeout:150000},async()=>{
  assert.ok(chrome,'Chromium is required in CI; missing runtime must not be skipped');
  const profile=await mkdtemp(path.join(tmpdir(),'mws-wholesale-offline-chrome-'));
  const evidence=path.join(tmpdir(),'mws-wholesale-commercial-offline');await mkdir(evidence,{recursive:true});
  const compiled=await build({stdin:{contents:`import {createWholesaleOfflineVault} from './client/src/components/wholesale/wholesale-offline-vault.mjs';import {createWholesaleOfflineStorage} from './client/src/components/wholesale/wholesale-offline-idb.mjs';window.fixture={createVault:createWholesaleOfflineVault,createStorage:createWholesaleOfflineStorage};`,resolveDir:sourceRoot},bundle:true,write:false,format:'iife',platform:'browser'});
  const sw=(await readFile(new URL('../../client/wholesale-sw.template.js',import.meta.url),'utf8')).replace('__WHOLESALE_SHELL_FILES__',JSON.stringify(['/wholesale/','/assets/offline-fixture.js'])).replace('__WHOLESALE_SHELL_VERSION__','browser-fixture-v1');
  const html='<!doctype html><html><meta charset="utf-8"><title>Wholesale offline synthetic acceptance</title><body><h1>OFFLINE TEST ONLY</h1><script src="/assets/offline-fixture.js"></script></body></html>';
  let unavailable=false,posts=0,privateReads=0;
  const server=createServer((req,res)=>{
    if(unavailable){req.socket.destroy();return}
    if(req.method!=='GET'){posts++;res.writeHead(405).end();return}
    if(req.url==='/api/private'){privateReads++;res.setHeader('Cache-Control','no-store');res.end('PRIVATE RESPONSE NEVER CACHE');return}
    const files={'/wholesale/':['text/html',html],'/assets/offline-fixture.js':['application/javascript',compiled.outputFiles[0].text],'/wholesale-sw.js':['application/javascript',sw]};
    const file=files[req.url];if(!file){res.writeHead(404).end();return}res.setHeader('Content-Type',file[0]);res.setHeader('Cache-Control','no-store');res.end(file[1]);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  function launch(){
    const process=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--no-startup-window','--user-data-dir='+profile],{stdio:['ignore','ignore','pipe','pipe','pipe']});
    let counter=0,buffer='',errors='';const pending=new Map();
    process.stderr.on('data',value=>{errors=(errors+value).slice(-1500)});
    process.once('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Chromium exited'))}pending.clear()});
    process.stdio[4].on('data',value=>{buffer+=value;let end;while((end=buffer.indexOf('\0'))>=0){const text=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!text)continue;const item=JSON.parse(text);const p=pending.get(item.id);if(p){pending.delete(item.id);clearTimeout(p.timer);item.error?p.reject(Error(JSON.stringify(item.error))):p.resolve(item.result)}}});
    const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out '+errors))},45000);pending.set(id,{resolve,reject,timer});process.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0')});
    return {process,cdp,async close(){
      const exited=new Promise(resolve=>{if(process.exitCode!==null)return resolve();process.once('exit',resolve)});
      await cdp('Browser.close').catch(()=>{});
      let timer;await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(resolve,5000)})]);clearTimeout(timer);
      if(process.exitCode===null){process.kill();await exited}
    }};
  }
  async function page(){const target=await browser.cdp('Target.createTarget',{url:'about:blank'}),attached=await browser.cdp('Target.attachToTarget',{targetId:target.targetId,flatten:true});const session=attached.sessionId;await browser.cdp('Page.enable',{},session);return {session,async evaluate(expression){const value=await browser.cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value},async navigate(){await browser.cdp('Page.navigate',{url:origin+'/wholesale/'},session);for(let attempt=0;attempt<120;attempt++){if(await this.evaluate('Boolean(window.fixture)'))return;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Offline shell did not reopen')}}}
  const scope={userId:'offline-user',companyId:'offline-company',storeId:'offline-store',role:'OWNER'};
  const passphrase='fixture separate local phrase';
  const report={kind:'CI actual Chromium / real IndexedDB / static synthetic fixture; not LIVE',checks:[]};
  try{
    browser=launch();let p=await page();await p.navigate();
    await p.evaluate(`(async()=>{const r=await navigator.serviceWorker.register('/wholesale-sw.js',{scope:'/wholesale'});if(!r.active)await new Promise((resolve,reject)=>{const w=r.installing||r.waiting;w.addEventListener('statechange',()=>{if(w.state==='activated')resolve();if(w.state==='redundant')reject(Error('install failed'))})});return true})()`);
    assert.equal(await p.evaluate(`fetch('/api/private').then(x=>x.text())`),'PRIVATE RESPONSE NEVER CACHE');
    const draft=await p.evaluate(`(async()=>{window.vault=fixture.createVault();await vault.prepare(${JSON.stringify(scope)},${JSON.stringify(passphrase)},{store:{id:'offline-store',name:'Synthetic store'},identity:${JSON.stringify(scope)},paidExpiresAt:Date.now()+3600000,customers:[{id:'customer-a',name:'SECRET CUSTOMER NAME'}],products:[{id:'product-a',name:'SECRET CATALOG NAME',sku:'SECRET SKU',unit:'BOX'}]});return vault.addDraft({customerId:'customer-a',items:[{productId:'product-a',quantity:'2'}],notes:'SECRET ORDER NOTE'})})()`);
    assert.equal(draft.status,'LOCAL_DRAFT');assert.equal(draft.id,draft.clientOrderId);
    const cipher=await p.evaluate(`fixture.createStorage().list().then(x=>JSON.stringify(x))`);for(const text of ['SECRET CUSTOMER NAME','SECRET CATALOG NAME','SECRET SKU','SECRET ORDER NOTE',passphrase])assert.ok(!cipher.includes(text));report.checks.push('actual IndexedDB envelope contains no plaintext customer/catalog/order notes or passphrase');
    const cas=await p.evaluate(`(async()=>{const a=fixture.createStorage({name:'isolated-cas-proof'}),b=fixture.createStorage({name:'isolated-cas-proof'});return Promise.all([a.compareAndSwap('fixture',null,{version:1,ciphertext:'opaque-a'}),b.compareAndSwap('fixture',null,{version:1,ciphertext:'opaque-b'})])})()`);assert.equal(cas.filter(Boolean).length,1);report.checks.push('two independent IndexedDB connections atomically reject competing initial CAS write');
    const frozenBody={clientOrderId:draft.id,customerId:'customer-a',storeId:'offline-store',items:[{productId:'product-a',quantity:'2'}],quoteId:'a'.repeat(64),notes:'SECRET ORDER NOTE'};
    await p.evaluate(`vault.freezeSend(${JSON.stringify(draft.id)},${JSON.stringify(frozenBody)})`);
    const second=await page();await second.navigate();await second.evaluate(`(async()=>{window.secondVault=fixture.createVault({onInvalidated:()=>{window.denialObserved=true}});await secondVault.unlock(${JSON.stringify(scope)},${JSON.stringify(passphrase)});return true})()`);
    await p.evaluate(`(()=>{window.pendingSend=vault.sendFrozen(${JSON.stringify(draft.id)},async body=>{window.sendStarted=true;await new Promise(resolve=>{window.releaseSend=resolve});return {status:'UNKNOWN'}});return true})()`);
    for(let i=0;i<120&&!await p.evaluate('Boolean(window.sendStarted)');i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(await p.evaluate('Boolean(window.sendStarted)'),true);
    assert.equal(await second.evaluate(`secondVault.sendFrozen(${JSON.stringify(draft.id)},async()=>{window.secondCallbackRan=true;return {status:'UNKNOWN'}}).then(()=>false,e=>e.code)`),'SEND_BUSY');assert.equal(await second.evaluate('Boolean(window.secondCallbackRan)'),false);
    await p.evaluate('(async()=>{releaseSend();await pendingSend;return true})()');report.checks.push('actual Web Locks across two Chromium tabs exclude concurrent callbacks for one persisted immutable request');
    await p.evaluate(`vault.denyPrepared(${JSON.stringify(scope)})`);
    for(let i=0;i<120&&!await second.evaluate('Boolean(window.denialObserved)');i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(await second.evaluate('Boolean(window.denialObserved)'),true);
    assert.equal(await p.evaluate(`vault.unlock(${JSON.stringify(scope)},${JSON.stringify(passphrase)}).then(()=>false,e=>e.code)`),'REVOKED');
    const renewed=await p.evaluate(`vault.prepare(${JSON.stringify(scope)},${JSON.stringify(passphrase)},{store:{id:'offline-store',name:'Synthetic store'},identity:${JSON.stringify(scope)},paidExpiresAt:Date.now()+3600000,customers:[{id:'customer-a',name:'SECRET CUSTOMER NAME'}],products:[{id:'product-a',name:'SECRET CATALOG NAME',sku:'SECRET SKU',unit:'BOX'}]})`);
    assert.equal(renewed.drafts[0].status,'UNKNOWN');assert.equal(renewed.drafts[0].sendBody,JSON.stringify(frozenBody));report.checks.push('actual IndexedDB denial survives locked state, BroadcastChannel invalidates matching tab, renewal preserves unknown original body/key');
    await browser.close();browser=null;unavailable=true;browser=launch();p=await page();await p.navigate();
    const restored=await p.evaluate(`(async()=>{window.vault=fixture.createVault();let wrong=false;try{await vault.unlock(${JSON.stringify(scope)},'wrong separate phrase')}catch{wrong=true};const saved=await vault.unlock(${JSON.stringify(scope)},${JSON.stringify(passphrase)});return {wrong,saved}})()`);assert.equal(restored.wrong,true);assert.equal(restored.saved.drafts.length,1);assert.equal(restored.saved.drafts[0].id,draft.id);assert.equal(restored.saved.drafts[0].notes,'SECRET ORDER NOTE');report.checks.push('browser fully closed/restarted; unavailable server; cached shell and encrypted persisted order reopen only after correct unlock');
    assert.equal(await p.evaluate(`fetch('/api/private').then(()=>false,()=>true)`),true);assert.equal(privateReads,1);assert.equal(posts,0);
    const keys=await p.evaluate(`(async()=>{const out=[];for(const n of await caches.keys()){const c=await caches.open(n);out.push(...(await c.keys()).map(x=>new URL(x.url).pathname))}return out})()`);assert.deepEqual(keys.sort(),['/assets/offline-fixture.js','/wholesale/']);report.checks.push('private API fetched online is unavailable offline and absent from all shell cache keys; zero business POSTs');
    await browser.cdp('Page.captureScreenshot',{format:'png'},p.session).then(x=>writeFile(path.join(evidence,'offline-reopened.png'),Buffer.from(x.data,'base64')));
    report.pass=true;await writeFile(path.join(evidence,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true})}
});
