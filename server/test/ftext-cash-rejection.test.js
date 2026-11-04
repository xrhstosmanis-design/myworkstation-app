import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';
import {ftextOriginalCommandHash} from '../src/services/ftext-error-evidence.js';
import {releaseFtextCashFirstLine,verifyFtextCashFirstLineRejection,ftextCashFirstLineReleased} from '../src/services/ftext-cash-rejection.js';
import {ftextCashRequestView,validateFtextCashResult} from '../src/services/ftext-cash-requests.js';
import {verifyFtextOriginalUnknownFiles} from '../src/services/ftext-late-cash-receipt.js';
const hash=x=>createHash('sha256').update(x).digest('hex'),b64=x=>Buffer.from(x).toString('base64');
function fixture(){
 const settings={companyId:'company-a',storeId:'store-b',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',serialNumber:'TEST01',workFolder:'C:\\Test',lifecycleGeneration:'0'},device={id:'device',tokenVersion:1};
 let row={...settings,id:'11111111-1111-4111-8111-111111111111',settingsHash:ftextSettingsHash(settings),status:'REQUIRES_CHECK',saleId:null,clientTransactionId:'original',claimedByDeviceId:device.id,claimedTokenVersion:1,total:100,plan:{lines:[{description:'TEST',quantity:'1.000',unitPrice:'100.00',department:'3'}],total:'100.00',payment:{method:'CASH',code:1,amount:'100.00'}},checkoutJson:{paymentMethod:'CASH'}};
 row.result={requestId:row.id,settingsHash:row.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};row.resultHash=hash(JSON.stringify(row.result));
 const input={intentBase64:b64(JSON.stringify({requestId:row.id,settingsHash:row.settingsHash,commandHash:ftextOriginalCommandHash(row,settings)})),reportBase64:b64(JSON.stringify(row.result)),rawResultBase64:b64(' 2\r\nOVER LIMIT\r\nInputLine: S|TEST|1.000|100.00||3\r\n\r\n'),reason:'Reviewed original files',noReceipt:true};
 let writes=0,sale=false;
 const tx={$queryRaw:async(parts,...v)=>{const sql=parts.join('?');if(sql.includes('pg_advisory'))return [];if(sql.startsWith('SELECT *'))return [row];if(sql.startsWith('SELECT "id" FROM "Sale"'))return sale?[{id:'existing'}]:[];if(sql.startsWith('UPDATE "FtextCashRequest"')){writes++;row={...row,checkoutJson:JSON.parse(v[0])};return [row];}assert.fail('Unexpected financial write/query: '+sql)}};
 return {settings,device,input,tx,context:async()=>({settings,device}),get row(){return row},set row(r){row=r},get writes(){return writes},set sale(s){sale=s}};
}
function connectorReport(f,patch={}){
 f.row.result={...f.row.result,rawResultHash:hash(Buffer.from(f.input.rawResultBase64,'base64')),code:2,...patch};
 const original=JSON.stringify(f.row.result);let validated;try{validated=validateFtextCashResult(f.row.result,f.row)}catch{validated=f.row.result}f.row.resultHash=hash(JSON.stringify(validated));f.input.reportBase64=b64(original);
}
test('six-field connector rejection releases once with original report/raw digests and survives JSONB key order',async()=>{
 const f=fixture();connectorReport(f);const original=structuredClone(f.row);
 assert.throws(()=>verifyFtextOriginalUnknownFiles(f.row,f.settings,{intentBase64:f.input.intentBase64,reportBase64:f.input.reportBase64,rawResultBase64:f.input.rawResultBase64,reason:f.input.reason}));
 f.row.result=Object.fromEntries(Object.entries(f.row.result).reverse());
 const result=await releaseFtextCashFirstLine(f.tx,f.settings,f.row.id,'admin',f.input,{context:f.context});
 assert.equal(ftextCashFirstLineReleased(result),true);assert.deepEqual(result.result,original.result);assert.equal(result.resultHash,original.resultHash);assert.equal(result.status,original.status);assert.equal(result.saleId,null);
 await releaseFtextCashFirstLine(f.tx,f.settings,f.row.id,'admin',f.input,{context:f.context});assert.equal(f.writes,1);
});
test('six-field rejection refuses altered raw/report, code, schema, stored value and intent without writes',async()=>{
 const mutations=[f=>{f.input.rawResultBase64=b64(Buffer.from(f.input.rawResultBase64,'base64').toString()+'\r\n')},f=>{const r=JSON.parse(Buffer.from(f.input.reportBase64,'base64'));r.description='altered';f.input.reportBase64=b64(JSON.stringify(r))},f=>connectorReport(f,{code:'2'}),f=>connectorReport(f,{code:101}),f=>connectorReport(f,{rawResultHash:'a'.repeat(64)}),f=>connectorReport(f,{rawResultHash:'A'.repeat(64)}),f=>connectorReport(f,{extra:true}),f=>{delete f.row.result.code;const s=JSON.stringify(f.row.result);f.row.resultHash=hash(s);f.input.reportBase64=b64(s)},f=>{f.row.result.code=3},f=>{delete f.row.result.rawResultHash},f=>{const x=JSON.parse(Buffer.from(f.input.intentBase64,'base64'));x.commandHash='a'.repeat(64);f.input.intentBase64=b64(JSON.stringify(x))},f=>{f.row.plan.payment.method='CARD'}];
 for(const mutate of mutations){const f=fixture();connectorReport(f);mutate(f);await assert.rejects(releaseFtextCashFirstLine(f.tx,f.settings,f.row.id,'admin',f.input,{context:f.context}));assert.equal(f.writes,0);}
});
test('verified first/only CASH S rejection releases app lock once, preserves immutable result/status and never posts business records',async()=>{
 const f=fixture(),before=structuredClone(f.row);
 const released=await releaseFtextCashFirstLine(f.tx,f.settings,f.row.id,'admin',f.input,{context:f.context});
 assert.equal(ftextCashFirstLineReleased(released),true);assert.equal(ftextCashRequestView(released).operatorReleaseMode,'RELEASED');
 assert.deepEqual(released.result,before.result);assert.equal(released.resultHash,before.resultHash);assert.equal(released.status,before.status);assert.equal(released.saleId,null);
 assert.equal(released.checkoutJson.ftextOperatorRelease.readinessVerified,false);
 await releaseFtextCashFirstLine(f.tx,f.settings,f.row.id,'admin',f.input,{context:f.context});assert.equal(f.writes,1);
 await assert.rejects(releaseFtextCashFirstLine(f.tx,f.settings,f.row.id,'admin',{...f.input,rawResultBase64:b64('2\r\nOVER LIMIT\r\nInputLine: PAY||1\r\n')},{context:f.context}));assert.equal(f.writes,1);
});
test('timeouts, PAY, second line, different error/price, final receipt, missing ack, foreign settings/device and existing sale never release',async()=>{
 for(const raw of ['2\r\nOVER LIMIT\r\nInputLine: PAY||1\r\n','2\r\nOVER LIMIT\r\nInputLine: S|TEST|1.000|99.00||3\r\n','48\r\nOVER LIMIT\r\nInputLine: S|TEST|1.000|100.00||3\r\n','2\r\nOVER LIMIT\r\nInputLine: S|TEST|1.000|100.00||3\r\nPAY||1\r\n','0\r\nreceipt\r\n']){const f=fixture();assert.throws(()=>verifyFtextCashFirstLineRejection(f.row,f.settings,{...f.input,rawResultBase64:b64(raw)}));}
 for(const mutate of [f=>{f.row={...f.row,saleId:'sale'}},f=>{f.row.plan.lines.push({...f.row.plan.lines[0]})},f=>{f.row.checkoutJson.ftextVoid={status:'PREPARED'}},f=>{f.row.checkoutJson.ftextLateCashReceipt={}},f=>{f.row.claimedByDeviceId='foreign'},f=>{f.row.settingsHash='foreign'},f=>{f.sale=true},f=>{f.input.noReceipt=false},f=>{f.row.checkoutJson.ftextOperatorRelease={registerReady:true}},f=>{f.row.plan.payment.method='CARD'}]){const f=fixture();mutate(f);await assert.rejects(releaseFtextCashFirstLine(f.tx,f.settings,f.row.id,'admin',f.input,{context:f.context}));assert.equal(f.writes,0);}
});
