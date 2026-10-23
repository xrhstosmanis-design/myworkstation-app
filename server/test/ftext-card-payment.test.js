import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFtextCardPayment} from '../src/services/ftext-card-payment.js';
import {validateFtextCashResult,prepareFtextCashRequest,ftextCashRequestView} from '../src/services/ftext-cash-requests.js';
import {ftextSettingsInput,ftextSettingsHash} from '../src/services/ftext-installation.js';
const good={cardType:'Visa Debit',amount:'1.25',cardNumberMasked:'416598******5605'};
const profile={code:2,posTerminalId:1,transactionType:6,resultFormat:'POS_LINE8_OS7',confirmed:true};
test('one exact full-amount masked-card evidence; no mixed, IRIS, PAN, malformed amount or extra data',()=>{
 assert.deepEqual(validateFtextCardPayment([good],'1.25'),good);
 for(const rows of [undefined,[],[good,good],...[{amount:'1.24'},{amount:'1.250'},{amount:'1e0'},{amount:'-1.25'},{cardType:'IRIS'},{cardType:'4165981234565605'},{cardType:'Visa;foo'},{cardType:' Visa'},{cardNumberMasked:'4165981234565605'},{cardNumberMasked:'****************'},{secret:'ignored'}].map(p=>[{...good,...p}])])assert.throws(()=>validateFtextCardPayment(rows,'1.25'));
});
test('card evidence remains bound to the original method, request and final fiscal receipt',()=>{
 const row={id:'370a0232-aeb7-4320-9919-d96c3f9f52d5',settingsHash:'a'.repeat(64),serialNumber:'SYNTHETIC01',total:1.25,plan:{payment:{method:'CARD',amount:'1.25'}},checkoutJson:{paymentMethod:'CARD'}};
 const result={requestId:row.id,settingsHash:row.settingsHash,outcome:'CONFIRMED',code:0,serialNumber:row.serialNumber,dayId:'17',dayCounter:'42',deviceTime:'fixture',qr:'https://www1.aade.gr/dcl/fixture',rawResultHash:'b'.repeat(64),posPayments:[good]};
 assert.equal(validateFtextCashResult(result,row).outcome,'CONFIRMED');
 for(const patch of [{posPayments:undefined},{code:48},{qr:undefined},{serialNumber:'FOREIGN'},{settingsHash:'c'.repeat(64)},{outcome:'REQUIRES_CHECK'}])assert.throws(()=>validateFtextCashResult({...result,...patch},row));
 assert.throws(()=>validateFtextCashResult(result,{...row,checkoutJson:{paymentMethod:'CASH'}}));
 assert.throws(()=>validateFtextCashResult(result,{...row,plan:{payment:{method:'CASH'}}}));
 assert.equal(ftextCashRequestView({...row,total:1.25}).paymentMethod,'CARD');
});
test('card activation requires explicit reviewed profile and changes binding; legacy hash stays compatible',async()=>{
 const input={terminalPos:'POS-01',serialNumber:'SYNTHETIC01',workFolder:'C:\\FText',confirmed:true,cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}]};
 assert.equal(ftextSettingsInput.parse({...input,cardEnabled:true,cardPayment:profile}).cardPayment.code,2);
 for(const patch of [{cashEnabled:false},{cardPayment:undefined},{cardPayment:{...profile,confirmed:false}},{cardPayment:{...profile,code:1}},{cardPayment:{...profile,posTerminalId:0}},{cardPayment:{...profile,transactionType:7}},{cardPayment:{...profile,resultFormat:'UNKNOWN'}}])assert.throws(()=>ftextSettingsInput.parse({...input,cardEnabled:true,cardPayment:profile,...patch}));
 const base={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'SYNTHETIC01',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0'};
 assert.equal(ftextSettingsHash(base),ftextSettingsHash({...base,cardEnabled:undefined,cardPayment:undefined}));
 assert.notEqual(ftextSettingsHash(base),ftextSettingsHash({...base,cardEnabled:true,cardPayment:profile}));
 let calls=0;await assert.rejects(prepareFtextCashRequest({$queryRaw:()=>{calls++}},{settings:{cashEnabled:true},checkout:{paymentMethod:'CARD'},items:[{quantity:1}]}),e=>e.code==='FTEXT_CARD_DISABLED');assert.equal(calls,0);
});
