import test from 'node:test';
import assert from 'node:assert/strict';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';
import {pollFtextDeviceWork} from '../src/services/ftext-device-work.js';
import {acceptFtextHandoff,assertFtextHandoffResult} from '../src/services/ftext-handoff.js';

function fixture(method='CASH',format='OPERATOR_CONFIRMATION'){
 const settings={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'TEST12345',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'8c72e9c8-b4aa-46de-81fb-f422f9319177',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:format==='OPERATOR_CONFIRMATION'?1:6,resultFormat:format,confirmed:true}};
 const scope=Object.fromEntries(['companyId','storeId','terminalPos','fiscalDeviceCode'].map(k=>[k,settings[k]])),settingsHash=ftextSettingsHash(settings);
 const device={id:'device-a',tokenVersion:2,status:'ACTIVE',lastSeenAt:new Date(),metadata:{ftextReadinessRequired:true,ftextLastStatus:{ok:true,code:0,serialNumber:settings.serialNumber,fiscalExecution:false,checkedAt:new Date().toISOString(),receivedAt:new Date().toISOString()}}};
 const row={id:'370a0232-aeb7-4320-9919-d96c3f9f52d5',companyId:settings.companyId,storeId:settings.storeId,terminalPos:settings.terminalPos,serialNumber:settings.serialNumber,status:'PREPARED',settingsHash,lifecycleGeneration:'0',result:null,resultHash:null,saleId:null,total:'1.25',checkoutJson:{paymentMethod:method,ftextCardMode:method==='CARD'?format:null,ftextCardDecision:null},plan:{schemaVersion:'MWS_FTEXT_SALE_PLAN_V1',configurationId:settings.configurationId,settingsHash,planHash:'a'.repeat(64),scope,total:'1.25',payment:{method,code:method==='CASH'?1:2,amount:'1.25'},lines:[{description:'SYNTHETIC',quantity:'1.000',unitPrice:'1.25',lineTotal:'1.25',discount:'0.00',department:'4',vatRate:'13.00',vatCode:'2'}]}};
 const calls=[];const tx={$queryRaw:async(parts,...args)=>{
  const sql=parts.join('?');calls.push(sql);
  if(sql.includes('to_regclass'))return[{name:'FtextCashRequest'}];
  if(sql.startsWith('UPDATE')){
   const json=args.find(v=>typeof v==='string'&&v.startsWith('{'));if(json)row.checkoutJson=JSON.parse(json);
   if(sql.includes("SET \"status\"='DISPATCHED'")){row.status='DISPATCHED';row.claimedByDeviceId=device.id;row.claimedTokenVersion=device.tokenVersion;row.dispatchedAt=new Date().toISOString();}
   return[structuredClone(row)];
  }
  if(sql.includes("'ftextVoid'"))return[];
  if(sql.includes("status\"='PREPARED'"))return row.status==='PREPARED'?[structuredClone(row)]:[];
  if(sql.includes("'ftextHandoff'"))return row.status==='DISPATCHED'&&row.checkoutJson.ftextHandoff?.state==='OFFERED'?[structuredClone(row)]:[];
  if(sql.includes('WHERE "id"='))return args[0]===row.id?[structuredClone(row)]:[];
  return[];
 }};return{row,device,settings,tx,calls};
}
test('negotiated pre-execution offer survives lost delivery; legacy dispatch still cannot be repeated',async()=>{
 for(const [method,format]of [['CASH','OPERATOR_CONFIRMATION'],['CARD','OPERATOR_CONFIRMATION'],['CARD','POS_LINE8_OS7']]){
  const f=fixture(method,format);
  const first=await pollFtextDeviceWork(f.tx,f.device,f.settings,{handoffVersion:1});assert.equal(first.request.id,f.row.id);
  // The first response is lost before any local intent/command exists.
  const retry=await pollFtextDeviceWork(f.tx,f.device,f.settings,{handoffVersion:1});
  assert.equal(retry.request?.id,f.row.id,'Negotiated offer delivery must recover before execution permission');
  assert.deepEqual(retry.request,first.request);assert.equal(first.request.handoff.version,1);
  const legacy=fixture();await pollFtextDeviceWork(legacy.tx,legacy.device,legacy.settings);
  assert.equal((await pollFtextDeviceWork(legacy.tx,legacy.device,legacy.settings,{handoffVersion:1})).request,null,'No retrospective upgrade or replay of legacy DISPATCHED');
 }
});
const handoffInput=f=>({requestId:f.row.id,settingsHash:f.row.settingsHash,nonce:f.row.checkoutJson.ftextHandoff.nonce,commandHash:f.row.checkoutJson.ftextHandoff.commandHash,readyForExecution:true});
test('one immutable authorization survives lost reply; fresh readiness still precedes publication',async()=>{
 for(const [method,format]of [['CASH','OPERATOR_CONFIRMATION'],['CARD','OPERATOR_CONFIRMATION'],['CARD','POS_LINE8_OS7']]){
  const f=fixture(method,format);await pollFtextDeviceWork(f.tx,f.device,f.settings,{handoffVersion:1});const b=handoffInput(f);
  assert.throws(()=>assertFtextHandoffResult(f.row,f.device,f.settings),e=>e.code==='FTEXT_HANDOFF_REVIEW');
  const before=structuredClone(f.row);let ack=await acceptFtextHandoff(f.tx,f.device,f.settings,{...b,readyForExecution:false});assert.equal(ack.authorization,null);assert.equal(ack.requiresReadiness,true);assert.deepEqual(f.row,before);
  f.device.metadata.ftextLastStatus.checkedAt=new Date(Date.now()-21000).toISOString();ack=await acceptFtextHandoff(f.tx,f.device,f.settings,b);assert.equal(ack.authorization,null);assert.equal(ack.requiresReadiness,true);assert.equal(f.row.checkoutJson.ftextHandoff.state,'OFFERED');
  f.device.metadata.ftextLastStatus.checkedAt=new Date().toISOString();ack=await acceptFtextHandoff(f.tx,f.device,f.settings,b);assert.ok(ack.authorization?.acceptedAt);assert.equal(ack.state,'ACCEPTED');assert.equal(ack.requiresReadiness,false);assert.doesNotThrow(()=>assertFtextHandoffResult(f.row,f.device,f.settings));
  const accepted=structuredClone(f.row);const replay=await acceptFtextHandoff(f.tx,f.device,f.settings,b);assert.deepEqual(replay.authorization,ack.authorization);assert.ok(replay.authorization?.acceptedAt);f.device.metadata.ftextLastStatus.checkedAt=new Date(Date.now()-21000).toISOString();const stale=await acceptFtextHandoff(f.tx,f.device,f.settings,b);assert.equal(stale.requiresReadiness,true);assert.deepEqual(stale.authorization,ack.authorization);assert.deepEqual(f.row,accepted,'Lost acknowledgement must not change or renew accepted evidence');
  f.device.metadata.ftextLastStatus.checkedAt=new Date().toISOString();assert.equal((await pollFtextDeviceWork(f.tx,f.device,f.settings,{handoffVersion:1})).request,null,'Accepted execution is never offered again');
 }
});
test('foreign, altered, released, final and unnegotiated handoffs cannot obtain permission or change a request',async()=>{
 const changes=[
  f=>{f.device.id='foreign'},f=>{f.device.tokenVersion++},f=>{f.settings.storeId='foreign'},f=>{f.settings.lifecycleGeneration='1'},f=>{f.settings.serialNumber='FOREIGN'},
  f=>{f.row.plan.lines[0].description='CHANGED'},f=>{f.row.claimedByDeviceId='foreign'},f=>{f.row.lifecycleGeneration='1'},f=>{f.row.status='REQUIRES_CHECK'},f=>{f.row.resultHash='b'.repeat(64)},f=>{f.row.saleId='foreign-sale'},
  f=>{f.row.checkoutJson.ftextVoid=null},f=>{f.row.checkoutJson.ftextOperatorRelease={registerReady:true}},f=>{f.row.checkoutJson.ftextCardDecision={outcome:'NO'}},f=>{f.row.checkoutJson.ftextHandoff.version=2},f=>{delete f.row.checkoutJson.ftextHandoff}
 ];
 for(const change of changes){const f=fixture();await pollFtextDeviceWork(f.tx,f.device,f.settings,{handoffVersion:1});const b=handoffInput(f);change(f);const before=structuredClone(f.row);await assert.rejects(acceptFtextHandoff(f.tx,f.device,f.settings,b));assert.deepEqual(f.row,before);}
 for(const patch of [{nonce:'370a0232-aeb7-4320-9919-d96c3f9f52d6'},{commandHash:'b'.repeat(64)},{settingsHash:'b'.repeat(64)},{readyForExecution:'true'},{arbitraryCommand:'PAY||2'}]){const f=fixture();await pollFtextDeviceWork(f.tx,f.device,f.settings,{handoffVersion:1});const before=structuredClone(f.row);await assert.rejects(acceptFtextHandoff(f.tx,f.device,f.settings,{...handoffInput(f),...patch}));assert.deepEqual(f.row,before);}
 const legacy=fixture();assert.doesNotThrow(()=>assertFtextHandoffResult(legacy.row,legacy.device,legacy.settings));
});
test('actual HTTP handoff is device authenticated and retrieves the same authorization without permitting result before acceptance',async()=>{
 const {default:express}=await import('express'),{createFtextRouter}=await import('../src/routes/ftext-v1.js');const f=fixture();
 const auth=async(token,action)=>{if(token!=='fixture-token')throw Object.assign(Error('Unauthorized'),{status:401});return action(f.tx,f.device,f.settings);};
 const service={authenticated:auth,ping:(token,_body,work)=>auth(token,async(t,d,c)=>({settings:c,settingsHash:ftextSettingsHash(c),...(work?await work(t,d,c):{})}))};
 const app=express();app.use(express.json());app.use(createFtextRouter({service,db:{},ensure:async()=>{},userAuth:()=>assert.fail('Device handoff used employee authentication')}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({code:e.code||null,error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,token='fixture-token')=>fetch(base+'/device/'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  const poll={settings:f.settings,settingsHash:ftextSettingsHash(f.settings),readinessVersion:1,recovering:false,handoffVersion:1};
  assert.equal((await post('work-poll',{...poll,handoffVersion:2})).status,400);
  let response=await post('work-poll',poll);assert.equal(response.status,200);const first=(await response.json()).request;assert.equal(first.handoff.version,1);
  response=await post('work-poll',poll);assert.deepEqual((await response.json()).request,first);
  const b=handoffInput(f);assert.equal((await post('cash-handoff-accept',b,'foreign')).status,401);
  const before=structuredClone(f.row);response=await post('cash-result',{requestId:f.row.id,settingsHash:f.row.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'});assert.equal(response.status,409);assert.deepEqual(f.row,before);
  assert.equal((await post('cash-handoff-accept',{...b,commandHash:'b'.repeat(64)})).status,409);
  response=await post('cash-handoff-accept',b);assert.equal(response.status,200);const authorization=(await response.json()).authorization;assert.ok(authorization.acceptedAt);
  response=await post('cash-handoff-accept',b);assert.equal(response.status,200);assert.deepEqual((await response.json()).authorization,authorization);
  response=await post('work-poll',poll);assert.equal((await response.json()).request,null);assert.equal(f.row.result,null);assert.equal(f.row.saleId,null);
 }finally{await new Promise(r=>server.close(r));}
});
