import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFtextSimpleCash,validateFtextCashResult} from '../src/services/ftext-cash-requests.js';
import {ftextSettingsHash,ftextSettingsInput} from '../src/services/ftext-installation.js';
const row={id:'370a0232-aeb7-4320-9919-d96c3f9f52d5',settingsHash:'a'.repeat(64),serialNumber:'SYNTHETIC01'};
const good=()=>({requestId:row.id,settingsHash:row.settingsHash,outcome:'CONFIRMED',code:0,serialNumber:row.serialNumber,dayId:'17',dayCounter:'42',deviceTime:'fixture time',qr:'https://www1.aade.gr/dcl/fixture',rawResultHash:'b'.repeat(64)});
test('cash receipt requires final fiscal evidence; STATUS and arbitrary URL never confirm',()=>{
 assert.equal(validateFtextCashResult(good(),row).outcome,'CONFIRMED');
 for(const [key,value]of [['requestId','75a4261f-bbaf-4b2a-aedf-ae2edbeec7d8'],['settingsHash','c'.repeat(64)],['code',101],['serialNumber','FOREIGN'],['dayCounter','0'],['dayCounter','x'],['qr',undefined],['qr','https://aade.gr.evil.invalid/'],['qr','http://aade.gr/'],['qr','https://user:pass@aade.gr/'],['rawResultHash',undefined],['deviceTime','']])assert.throws(()=>validateFtextCashResult({...good(),[key]:value},row),key);
 assert.equal(validateFtextCashResult({requestId:row.id,settingsHash:row.settingsHash,outcome:'REQUIRES_CHECK'},row).outcome,'REQUIRES_CHECK');
 assert.throws(()=>validateFtextCashResult({...good(),fiscalExecution:false},row));
});
test('cash first slice refuses mixed/card/customer/online/table/promotion/fractional and discounted sales',()=>{
 const checkout={paymentMethod:'CASH'},items=[{quantity:1,discount:0}];assert.doesNotThrow(()=>assertFtextSimpleCash(checkout,items));
 for(const patch of [{paymentMethod:'CARD'},{payments:[{method:'CASH',amount:1}]},{customerId:'customer'},{onlineOrderId:'order'},{tableOrderId:'table'},{redeemPoints:1},{operationChannel:'DELIVERY_DELAYED'},{audience:'STAFF'}])assert.throws(()=>assertFtextSimpleCash({...checkout,...patch},items));
 for(const patch of [{quantity:.5},{quantity:0},{discount:.01},{promotionId:'promotion'},{promotionType:'GIFT'}])assert.throws(()=>assertFtextSimpleCash(checkout,[{...items[0],...patch}]));
});
test('cash settings are explicitly confirmed; optional extension preserves legacy installation hash',()=>{
 const base={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'SYNTHETIC01',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0'};
 assert.equal(ftextSettingsHash(base),ftextSettingsHash({...base,cashEnabled:undefined,cashDepartments:undefined}));
 const input={terminalPos:'POS-01',serialNumber:'SYNTHETIC01',workFolder:'C:\\FText',confirmed:true,cashEnabled:true,cashDepartments:[{department:1,vatRate:0,vatCode:'5'},{department:3,vatRate:0,vatCode:'5'},{department:4,vatRate:13,vatCode:'2'},{department:5,vatRate:24,vatCode:'3'},{department:7,vatRate:24,vatCode:'3'}]};
 assert.equal(ftextSettingsInput.parse(input).cashDepartments.length,5);
 assert.notEqual(ftextSettingsHash(base),ftextSettingsHash({...base,cashEnabled:true,cashDepartments:input.cashDepartments}));
 for(const cashDepartments of [[],[input.cashDepartments[0],input.cashDepartments[0]],[{department:201,vatRate:24,vatCode:'3'}]])assert.throws(()=>ftextSettingsInput.parse({...input,cashDepartments}));
});

test('cash runtime cannot create an unreviewed relation or weaken the canonical recovery manifest',async()=>{
 const {assertFtextCashLifecycleApproved,ensureFtextCashSchema,ftextCashLifecycleReviewProposal}=await import('../src/services/ftext-cash-schema.js');
 assert.throws(()=>assertFtextCashLifecycleApproved(),e=>e.code==='FTEXT_CASH_RECOVERY_REVIEW_REQUIRED');
 let writes=0;await assert.rejects(ensureFtextCashSchema({$executeRawUnsafe:async()=>{writes++}}),e=>e.code==='FTEXT_CASH_RECOVERY_REVIEW_REQUIRED');assert.equal(writes,0);
 const proposal=ftextCashLifecycleReviewProposal();assert.doesNotThrow(()=>assertFtextCashLifecycleApproved(proposal));
 for(const mutate of [m=>m.knownTables=[],m=>m.knownColumns.FtextCashRequest[0][1]='uuid',m=>m.tables[0].reset='KEEP',m=>m.reviewedColumns=[]]){const changed=structuredClone(proposal);mutate(changed);assert.throws(()=>assertFtextCashLifecycleApproved(changed));}
});
