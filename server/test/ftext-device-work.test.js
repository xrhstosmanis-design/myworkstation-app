import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {pollFtextDeviceWork} from '../src/services/ftext-device-work.js';
import {createFtextRouter} from '../src/routes/ftext-v1.js';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';

function fixture(){
 const settings={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'TEST12345',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'8c72e9c8-b4aa-46de-81fb-f422f9319177',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}]};
 const device={id:'device-a',tokenVersion:2,status:'ACTIVE',lastSeenAt:new Date(),metadata:{ftextReadinessRequired:true,ftextLastStatus:{ok:true,code:0,serialNumber:settings.serialNumber,fiscalExecution:false,checkedAt:new Date().toISOString(),receivedAt:new Date().toISOString()}}};
 const row={id:'request-a',status:'PREPARED',settingsHash:ftextSettingsHash(settings),lifecycleGeneration:'0',serialNumber:settings.serialNumber,plan:{scope:{companyId:settings.companyId,storeId:settings.storeId,terminalPos:settings.terminalPos}}};
 const calls=[];let enabled=true;
 const tx={$queryRaw:async(parts,...args)=>{
  const sql=parts.join('?');calls.push(sql);
  if(sql.includes('to_regclass'))return [{name:enabled?'FtextCashRequest':null}];
  if(sql.includes("'ftextVoid'"))return [];
  if(sql.startsWith('UPDATE')){assert.equal(row.status,'PREPARED');row.status='DISPATCHED';return [structuredClone(row)];}
  if(sql.includes("status\"='PREPARED'"))return row.status==='PREPARED'?[structuredClone(row)]:[];
  return [];
 }};
 return {settings,device,row,calls,tx,setTable:value=>enabled=value};
}
test('combined work preserves fresh-readiness and one-shot dispatch, with no recovery work mixed into a claim',async()=>{
 const f=fixture();f.device.metadata.ftextLastStatus.checkedAt=new Date(Date.now()-21000).toISOString();
 assert.equal((await pollFtextDeviceWork(f.tx,f.device,f.settings)).request,null);assert.equal(f.row.status,'PREPARED');
 f.device.metadata.ftextLastStatus.checkedAt=new Date().toISOString();f.calls.length=0;
 const work=await pollFtextDeviceWork(f.tx,f.device,f.settings);assert.equal(work.request.id,f.row.id);assert.equal(work.lateReceipt,null);assert.equal(work.errorEvidence,null);assert.equal(f.row.status,'DISPATCHED');
 assert.equal(f.calls.filter(s=>s.includes('to_regclass')).length,1);assert.equal(f.calls.some(s=>s.includes("result\"->>'description'")),false);
 assert.equal((await pollFtextDeviceWork(f.tx,f.device,f.settings)).request,null,'Lost response must not redeliver a dispatched payment');
});
test('durable local recovery and communication-only devices cannot claim a job or read the fiscal queue',async()=>{
 const f=fixture();
 for(const [settings,options] of [[f.settings,{recovering:true}],[{...f.settings,cashEnabled:false},{}]]){
  assert.deepEqual(await pollFtextDeviceWork(f.tx,f.device,settings,options),{request:null,lateReceipt:null,errorEvidence:null});assert.equal(f.calls.length,0);
 }
 f.setTable(false);assert.equal((await pollFtextDeviceWork(f.tx,f.device,f.settings)).request,null);assert.equal(f.calls.length,1);
});
test('one HTTP work poll authenticates once, validates input and keeps old ping compatible',async()=>{
 const f=fixture();let authenticated=0;const service={ping:async(token,body,work)=>{
  assert.equal(token,'fixture-token');authenticated++;assert.deepEqual(body,{readinessVersion:1});
  return {settings:f.settings,settingsHash:ftextSettingsHash(f.settings),...(work?await work(f.tx,f.device,f.settings):{})};
 }};
 const app=express();app.use(express.json());app.use(createFtextRouter({service,db:{},ensure:async()=>{}}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  let response=await post('/device/work-poll',{readinessVersion:1,recovering:true});assert.equal(response.status,200);assert.equal((await response.json()).request,null);assert.equal(authenticated,1);assert.equal(f.row.status,'PREPARED');
  for(const input of [{readinessVersion:1},{readinessVersion:1,recovering:'false'},{readinessVersion:1,recovering:false,terminalPos:'FOREIGN'},{readinessVersion:2,recovering:false}])assert.equal((await post('/device/work-poll',input)).status,400);
  assert.equal(authenticated,1);
  response=await post('/device/work-poll',{readinessVersion:1,recovering:false});assert.equal(response.status,200);assert.equal((await response.json()).request.id,f.row.id);assert.equal(authenticated,2);
  response=await post('/device/ping',{readinessVersion:1});assert.equal(response.status,200);assert.equal(authenticated,3);
 }finally{await new Promise(r=>server.close(r));}
});
