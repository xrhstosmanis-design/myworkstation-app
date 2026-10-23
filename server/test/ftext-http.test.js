import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createFtextRouter} from '../src/routes/ftext-v1.js';
async function fixture(fn){
 const calls=[];
 const service=new Proxy({}, {get:(_t,key)=>async(...args)=>{calls.push([key,...args]);return {ok:true}}});
 const app=express();app.use(express.json());
 app.use('/api/ftext/v1',createFtextRouter({service,db:{},ensure:async()=>{},userAuth:(req,_res,next)=>{req.user={id:'test-user',role:req.headers['x-role']||'EMPLOYEE'};next()}}));
 app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api/ftext/v1';
 try{await fn({calls,request:(path,options={})=>fetch(base+path,options)})}finally{await new Promise(r=>server.close(r))}
}
test('actual HTTP rejects employee installation access before service or package action',()=>fixture(async({calls,request})=>{
 for(const [path,method] of [['/companies/company/stores/store/installation/POS-01','GET'],['/companies/company/stores/store/installation','PUT'],['/companies/company/stores/store/installation/POS-01/pairing','POST'],['/companies/company/stores/store/installation/POS-01/package','POST']]){const r=await request(path,{method});assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'no-store')}
 assert.deepEqual(calls,[]);
}));
test('actual HTTP binds manager requests to selected path and routes device credentials separately',()=>fixture(async({calls,request})=>{
 let r=await request('/companies/company-A/stores/store-A/installation/POS-01',{headers:{'x-role':'SUPER_ADMIN'}});assert.equal(r.status,200);assert.deepEqual(calls.pop(),['view',{companyId:'company-A',storeId:'store-A',terminalPos:'POS-01'}]);
 r=await request('/device/ping',{method:'POST',headers:{authorization:'Bearer scoped-device-token'}});assert.equal(r.status,200);assert.deepEqual(calls.pop(),['ping','scoped-device-token']);
 r=await request('/device/status-result',{method:'POST',headers:{authorization:'Bearer scoped-device-token','content-type':'application/json'},body:JSON.stringify({requestId:'synthetic'})});assert.equal(r.status,200);assert.deepEqual(calls.pop(),['report','scoped-device-token',{requestId:'synthetic'}]);
 for(const path of ['/device/commands','/device/sale','/device/pay','/device/execute'])assert.equal((await request(path,{method:'POST'})).status,404);
}));
test('actual public HTTP pairing is bounded and passes no arbitrary manager scope',()=>fixture(async({calls,request})=>{
 for(let i=0;i<10;i++)assert.equal((await request('/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'FT-12345678'})})).status,201);
 assert.equal((await request('/pair',{method:'POST'})).status,429);assert.equal(calls.length,10);assert.deepEqual(calls[0],['pair',{code:'FT-12345678'}]);
}));
test('actual cash HTTP requires purpose-separated device authentication before queue access',async()=>{
 const {createFtextInstallationService}=await import('../src/services/ftext-installation.js');let touched=0;
 const service=createFtextInstallationService({db:{$transaction:()=>{touched++;throw Error('unauthenticated DB access')}},secret:()=> 'fixture-secret-with-sufficient-length',moduleState:()=>assert.fail('unauthenticated module read')});
 const app=express();app.use(express.json());app.use('/api/ftext/v1',createFtextRouter({service,db:{},ensure:async()=>{}}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{for(const action of ['cash-poll','cash-result'])for(const token of ['', 'wrong-purpose-or-expired']){const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/ftext/v1/device/'+action,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'});assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store')}assert.equal(touched,0)}finally{await new Promise(r=>server.close(r))}
});
test('actual separate POS capability route binds company/store/terminal and cannot fall through the catalog mount',async()=>{
 const {readFile}=await import('node:fs/promises'),source=await readFile(new URL('../src/routes/store-pos.js',import.meta.url),'utf8');
 const selected=source.split('\n').filter(line=>line.startsWith('async function ftextConfigured(')||line.startsWith('function assertStore(')||line.startsWith('async function storeFor(')||line.startsWith("router.get('/stores/:storeId/ftext-cash/capability'"));assert.equal(selected.length,4);
 const reads=[],db={store:{findFirst:async({where})=>where.id==='A'&&where.companyId==='company-A'?{id:'A',companyId:'company-A'}:null},$queryRaw:async(parts,...values)=>{reads.push(values);return parts.join('').includes('to_regclass')?[{name:'fixture.CloudDevice'}]:values[0]==='company-A'&&values[1]==='A'&&values[2]==='ftext:POS-A'?[{configured:1}]:[]},$executeRaw:()=>assert.fail('capability wrote data')};
 const router=express.Router();new Function('router','prisma','requestTerminal',selected.join('\n'))(router,db,async req=>req.headers['x-terminal']||'POS-A');
 const app=express();app.use((req,res,next)=>{if(!req.headers['x-company'])return res.sendStatus(401);req.user={tokenType:'STORE_OPERATOR',storeId:'A',companyId:req.headers['x-company']};next()});
 // The real catalog is mounted first but has no matching capability route.
 app.use('/api/store-pos',express.Router().get('/stores/:storeId',(_req,res)=>res.json({catalog:true})));app.use('/api/store-pos',router);app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/store-pos/stores/';
 try{
  assert.equal((await fetch(base+'A/ftext-cash/capability')).status,401);
  const get=(store,headers={})=>fetch(base+store+'/ftext-cash/capability',{headers:{'x-company':'company-A',...headers}});
  assert.deepEqual(await(await get('A')).json(),{storeId:'A',configured:true});
  assert.deepEqual(await(await get('A',{'x-terminal':'POS-B'})).json(),{storeId:'A',configured:false});
  assert.equal((await get('B')).status,403);assert.equal((await get('A',{'x-company':'company-B'})).status,404);
  assert.ok(reads.some(values=>values.join('|')==='company-A|A|ftext:POS-A'));
 }finally{await new Promise(r=>server.close(r))}
});
