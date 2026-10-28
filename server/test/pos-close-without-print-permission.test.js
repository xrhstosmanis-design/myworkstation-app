import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import express,{Router} from 'express';
import {z} from 'zod';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const authSource=fs.readFileSync(new URL('../src/middleware/auth.js',import.meta.url),'utf8');
const mapper=vm.runInNewContext('('+authSource.slice(authSource.indexOf('function storeRuntimePermissions('),authSource.indexOf('function enforceStorePaymentPermissions(')).trim()+')');
const expose=vm.runInNewContext('('+authSource.match(/function exposeStorePosRuntimeAccess\(req,res,rights\)\{[\s\S]*?\n\}/)[0]+')');
test('the dedicated current-profile grant is strict true, independent of cash and role names, and revocation is exposed explicitly',()=>{
 for(const value of [undefined,false,null,0,1,'true','false',{},[]])assert.equal(mapper({role:'MANAGER',permissions:{cash:true,cards:true,closeWithoutPrint:value}}).includes('POS_CLOSE_WITHOUT_PRINT'),false);
 assert.equal(mapper({permissions:{closeWithoutPrint:true}}).includes('POS_CLOSE_WITHOUT_PRINT'),true);
 for(const value of [undefined,false,'true',true]){
  let body;const res={json:input=>{body=input}};expose({method:'GET',originalUrl:'/api/store-pos/stores/A/access'},res,{closeWithoutPrint:value});res.json({access:{closeWithoutPrint:true,purchaseOrders:true}});
  assert.equal(body.access.closeWithoutPrint,value===true);assert.equal(body.access.purchaseOrders,true);
 }
});

