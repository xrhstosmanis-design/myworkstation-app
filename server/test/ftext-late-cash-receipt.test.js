import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyLateCashFiles,effectiveFtextCashReceipt,recordLateCashReceipt} from '../src/services/ftext-late-cash-receipt.js';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';
import {ftextOriginalCommandHash} from '../src/services/ftext-error-evidence.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const settings={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'SYNTHETIC01',workFolder:'C:\\Synthetic',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}]};
const id='370a0232-aeb7-4320-9919-d96c3f9f52d5',settingsHash=ftextSettingsHash(settings);
const report={requestId:id,settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};
const row={id,settingsHash,serialNumber:settings.serialNumber,lifecycleGeneration:'0',status:'REQUIRES_CHECK',saleId:null,result:report,resultHash:hash(JSON.stringify(report)),claimedByDeviceId:'device-a',claimedTokenVersion:3,total:1.25,plan:{lines:[{description:'SYNTHETIC',quantity:'1.000',unitPrice:'1.25',department:'4'}],total:'1.25',payment:{code:1,method:'CASH',amount:'1.25'}},checkoutJson:{paymentMethod:'CASH'}};
const b64=x=>Buffer.from(x).toString('base64');
const raw='0\r\n17\r\n42\r\nSYNTHETIC01\r\n30/10/2026 19:32\r\n0\r\nhttps://www1.aade.gr/tameiakes/myweb/q1.php?SIG=SYNTHETIC01ABC26103019321.25\r\n\r\n671\r\n\r\n';
const input={intentBase64:b64(JSON.stringify({commandHash:ftextOriginalCommandHash(row,settings),requestId:id,settingsHash})),reportBase64:b64(JSON.stringify(report)),rawResultBase64:b64(raw),reason:'Owner verified printed existing receipt'};
test('late CASH verifies all original files and final fiscal evidence, without accepting status/error/card/foreign/amount changes',()=>{
 const verified=verifyLateCashFiles(row,settings,input);assert.equal(verified.result.dayCounter,'42');assert.equal(verified.result.rawResultHash,hash(Buffer.from(raw)));
 for(const changed of [raw.replace('SYNTHETIC01\r','FOREIGN\r'),raw.replace('19321.25','19321.26'),raw.replace('0\r\n17','48\r\n17'),raw.replace('www1.aade.gr','www1.aade.gr.evil.invalid'),raw.replace('\r\n\r\n671','\r\n#VISA;1.25;1234******5678\r\n671'),raw.slice(0,-4)])assert.throws(()=>verifyLateCashFiles(row,settings,{...input,rawResultBase64:b64(changed)}));
 for(const patch of [{reportBase64:b64(JSON.stringify({...report,description:'changed'}))},{intentBase64:b64(JSON.stringify({commandHash:'a'.repeat(64),requestId:id,settingsHash}))},{rawResultBase64:input.rawResultBase64+'='}])assert.throws(()=>verifyLateCashFiles(row,settings,{...input,...patch}));
 for(const patch of [{serialNumber:'foreign'},{settingsHash:'b'.repeat(64)},{lifecycleGeneration:'1'},{checkoutJson:{paymentMethod:'CARD'}},{checkoutJson:{paymentMethod:'CASH',ftextVoid:{status:'PREPARED'}}},{checkoutJson:{paymentMethod:'CASH',ftextOperatorRelease:{registerReady:true}}}])assert.throws(()=>verifyLateCashFiles({...row,...patch},settings,input));
});
test('late CASH append is scoped and replayable; immutable original result retained and no business writers available',async()=>{
 let saved=structuredClone(row),writes=0;
 const tx={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('pg_advisory'))return [];if(sql.startsWith('SELECT *'))return values[1]===settings.companyId&&values[2]===settings.storeId&&values[3]===settings.terminalPos?[saved]:[];if(sql.startsWith('SELECT "id"'))return [];if(sql.startsWith('UPDATE')){writes++;saved={...saved,status:'CONFIRMED',checkoutJson:JSON.parse(values[0])};return [saved];}assert.fail(sql);}};
 const context=async()=>({settings,device:{id:'device-a',tokenVersion:3}}),append=(scope=settings,current=context)=>recordLateCashReceipt(tx,scope,id,'admin',input,{context:current});
 await assert.rejects(append({...settings,storeId:'foreign'}));await assert.rejects(append(settings,async()=>({settings,device:{id:'foreign',tokenVersion:3}})));assert.equal(writes,0);
 const result=await append();assert.deepEqual(result.result,row.result);assert.equal(result.resultHash,row.resultHash);assert.equal(effectiveFtextCashReceipt(result,settings).outcome,'CONFIRMED');
 saved.checkoutJson.ftextLateCashReceipt.result=Object.fromEntries(Object.entries(saved.checkoutJson.ftextLateCashReceipt.result).reverse());assert.equal(effectiveFtextCashReceipt(saved,settings).dayCounter,'42','JSONB key order is immaterial');
 await append();assert.equal(writes,1);saved.checkoutJson.ftextLateCashReceipt.result.dayCounter='43';assert.throws(()=>effectiveFtextCashReceipt(saved,settings));
});
