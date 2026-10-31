import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';
import {ftextOriginalCommandHash} from '../src/services/ftext-error-evidence.js';
import {releaseFtextCashFirstLine,verifyFtextCashFirstLineRejection,ftextCashFirstLineReleased} from '../src/services/ftext-cash-rejection.js';
import {ftextCashRequestView} from '../src/services/ftext-cash-requests.js';
const hash=x=>createHash('sha256').update(x).digest('hex'),b64=x=>Buffer.from(x).toString('base64');
function fixture(){
 const settings={companyId:'company-a',storeId:'store-b',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',serialNumber:'TEST01',workFolder:'C:\\Test',lifecycleGeneration:'0'},device={id:'device',tokenVersion:1};
 let row={...settings,id:'request',settingsHash:ftextSettingsHash(settings),status:'REQUIRES_CHECK',saleId:null,clientTransactionId:'original',claimedByDeviceId:device.id,claimedTokenVersion:1,total:100,plan:{lines:[{description:'TEST',quantity:'1.000',unitPrice:'100.00',department:'3'}],total:'100.00',payment:{method:'CASH',code:1,amount:'100.00'}},checkoutJson:{paymentMethod:'CASH'}};
 row.result={requestId:row.id,settingsHash:row.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};row.resultHash=hash(JSON.stringify(row.result));
 const input={intentBase64:b64(JSON.stringify({requestId:row.id,settingsHash:row.settingsHash,commandHash:ftextOriginalCommandHash(row,settings)})),reportBase64:b64(JSON.stringify(row.result)),rawResultBase64:b64(' 2\r\nOVER LIMIT\r\nInputLine: S|TEST|1.000|100.00||3\r\n\r\n'),reason:'Reviewed original files',noReceipt:true};
 let writes=0,sale=false;
 const tx={$queryRaw:async(parts,...v)=>{const sql=parts.join('?');if(sql.includes('pg_advisory'))return [];if(sql.startsWith('SELECT *'))return [row];if(sql.startsWith('SELECT "id" FROM "Sale"'))return sale?[{id:'existing'}]:[];if(sql.startsWith('UPDATE "FtextCashRequest"')){writes++;row={...row,checkoutJson:JSON.parse(v[0])};return [row];}assert.fail('Unexpected financial write/query: '+sql)}};
 return {settings,device,input,tx,context:async()=>({settings,device}),get row(){return row},set row(r){row=r},get writes(){return writes},set sale(s){sale=s}};
}
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
