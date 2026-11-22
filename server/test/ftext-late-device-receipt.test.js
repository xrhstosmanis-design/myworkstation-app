import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';
import {ftextOriginalCommandHash} from '../src/services/ftext-error-evidence.js';
import {recordFtextLateDeviceReceipt,pollFtextLateReceipt} from '../src/services/ftext-late-device-receipt.js';
import {verifyLateCashFiles,effectiveFtextCashReceipt} from '../src/services/ftext-late-cash-receipt.js';
import {recordFtextOperatorDecision,assertFtextOperatorCardApproved,ftextOperatorDecisionRequired} from '../src/services/ftext-operator-card.js';
const hash=x=>createHash('sha256').update(x).digest('hex'),encode=x=>Buffer.from(x).toString('base64');
function fixture(method='CASH',format='OPERATOR_CONFIRMATION'){
 const settings={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'SYNTHETIC01',workFolder:'C:\\Synthetic',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:1,resultFormat:format,confirmed:true}};
 const device={id:'device-a',tokenVersion:3},id='370a0232-aeb7-4320-9919-d96c3f9f52d5',settingsHash=ftextSettingsHash(settings);
 const result={requestId:id,settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};
 let row={...settings,id,settingsHash,status:'REQUIRES_CHECK',saleId:null,result,resultHash:hash(JSON.stringify(result)),claimedByDeviceId:device.id,claimedTokenVersion:3,total:1.25,plan:{scope:settings,lines:[{description:'SYNTHETIC',quantity:'1.000',unitPrice:'1.25',department:'4'}],total:'1.25',payment:{code:method==='CASH'?1:2,method,amount:'1.25'}},checkoutJson:{actorId:'cashier',paymentMethod:method,...(method==='CARD'?{ftextCardMode:format,ftextCardDecision:null}:{})}};
 const raw='0\r\n17\r\n42\r\nSYNTHETIC01\r\n31/10/2026 09:32\r\n0\r\nhttps://www1.aade.gr/tameiakes/myweb/q1.php?SIG=SYNTHETIC01ABC26103109321.25\r\n'+(format==='POS_LINE8_OS7'&&method==='CARD'?'#Visa Debit;1.25;416598******5605':'')+'\r\n671\r\n';
 const input={requestId:id,settingsHash,originalResultHash:row.resultHash,intentBase64:encode(JSON.stringify({commandHash:ftextOriginalCommandHash(row,settings),requestId:id,settingsHash})),reportBase64:encode(JSON.stringify(result)),rawResultBase64:encode(raw)};
 let writes=0;
 const tx={$queryRaw:async(parts,...v)=>{const sql=parts.join('?');if(sql.includes('to_regclass'))return [{name:'fixture.FtextCashRequest'}];if(sql.includes('pg_advisory'))return [];if(sql.startsWith('SELECT "id"'))return [];if(sql.startsWith('SELECT *'))return [row];if(sql.startsWith('UPDATE')){writes++;row={...row,checkoutJson:JSON.parse(v[0]),...(sql.includes("\"status\"='CONFIRMED'")?{status:'CONFIRMED'}:{})};return [row];}assert.fail(sql);}};
 return {settings,device,input,tx,get row(){return row},get writes(){return writes},setRow:r=>{row=r}};
}
test('late device proof accepts CASH and both supported CARD formats; original evidence immutable and same replay writes once',async()=>{
 for(const [method,format] of [['CASH','OPERATOR_CONFIRMATION'],['CARD','OPERATOR_CONFIRMATION'],['CARD','POS_LINE8_OS7']]){
  const f=fixture(method,format),original=structuredClone(f.row);
  assert.equal((await pollFtextLateReceipt(f.tx,f.device,f.settings)).id,f.row.id);assert.equal(f.writes,0);
  const saved=await recordFtextLateDeviceReceipt(f.tx,f.device,f.settings,f.input);
  assert.equal(saved.status,'CONFIRMED');assert.deepEqual(saved.result,original.result);assert.equal(saved.resultHash,original.resultHash);assert.equal(saved.saleId,null);
  assert.equal(saved.checkoutJson.ftextLateCashReceipt.source,'DEVICE');assert.equal(saved.checkoutJson.ftextLateCashReceipt.actorId,'device:device-a');
  assert.equal(effectiveFtextCashReceipt(saved,f.settings).outcome,'CONFIRMED');
  const proof=saved.checkoutJson.ftextLateCashReceipt,before=structuredClone(proof.result);
  proof.result=Object.fromEntries(Object.entries(before).reverse());
  if(proof.result.posPayments)proof.result.posPayments=proof.result.posPayments.map(p=>Object.fromEntries(Object.entries(p).reverse()));
  assert.deepEqual(effectiveFtextCashReceipt(saved,f.settings),before);
  await recordFtextLateDeviceReceipt(f.tx,f.device,f.settings,f.input);assert.equal(f.writes,1);
  proof.deviceId='foreign';assert.throws(()=>effectiveFtextCashReceipt(saved,f.settings));
 }
});
test('operator CARD late receipt still requires original-cashier YES, bound to the immutable original result',async()=>{
 const f=fixture('CARD');await recordFtextLateDeviceReceipt(f.tx,f.device,f.settings,f.input);
 assert.equal(ftextOperatorDecisionRequired(f.row),true);assert.throws(()=>assertFtextOperatorCardApproved(f.row,f.settings));
 const context=async()=>({device:f.device,settings:f.settings});
 await assert.rejects(recordFtextOperatorDecision(f.tx,f.row.id,f.settings,'foreign',{outcome:'YES'},{context}));
 const yes=await recordFtextOperatorDecision(f.tx,f.row.id,f.settings,'cashier',{outcome:'YES'},{context});
 assert.equal(yes.checkoutJson.ftextCardDecision.resultHash,f.input.originalResultHash);assert.equal(yes.result.outcome,'REQUIRES_CHECK');assert.doesNotThrow(()=>assertFtextOperatorCardApproved(yes,f.settings));
});
test('foreign device/token, altered originals, released/NO/VOID and manual CARD upload never append a late receipt',async()=>{
 for(const mutate of [f=>({...f.row,claimedByDeviceId:'foreign'}),f=>({...f.row,claimedTokenVersion:4}),f=>({...f.row,lifecycleGeneration:'1'}),f=>({...f.row,checkoutJson:{...f.row.checkoutJson,ftextOperatorRelease:{registerReady:true}}}),f=>({...f.row,checkoutJson:{...f.row.checkoutJson,ftextVoid:{status:'PREPARED'}}}),f=>({...f.row,checkoutJson:{...f.row.checkoutJson,ftextCardDecision:{outcome:'NO'}}})]){
  const f=fixture('CARD');f.setRow(mutate(f));assert.equal(await pollFtextLateReceipt(f.tx,f.device,f.settings),null);await assert.rejects(recordFtextLateDeviceReceipt(f.tx,f.device,f.settings,f.input));assert.equal(f.writes,0);
 }
 const f=fixture('CARD');await assert.rejects(recordFtextLateDeviceReceipt(f.tx,f.device,f.settings,{...f.input,rawResultBase64:encode('48\r\nERROR\r\nPAY||2\r\n')}));
 assert.throws(()=>verifyLateCashFiles(f.row,f.settings,{intentBase64:f.input.intentBase64,reportBase64:f.input.reportBase64,rawResultBase64:f.input.rawResultBase64,reason:'Manual CASH form cannot recover CARD'}));assert.equal(f.writes,0);
});
test('actual device HTTP requires device authentication, keeps proof durable when finalization is pending and rejects arbitrary actions',async()=>{
 const {default:express}=await import('express'),{createFtextRouter}=await import('../src/routes/ftext-v1.js');
 const f=fixture(),service={authenticated:async(token,action)=>{if(token!=='fixture-device')throw Object.assign(new Error('not a device'),{status:401});return action(f.tx,f.device,f.settings);}};
 const app=express();app.use(express.json());app.use('/api/ftext/v1',createFtextRouter({service,db:{$transaction:async()=>{throw Error('Original shift unavailable')}},ensure:async()=>{},userAuth:()=>assert.fail('Device endpoint must not use employee authentication')}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=(action,body={},token='fixture-device')=>fetch('http://127.0.0.1:'+server.address().port+'/api/ftext/v1/device/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
 try{
  assert.equal((await post('late-receipt-poll',{},'employee-token')).status,401);
  const poll=await post('late-receipt-poll');assert.equal(poll.status,200);assert.equal(poll.headers.get('cache-control'),'no-store');assert.equal((await poll.json()).request.kind,'FTEXT_LATE_RECEIPT_RECHECK');assert.equal(f.writes,0);
  assert.equal((await post('late-receipt-result',{...f.input,execute:'PAY'})).status,400);assert.equal(f.writes,0);
  const response=await post('late-receipt-result',f.input),body=await response.json();assert.equal(response.status,200);assert.equal(body.status,'CONFIRMED');assert.equal(body.finalizationPending,true);assert.equal(body.allowResend,false);assert.equal(f.row.saleId,null);assert.equal(f.writes,1);
  await post('late-receipt-result',f.input);assert.equal(f.writes,1);
 }finally{await new Promise(r=>server.close(r));}
});
