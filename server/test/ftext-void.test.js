import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFtextVoidEligible,validateFtextVoidResult,ftextVoidConfirmed} from '../src/services/ftext-void.js';
const row={id:'b4aec3d7-a6e0-432b-a98b-40c0e235da16',status:'REQUIRES_CHECK',serialNumber:'TEST01',settingsHash:'a'.repeat(64),resultHash:'b'.repeat(64),plan:{payment:{method:'CARD'}},checkoutJson:{paymentMethod:'CARD',ftextVoid:{id:'b4aec3d7-a6e0-432b-a98b-40c0e235da17',status:'DISPATCHED',originalResultHash:'b'.repeat(64)}},result:{outcome:'REQUIRES_CHECK',code:48,failedCommand:'PAY||2',rawResultHash:'c'.repeat(64)}};
test('VOID requires original explicit PAY error and never accepts uncertainty or issued/cash sale',()=>{
 assert.doesNotThrow(()=>assertFtextVoidEligible(row));
 for(const patch of [{status:'DISPATCHED'},{status:'CONFIRMED'},{status:'SALE_COMMITTED'},{saleId:'issued'},{plan:{payment:{method:'CASH'}}},{result:{...row.result,code:101}},{result:{...row.result,code:0}},{result:{...row.result,failedCommand:'S|item'}},{result:{...row.result,rawResultHash:null}}])assert.throws(()=>assertFtextVoidEligible({...row,...patch}));
});
test('VOID proof binds action, original request, settings and exact serial; no receipt/payment fields allowed',()=>{
 const proof={requestId:row.checkoutJson.ftextVoid.id,originalRequestId:row.id,settingsHash:row.settingsHash,outcome:'VOID_CONFIRMED',code:0,serialNumber:'TEST01',dayId:'10',dayCounter:'27',deviceTime:'fixture',rawResultHash:'d'.repeat(64)};
 assert.deepEqual(validateFtextVoidResult(proof,row),proof);
 for(const patch of [{requestId:row.id},{originalRequestId:proof.requestId},{settingsHash:'e'.repeat(64)},{code:48},{serialNumber:'OTHER'},{dayCounter:undefined},{qr:'https://www1.aade.gr/receipt'},{posPayments:[]}])assert.throws(()=>validateFtextVoidResult({...proof,...patch},row));
 assert.equal(ftextVoidConfirmed(row),false);assert.equal(ftextVoidConfirmed({...row,checkoutJson:{ftextVoid:{status:'CONFIRMED'}}}),true);assert.equal(ftextVoidConfirmed({...row,status:'CONFIRMED',checkoutJson:{ftextVoid:{status:'CONFIRMED'}}}),false);
});
