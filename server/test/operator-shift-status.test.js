import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const source=fs.readFileSync(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');
const middleware=source.slice(source.indexOf('async function requireCashAccess'),source.indexOf('function assertStoreAccess'));
const boundary=source.slice(source.indexOf('function assertStoreAccess'),source.indexOf('async function ownedStore'));
const routeSource=source.slice(source.indexOf('router.get("/stores/:storeId/shift-status"'),source.indexOf('router.get("/stores/:storeId/overview"'));
function fixture(permissions=[]){
 let handler;const queries=[];let value;
 const context={router:{get:(_,fn)=>{handler=fn}},route:fn=>fn,
  ownedStore:async(id,company)=>{assert.equal(company,'company');return{id,name:'LAB'}},requestTerminal:async()=> 'BOUND',
  prisma:{$queryRaw:async(strings,...values)=>{const sql=strings.join('?');queries.push({sql,values});return sql.includes("'CLOSED'")?[{closingSafe:7,closingDrawer:2}]:[{id:'shift',status:'OPEN',openedAt:'now',cashSales:999}]}}};
 vm.runInNewContext(boundary+routeSource,context);
 return {handler,queries,req:{params:{storeId:'store'},user:{tokenType:'STORE_OPERATOR',storeId:'store',companyId:'company',permissions}},res:{json:x=>{value=x}},get result(){return value}};
}
test('card-only or fully restricted operator reads bound shift status without balances or overview access',async()=>{
 const f=fixture();await f.handler(f.req,f.res);
 assert.deepEqual(JSON.parse(JSON.stringify(f.result)),{store:{id:'store',name:'LAB'},openSession:{id:'shift',status:'OPEN',openedAt:'now'}});
 assert.equal(f.queries.length,1);assert.deepEqual(f.queries[0].values,['store','company','BOUND']);
 assert.doesNotMatch(f.queries[0].sql,/SELECT \*/);
 const access=vm.runInNewContext('('+middleware.trim()+')');let allowed=false,status;
 const res={status:x=>{status=x;return {json:()=>{}}}};
 await access({...f.req,method:'GET',originalUrl:'/api/cash/stores/store/shift-status'},res,()=>{allowed=true});assert.equal(allowed,true);
 allowed=false;await access({...f.req,method:'GET',originalUrl:'/api/cash/stores/store/overview'},res,()=>{allowed=true});assert.equal(allowed,false);assert.equal(status,403);
});
test('opening suggestions require initial-cash permission and keep the same terminal/company boundary',async()=>{
 const f=fixture(['INITIAL_CASH']);await f.handler(f.req,f.res);
 assert.equal(f.result.suggestedOpening.safe,7);assert.equal(f.result.suggestedOpening.drawer,2);assert.equal(f.queries.length,2);
 for(const q of f.queries)assert.deepEqual(q.values,['store','company','BOUND']);
 const denied=fixture();denied.req.params.storeId='foreign';await assert.rejects(()=>denied.handler(denied.req,denied.res),{status:403});assert.equal(denied.queries.length,0);
});

test('actual POS entry shows shift failure and retry recovers without requesting cash overview',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test.local/store/store'});
 dom.window.sessionStorage.setItem('storeOperatorSession',JSON.stringify({user:{fullName:'LAB',role:'EMPLOYEE'},store:{id:'store',name:'LAB'},company:{}}));
 const keys=['window','document','navigator','HTMLElement','sessionStorage','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];
 const before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let tries=0;const requests=[];
 const fetchStub=async path=>{requests.push(path);let status=200,body={access:{}};
  if(path.endsWith('/table-service'))status=403;
  if(path.endsWith('/shift-status')){tries++;if(tries===1){status=503;body={error:'SHIFT TEST FAILURE'}}else body={openSession:{id:'shift',status:'OPEN'}}}
  return {ok:status===200,status,text:async()=>JSON.stringify(body)};
 };
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='fetch'?fetchStub:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreOperatorApp.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.css':'empty'},plugins:[{name:'stub-unrelated-children',setup(b){b.onResolve({filter:/^\.\/(Store(Shift|Pos|Mobile|Handover)|EmployeeWorkCard|MyShiftEntries).*\.jsx$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import React from "react"; export default function Child(){return React.createElement("h2",null,"POS CHILD");}',loader:'js'}));}}]});
 const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>{root.render(React.createElement(m.exports.default,{storeId:'store'}));await new Promise(r=>setTimeout(r,25))});
  assert.match(document.body.textContent,/Δεν ολοκληρώθηκε ο έλεγχος βάρδιας/);assert.equal(document.querySelector('[role="alert"]').textContent,'SHIFT TEST FAILURE');
  const retry=[...document.querySelectorAll('button')].find(x=>x.textContent==='Δοκιμή ξανά');
  await act(async()=>{retry.click();await new Promise(r=>setTimeout(r,25))});
  assert.match(document.body.textContent,/POS CHILD/);assert.equal(tries,2);assert.equal(requests.some(x=>x.endsWith('/overview')),false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v] of before){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