async function withRegisteredCatalog(run){
 const state={permissions:{},credentialActive:true,storeActive:true,reads:0,writes:0,entered:0};
 const actor={tokenType:'STORE_OPERATOR',id:'operator-A',operatorId:'operator-A',companyId:'company-A',storeId:'A',role:'EMPLOYEE',permissions:['POS_CLOSE_WITHOUT_PRINT']};
 const prisma={store:{findFirst:async({where})=>state.storeActive&&where.id==='A'&&where.companyId==='company-A'?{id:'A',name:'Synthetic store',companyId:'company-A'}:null},$queryRaw:async(parts,...values)=>{
  const sql=parts.join('?');assert.match(sql,/StoreOperatorCredential/);assert.match(sql,/c\."active"=TRUE/);assert.ok(values.includes('operator-A')&&values.includes('A')&&values.includes('company-A'));state.reads++;
  return state.credentialActive?[{permissions:state.permissions,backofficeMenu:{},posAccess:true}]:[];
 },$executeRaw:async()=>{state.writes++;throw Error('business writes forbidden')},$executeRawUnsafe:async()=>{state.writes++;throw Error('DDL forbidden')}};
 const source=fs.readFileSync(new URL('../src/routes/store-pos-catalog.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace('export default router;','return router;');
 // Register the actual catalog middleware. Unrelated creator routes are isolated;
 // the real permission guard and current-profile query are not replaced.
 const router=new Function('Router','prisma','crypto','z','registerPermanentPriceRoutes','registerPosNewProductRoutes','posNewProductAllowed',source)(Router,prisma,crypto,z,()=>{},()=>{},()=>false);
 const app=express();app.use(express.json());app.use('/api/store-pos',(req,_res,next)=>{req.user={...actor};next()},router);
 const business=(req,res)=>{state.entered++;res.json({ok:true,unchanged:req.body})};
 app.post('/api/store-pos/stores/:storeId/waste',business);app.post('/api/store-pos/stores/:storeId/table-orders/:orderId/waste',business);
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const request=async(path,body={items:[{productId:'synthetic-product',quantity:1}],note:null})=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/store-pos${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};
 };
 try{await run({state,actor,request})}finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
}

test('actual registered middleware denies both no-print paths before any business/DDL write for absent, false and nonboolean grants',()=>withRegisteredCatalog(async({state,actor,request})=>{
 for(const role of ['EMPLOYEE','MANAGER'])for(const value of [undefined,false,null,0,1,'true','false',{},[]])for(const path of ['/stores/A/waste','/stores/A/table-orders/order-A/waste','/stores/A/WASTE/','/stores/A/table-orders/order-A/WASTE/']){
  actor.role=role;state.permissions={cash:true,cards:true,closeWithoutPrint:value};const result=await request(path);assert.equal(result.status,403);assert.match(result.body.error,/Κλείσιμο χωρίς εκτύπωση/);
 }
 assert.equal(state.writes,0);assert.equal(state.entered,0);assert.ok(state.reads>0);
}));

test('the same current session observes a fresh grant and revocation and preserves authorized bodies and admin behavior',()=>withRegisteredCatalog(async({state,actor,request})=>{
 const body={items:[{productId:'synthetic-product',quantity:2.5}],note:'Synthetic whole-table reason'};
 assert.equal((await request('/stores/A/waste',body)).status,403);
 state.permissions={closeWithoutPrint:true};assert.equal((await request('/stores/A/waste',body)).status,200);const table=await request('/stores/A/table-orders/order-A/waste',body);assert.equal(table.status,200);assert.deepEqual(table.body.unchanged,body);
 state.permissions={closeWithoutPrint:false};assert.equal((await request('/stores/A/waste',body)).status,403);assert.equal((await request('/stores/A/table-orders/order-A/waste',body)).status,403);
 assert.equal(state.entered,2);assert.equal(state.writes,0);
 delete actor.tokenType;actor.role='OWNER';const admin=await request('/stores/A/waste',body);assert.equal(admin.status,200);assert.deepEqual(admin.body.unchanged,body);assert.equal(state.entered,3);assert.equal(state.writes,0);
}));

test('foreign company/store and inactive credentials still fail before entering either business path',()=>withRegisteredCatalog(async({state,actor,request})=>{
 state.permissions={closeWithoutPrint:true};assert.equal((await request('/stores/B/waste')).status,403);
 actor.companyId='company-B';assert.equal((await request('/stores/A/waste')).status,404);actor.companyId='company-A';
 state.credentialActive=false;assert.equal((await request('/stores/A/table-orders/order-A/waste')).status,403);state.credentialActive=true;
 state.storeActive=false;assert.equal((await request('/stores/A/waste')).status,404);assert.equal(state.entered,0);assert.equal(state.writes,0);
}));

const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'},logLevel:'silent'});
const component={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);
test('actual mounted POS hides no-print without its grant and a revoked or regranted old callback cannot post',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','localStorage','sessionStorage','Event','MutationObserver','fetch','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async()=>({ok:true}):dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.querySelector('#root')),calls=[];
 const product={id:'p',sku:'SYNTHETIC',name:'SYNTHETIC PRODUCT',salePrice:1,barcodes:[]};
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/ftext-cash/capability'))return {storeId:path.split('/')[4],configured:false};if(/^\/api\/store-pos\/stores\/[^/]+$/.test(path))return {products:[product],layout:{quickKeys:[{id:'q',label:product.name,productQuery:product.sku,visible:true}],categories:[]},access:{}};if(path.endsWith('/waste'))return {ok:true,total:1};if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('inactive');if(path.endsWith('/online-radio'))return {stations:[],state:{}};return {rows:[],items:[],requests:[],offers:[]}};
 const render=async(value,storeId='A')=>React.act(async()=>{root.render(React.createElement(component.exports.default,{api,store:{id:storeId,name:storeId},operator:{id:'operator-A',fullName:'Synthetic'},runtimeAccess:{cash:true,cards:true,closeWithoutPrint:value}}))});
 const button=()=>[...document.querySelectorAll('.standard-action-bar button')].find(node=>node.textContent==='Κλείσιμο χωρίς Εκτύπωση');
 const click=async element=>{assert.ok(element);await React.act(async()=>element.click())};
 const writes=()=>calls.filter(call=>call.path.endsWith('/waste'));
 try{
  for(const value of [undefined,false,'true',1]){await render(value);assert.equal(button(),undefined)}
  await render(true);assert.ok(button());await click(document.querySelector('.standard-quick button:not(:disabled)'));
  const old=button(),handler=old[Object.keys(old).find(key=>key.startsWith('__reactProps$'))].onClick,cart=document.querySelector('.standard-lines').textContent;
  await render(false);assert.equal(button(),undefined);await React.act(async()=>handler());assert.equal(writes().length,0);assert.equal(document.querySelector('.standard-lines').textContent,cart);
  await render(true);await React.act(async()=>handler());assert.equal(writes().length,0);await click(button());assert.equal(writes().length,1);assert.deepEqual(JSON.parse(writes()[0].options.body),{items:[{productId:'p',quantity:1}],note:null});
  assert.equal(calls.some(call=>/\/checkout$|rbs-capdriver-v1$/.test(call.path)&&call.options.method==='POST'),false);
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
});
