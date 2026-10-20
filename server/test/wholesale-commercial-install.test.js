import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createWholesaleInstallController} from '../../client/src/components/wholesale/wholesale-install.mjs';

const deferred = () => { let resolve; const promise = new Promise(yes => {resolve=yes;}); return {promise,resolve}; };
function environment() {
  const target = new EventTarget(), media = new EventTarget();
  media.matches = false;
  target.matchMedia = () => media;
  target.navigator = {};
  return {target,media};
}
function offer(target, {choice = Promise.resolve({outcome:'accepted'}), failure} = {}) {
  let calls=0;
  const event = new Event('beforeinstallprompt',{cancelable:true});
  event.prompt = () => { calls++; if(failure) throw failure; return Promise.resolve(); };
  event.userChoice = choice;
  target.dispatchEvent(event);
  return {event,calls:()=>calls};
}

test('install prompt requires explicit click, consumes one event, and accepted is not installed',async()=>{
  const {target}=environment(), controller=createWholesaleInstallController(target);
  assert.equal(await controller.install(),false);
  const choice=deferred(), prompt=offer(target,{choice:choice.promise});
  assert.equal(prompt.event.defaultPrevented,true);
  assert.equal(prompt.calls(),0);
  const installing=controller.install();
  assert.equal(prompt.calls(),1);
  assert.equal(await controller.install(),false);
  choice.resolve({outcome:'accepted'}); await installing;
  assert.equal(controller.getState().status,'accepted');
  assert.equal(await controller.install(),false);
  target.dispatchEvent(new Event('appinstalled'));
  assert.equal(controller.getState().status,'installed');
  controller.dispose();
});

test('cancel/error can only retry a new browser event; late choices cannot override installed or disposal',async()=>{
  const {target}=environment(), controller=createWholesaleInstallController(target);
  offer(target,{choice:Promise.resolve({outcome:'dismissed'})}); await controller.install();
  assert.equal(controller.getState().status,'cancelled');
  assert.equal(await controller.install(),false);
  offer(target,{failure:Error('browser refused')}); await controller.install();
  assert.equal(controller.getState().status,'error');
  const choice=deferred(); offer(target,{choice:choice.promise}); const installing=controller.install();
  target.dispatchEvent(new Event('appinstalled')); choice.resolve({outcome:'dismissed'}); await installing;
  assert.equal(controller.getState().status,'installed');
  controller.dispose();
  const second=environment(), c=createWholesaleInstallController(second.target), pending=deferred();
  offer(second.target,{choice:pending.promise}); const inFlight=c.install();
  let changes=0; c.subscribe(()=>changes++); c.dispose();
  pending.resolve({outcome:'accepted'}); await inFlight;
  offer(second.target); assert.equal(changes,0); assert.equal(await c.install(),false);
});

test('standalone startup and display changes suppress prompt and clean media listeners',()=>{
  const {target,media}=environment(); media.matches=true;
  const c=createWholesaleInstallController(target);
  assert.equal(c.getState().status,'installed');
  offer(target); assert.equal(c.getState().status,'installed');
  media.matches=false;media.dispatchEvent(new Event('change'));
  assert.equal(c.getState().status,'unsupported');
  offer(target);assert.equal(c.getState().status,'ready');
  media.matches=true;media.dispatchEvent(new Event('change'));
  assert.equal(c.getState().status,'installed');
  c.dispose();media.matches=false;media.dispatchEvent(new Event('change'));
  assert.equal(c.getState().status,'installed');
});

test('dedicated branded manifest has stable bounded identity with no tenant or credential launch state',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../client/public/wholesale-app/wholesale.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.id,'/wholesale/'); assert.equal(manifest.start_url,'/wholesale/');
  assert.equal(manifest.scope,'/wholesale'); assert.equal(manifest.display,'standalone');
  assert.deepEqual(manifest.icons.map(icon=>icon.src),['/pwa-192.png','/pwa-512.png']);
  for(const icon of manifest.icons) assert.ok(readFileSync(new URL(`../../client/public${icon.src}`,import.meta.url)).length>0);
});

const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/wholesale/WholesaleInstall.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
const component={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);
test('mounted installation control reflects browser lifecycle and gives honest offline/manual fallback',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/wholesale/'});
  const keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client');
  const root=createRoot(document.getElementById('root')); let mounted=true;
  try {
    await React.act(async()=>root.render(React.createElement(component.exports.default,{environment:dom.window})));
    assert.equal(document.querySelector('button'),null);
    assert.match(document.body.textContent,/Chrome \/ Edge/);assert.match(document.body.textContent,/iPhone \/ iPad/);
    assert.match(document.body.textContent,/ξεχωριστή προετοιμασία/);
    let calls=0; const choice=deferred();
    const event=new dom.window.Event('beforeinstallprompt',{cancelable:true});
    event.prompt=()=>{calls++;return Promise.resolve();};event.userChoice=choice.promise;
    await React.act(async()=>dom.window.dispatchEvent(event));
    assert.equal(calls,0);assert.equal(event.defaultPrevented,true);
    await React.act(async()=>{document.querySelector('button').click();document.querySelector('button').click();});
    assert.equal(calls,1);assert.equal(document.querySelector('button').disabled,true);
    await React.act(async()=>choice.resolve({outcome:'dismissed'}));
    assert.match(document.querySelector('[role="status"]').textContent,/ακυρώθηκε/);
    await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('appinstalled')));
    assert.match(document.querySelector('[role="status"]').textContent,/εγκατεστημένη/);
    await React.act(async()=>root.unmount());mounted=false;
    dom.window.dispatchEvent(event);assert.equal(document.getElementById('root').textContent,'');assert.equal(calls,1);
  } finally {
    if(mounted)await React.act(async()=>root.unmount()); dom.window.close();
    for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
