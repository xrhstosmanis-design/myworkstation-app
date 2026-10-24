import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createProductionPrinterRouter} from '../src/routes/production-printers.js';
test('mounted printer routes enforce operator store, manager configuration and device authentication boundary',async()=>{
 const calls=[],service={view:async(c,s)=>{calls.push(['view',c,s]);return{jobs:[]}},configure:async()=>{calls.push(['configure']);return{}},claim:async token=>{if(token!=='valid')throw Object.assign(Error('unauthorized'),{status:401});return{job:null}},pair:async()=>({token:'fixture'})};
 const app=express();app.use(express.json());app.use('/api',createProductionPrinterRouter({service,userAuth:(req,res,next)=>{req.user={id:'op',companyId:'company',tokenType:'STORE_OPERATOR',storeId:'kat'};next()},moduleAccess:(_req,_res,next)=>next()}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 try{
  assert.equal((await fetch(base+'/stores/other')).status,403);assert.deepEqual(calls,[]);
  assert.equal((await fetch(base+'/stores/kat')).status,200);assert.deepEqual(calls,[['view','company','kat']]);
  assert.equal((await fetch(base+'/stores/kat',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);assert.equal(calls.length,1);
  assert.equal((await fetch(base+'/device/next',{method:'POST',headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.equal((await fetch(base+'/device/next',{method:'POST',headers:{Authorization:'Bearer valid'}})).status,200);
 }finally{await new Promise(r=>server.close(r))}
});
