import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';
import {parseFtextErrorEvidence,ftextOriginalCommandHash,ftextUnknownCardError,pollFtextErrorEvidence,recordFtextErrorEvidence,ftextPaymentError} from '../src/services/ftext-error-evidence.js';
import {assertFtextVoidEligible} from '../src/services/ftext-void.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function fixture(){
 const settings={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'TEST12345',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:1,resultFormat:'OPERATOR_CONFIRMATION',confirmed:true}};
 const device={id:'device-a',tokenVersion:3},settingsHash=ftextSettingsHash(settings),id='370a0232-aeb7-4320-9919-d96c3f9f52d5';
 const result={requestId:id,settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'},resultHash=hash(JSON.stringify(result));
 const row={id,companyId:settings.companyId,storeId:settings.storeId,terminalPos:settings.terminalPos,serialNumber:settings.serialNumber,settingsHash,lifecycleGeneration:'0',claimedByDeviceId:device.id,claimedTokenVersion:device.tokenVersion,status:'REQUIRES_CHECK',saleId:null,result,resultHash,plan:{schemaVersion:'MWS_FTEXT_SALE_PLAN_V1',planHash:'a'.repeat(64),configurationId:settings.configurationId,settingsHash,scope:{companyId:settings.companyId,storeId:settings.storeId,terminalPos:settings.terminalPos,fiscalDeviceCode:settings.fiscalDeviceCode},total:'1.25',payment:{method:'CARD',code:2,amount:'1.25'},lines:[{description:'SYNTHETIC',quantity:'1.000',unitPrice:'1.25',lineTotal:'1.25',discount:'0.00',department:'4',vatRate:'13.00',vatCode:'2'}]},checkoutJson:{actorId:'cashier',paymentMethod:'CARD',ftextCardMode:'OPERATOR_CONFIRMATION',ftextCardDecision:{outcome:'NO',actorId:'cashier',resultHash,settingsHash}}};
 return {row,settings,device};
}
const bytes=await readFile(new URL('../../tools/windows-ftext/fixtures/eftpos-error-48.res',import.meta.url));
test('actual original bytes are error evidence only; incomplete/final/foreign/extra evidence refused',()=>{
 assert.deepEqual(parseFtextErrorEvidence(bytes.toString('base64'),2),{code:48,failedCommand:'PAY||2',rawResultHash:'022ddb6a253c87c3c0b15036bf9ab312b9af222a58eede98a94530b1ca57fc53'});
 for(const raw of ['', '48\r\nEFT-POS ERROR\r\nInputLine: PAY||2', '0\r\n17\r\n42\r\nTEST12345\r\ntime\r\n\r\nhttps://www1.aade.gr/receipt\r\n', '48\r\nEFT-POS ERROR\r\nInputLine: PAY||3\r\n','48\r\nEFT-POS ERROR\r\nInputLine: InputLine: PAY||2\r\n','48\r\nEFT-POS ERROR\r\nPAY||2\r\n#Visa;1.25;******1234\r\n','48\r\nEFT-POS ERROR\r\nPAY||2\r\nhttps://www1.aade.gr/receipt\r\n','48\0\r\nEFT-POS ERROR\r\nPAY||2\r\n'])assert.throws(()=>parseFtextErrorEvidence(Buffer.from(raw).toString('base64'),2));
 assert.throws(()=>parseFtextErrorEvidence(bytes.toString('base64')+'\n',2));assert.throws(()=>parseFtextErrorEvidence(Buffer.alloc(65537).toString('base64'),2));
});
test('append preserves original result, decision and pending status; exact replay and VOID binding',async()=>{
 let {row,device,settings}=fixture();const original=structuredClone(row),writes=[];
 const tx={$queryRaw:async(parts,...values)=>{const sql=parts.join('?');if(sql.startsWith('UPDATE')){writes.push(sql);row={...row,checkoutJson:JSON.parse(values[0])};return [row]}return [row]}};
 const commandHash=ftextOriginalCommandHash(row,settings);
 assert.equal(commandHash,hash('RESULT_FILENAME|C:\\FText\\mws-cash-'+row.id+'.res\r\nS|SYNTHETIC|1.000|1.25||4\r\nPAY||2\r\n'));
 assert.equal(ftextUnknownCardError(row),true);assert.throws(()=>assertFtextVoidEligible(row));
 assert.equal((await pollFtextErrorEvidence(tx,device,settings)).kind,'FTEXT_ERROR_RECHECK');
 const input={requestId:row.id,settingsHash:row.settingsHash,originalResultHash:row.resultHash,commandHash,rawResultBase64:bytes.toString('base64')};
 for(const [d,c,v] of [[{...device,id:'other'},settings,input],[{...device,tokenVersion:4},settings,input],[device,{...settings,lifecycleGeneration:'1'},input],[device,settings,{...input,originalResultHash:'b'.repeat(64)}],[device,settings,{...input,commandHash:'c'.repeat(64)}],[device,settings,{...input,qr:'https://www1.aade.gr/receipt'}]])await assert.rejects(recordFtextErrorEvidence(tx,d,c,v));
 const saved=await recordFtextErrorEvidence(tx,device,settings,input);assert.equal(writes.length,1);
 for(const key of ['result','resultHash','status','saleId'])assert.deepEqual(saved[key],original[key]);assert.deepEqual(saved.checkoutJson.ftextCardDecision,original.checkoutJson.ftextCardDecision);assert.equal(saved.checkoutJson.ftextVoid,undefined);
 assert.equal(ftextPaymentError(saved).code,48);assert.doesNotThrow(()=>assertFtextVoidEligible(saved));
 await recordFtextErrorEvidence(tx,device,settings,input);assert.equal(writes.length,1);
 await assert.rejects(recordFtextErrorEvidence(tx,device,settings,{...input,rawResultBase64:Buffer.from('44\r\nEFT-POS ERROR\r\nPAY||2\r\n').toString('base64')}));
 for(const patch of [{resultHash:'d'.repeat(64)},{claimedTokenVersion:9},{plan:{...saved.plan,planHash:'e'.repeat(64)}},{checkoutJson:{...saved.checkoutJson,ftextCardDecision:{...saved.checkoutJson.ftextCardDecision,outcome:'YES'}}},{checkoutJson:{...saved.checkoutJson,ftextLateError:{...saved.checkoutJson.ftextLateError,rawResultHash:'f'.repeat(64)}}}])assert.throws(()=>assertFtextVoidEligible({...saved,...patch}));
});
test('mounted HTTP reads and appends evidence through scoped device auth, never user auth or fiscal execution',async()=>{
 const {default:express}=await import('express'),{createFtextRouter}=await import('../src/routes/ftext-v1.js');
 let {row,settings,device}=fixture(),writes=0;
 const tx={$queryRaw:async(parts,...values)=>{const sql=parts.join('?');if(sql.includes('to_regclass'))return [{name:'fixture.FtextCashRequest'}];if(sql.startsWith('UPDATE')){writes++;row={...row,checkoutJson:JSON.parse(values[0])};return [row]}if(sql.includes("? 'ftextLateError'")&&row.checkoutJson.ftextLateError)return [];return [row]}};
 const service={authenticated:async(token,action)=>{if(token!=='fixture-device')throw Object.assign(new Error('not a device'),{status:401});return action(tx,device,settings)}};
 const app=express();app.use(express.json());app.use('/api/ftext/v1',createFtextRouter({service,db:{},ensure:async()=>{},userAuth:()=>assert.fail('device used user auth')}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/ftext/v1/device/';
 const post=(action,body={},token='fixture-device')=>fetch(base+action,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post('error-evidence-poll',{},'user-token')).status,401);
  const poll=await post('error-evidence-poll');assert.equal(poll.status,200);assert.equal(poll.headers.get('cache-control'),'no-store');assert.equal((await poll.json()).request.id,row.id);assert.equal(writes,0);
  const proof={requestId:row.id,settingsHash:row.settingsHash,originalResultHash:row.resultHash,commandHash:ftextOriginalCommandHash(row,settings),rawResultBase64:bytes.toString('base64')};
  assert.equal((await post('error-evidence-result',{...proof,execute:'VOID_DOCUMENT'})).status,400);assert.equal(writes,0);
  const response=await post('error-evidence-result',proof),saved=await response.json();assert.equal(response.status,200);assert.equal(saved.status,'REQUIRES_CHECK');assert.equal(saved.requestId,row.id);assert.match(saved.evidenceHash,/^[a-f0-9]{64}$/);assert.equal(writes,1);assert.equal(row.saleId,null);assert.equal(row.checkoutJson.ftextVoid,undefined);
  await post('error-evidence-result',proof);assert.equal(writes,1);
 }finally{await new Promise(r=>server.close(r))}
});
