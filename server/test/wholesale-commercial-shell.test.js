import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {wholesaleShellFiles,wholesaleOfflineBuild} from '../../client/scripts/wholesale-offline-build.mjs';
import {ensureWholesaleOfflineShell} from '../../client/src/components/wholesale/wholesale-offline-registration.mjs';

const template=await readFile(new URL('../../client/wholesale-sw.template.js',import.meta.url),'utf8');
function worker({failInstall=false,networkDown=false}={}){
  const handlers=new Map(),stores=new Map(),network=[],deleted=[];let claimed=0;
  const origin='https://offline.example.invalid',path=value=>new URL(typeof value==='string'?value:value.url,origin).pathname;
  const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {async addAll(requests){for(const request of requests){network.push(request);if(failInstall)throw Error('network');data.set(path(request),new Response(path(request)==='/wholesale/'?'PUBLIC WHOLESALE SHELL':'PUBLIC ASSET'))}},async match(key){return data.get(path(key))?.clone()}}},async keys(){return [...stores.keys()]},async delete(key){deleted.push(key);return stores.delete(key)}};
  class RequestStub{constructor(url,options){this.url=new URL(url,origin).href;Object.assign(this,options)}}
  const self={location:{origin},clients:{claim:async()=>{claimed++}},addEventListener:(type,fn)=>handlers.set(type,fn)};
  vm.runInNewContext(template.replace('__WHOLESALE_SHELL_FILES__',JSON.stringify(['/wholesale/','/assets/wholesale-hash.js'])).replace('__WHOLESALE_SHELL_VERSION__','version1'),{self,caches,Request:RequestStub,URL,Set,fetch:async request=>{network.push(request);if(networkDown)throw Error('offline');return new Response('NETWORK RESPONSE')}});
  return {stores,network,deleted,get claimed(){return claimed},async event(type){let pending;handlers.get(type)({waitUntil:value=>{pending=value}});return pending},async fetch(pathname,{method='GET',mode='cors',authorization=false,external=false}={}){let response;handlers.get('fetch')({request:{url:(external?'https://elsewhere.invalid':origin)+pathname,method,mode,headers:new Headers(authorization?{Authorization:'synthetic'}:{})},respondWith:value=>{response=value}});return response&&await response}};
}

test('offline worker caches only public shell and bounded assets; no API/auth/query/private response caching',async()=>{
  const w=worker({networkDown:true});await w.event('install');
  assert.ok(w.network.every(x=>x.credentials==='omit'&&x.cache==='reload'));
  for(const url of ['/api/wholesale/orders','/api/auth/login','/b2b/customer','/assets/not-in-manifest.js','/assets/wholesale-hash.js?secret=anything'])assert.equal(await w.fetch(url),undefined,url);
  assert.equal(await w.fetch('/assets/wholesale-hash.js',{method:'POST'}),undefined);
  assert.equal(await w.fetch('/assets/wholesale-hash.js',{authorization:true}),undefined);
  assert.equal(await w.fetch('/assets/wholesale-hash.js',{external:true}),undefined);
  assert.equal(await(await w.fetch('/wholesale/?storeId=private&token=never-cache',{mode:'navigate'})).text(),'PUBLIC WHOLESALE SHELL');
  assert.equal(await(await w.fetch('/assets/wholesale-hash.js')).text(),'PUBLIC ASSET');
  assert.deepEqual([...([...w.stores.values()][0].keys())],['/wholesale/','/assets/wholesale-hash.js']);
});
test('failed precache never leaves an incomplete cache and activation deletes only old wholesale caches',async()=>{
  const broken=worker({failInstall:true});await assert.rejects(broken.event('install'));assert.equal(broken.stores.size,0);assert.equal(broken.claimed,0);
  const good=worker();await good.event('install');good.stores.set('retail-cache',new Map());good.stores.set('mws-wholesale-shell-old',new Map());await good.event('activate');
  assert.equal(good.claimed,1);assert.ok(good.stores.has('retail-cache'));assert.ok(good.stores.has('mws-wholesale-shell-version1'));assert.deepEqual(good.deleted,['mws-wholesale-shell-old']);
});
test('offline shell build follows the wholesale graph and refuses missing dependencies',()=>{
  const chunk=(fileName,extra={})=>({type:'chunk',fileName,imports:[],dynamicImports:[],...extra});
  const bundle={'assets/wh.js':chunk('assets/wh.js',{isEntry:true,facadeModuleId:'/app/client/wholesale.html',imports:['assets/shared.js'],viteMetadata:{importedCss:new Set(['assets/wh.css'])}}),'assets/shared.js':chunk('assets/shared.js'),'assets/wh.css':{type:'asset',fileName:'assets/wh.css'},'assets/retail.js':chunk('assets/retail.js',{isEntry:true,facadeModuleId:'/app/client/index.html'})};
  const files=wholesaleShellFiles(bundle);assert.ok(files.includes('/assets/wh.css'));assert.ok(files.includes('/assets/shared.js'));assert.ok(!files.includes('/assets/retail.js'));delete bundle['assets/shared.js'];assert.throws(()=>wholesaleShellFiles(bundle),/Missing/);
});
test('device readiness requires its own active wholesale worker, not an unrelated origin worker',async()=>{
  const environment={isSecureContext:true,location:{pathname:'/wholesale/',origin:'https://example.invalid'},navigator:{serviceWorker:{register:async(url,options)=>{assert.equal(url,'/wholesale-sw.js');assert.equal(options.scope,'/wholesale');return {scope:'https://example.invalid/wholesale',active:{state:'activated'}}}}}};
  assert.ok(await ensureWholesaleOfflineShell(environment));
  environment.navigator.serviceWorker.register=async()=>({scope:'https://example.invalid/',active:{state:'activated'}});await assert.rejects(ensureWholesaleOfflineShell(environment));
  environment.isSecureContext=false;await assert.rejects(ensureWholesaleOfflineShell(environment));
});
test('worker policy-only update receives a new cache namespace and cannot replace the old active cache during install',async()=>{
  const bundle={'assets/wholesale.js':{type:'chunk',fileName:'assets/wholesale.js',isEntry:true,facadeModuleId:'/app/client/wholesale.html',imports:[],dynamicImports:[],code:'public code'}};
  async function emit(policy){let output;const plugin=wholesaleOfflineBuild({readResource:async url=>url.pathname.endsWith('wholesale-sw.template.js')?template+'\n'+policy:Buffer.from('same public fixture')});await plugin.generateBundle.call({emitFile:value=>{output=value}},null,bundle);return output.source.match(/const CACHE_NAME=CACHE_PREFIX\+'([^']+)'/)[1]}
  assert.notEqual(await emit('// policy one'),await emit('// policy two'));
});
