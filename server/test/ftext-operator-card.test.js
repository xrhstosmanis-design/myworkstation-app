import test from 'node:test';
import assert from 'node:assert/strict';
import {ftextSettingsInput,ftextSettingsHash} from '../src/services/ftext-installation.js';
import {validateFtextCashResult,ftextCashRequestView} from '../src/services/ftext-cash-requests.js';
import {assertFtextOperatorCardApproved,recordFtextOperatorDecision,releaseFtextRejectedAttempt,ftextOperatorReleaseMode} from '../src/services/ftext-operator-card.js';
import {createHash} from 'node:crypto';
const settings={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01',serialNumber:'SYNTHETIC',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:1,resultFormat:'OPERATOR_CONFIRMATION',confirmed:true}};
const row={id:'370a0232-aeb7-4320-9919-d96c3f9f52d5',settingsHash:ftextSettingsHash(settings),serialNumber:settings.serialNumber,lifecycleGeneration:'0',status:'CONFIRMED',total:1.25,plan:{payment:{method:'CARD',amount:'1.25',code:2}},checkoutJson:{paymentMethod:'CARD',ftextCardMode:'OPERATOR_CONFIRMATION',actorId:'cashier'},resultHash:'f'.repeat(64)};
const result={requestId:row.id,settingsHash:row.settingsHash,outcome:'CONFIRMED',code:0,serialNumber:row.serialNumber,dayId:'17',dayCounter:'42',deviceTime:'fixture',qr:'https://www1.aade.gr/dcl/fixture',rawResultHash:'b'.repeat(64)};
row.result=result;
test('explicit operator profile accepts legacy final receipt but never relaxes strict OS7 or fiscal proof',()=>{
 assert.equal(ftextSettingsInput.parse({terminalPos:settings.terminalPos,serialNumber:settings.serialNumber,workFolder:settings.workFolder,confirmed:true,cashEnabled:true,cashDepartments:settings.cashDepartments,cardEnabled:true,cardPayment:settings.cardPayment}).cardPayment.resultFormat,'OPERATOR_CONFIRMATION');
 assert.equal(validateFtextCashResult(result,row).outcome,'CONFIRMED');
 assert.throws(()=>validateFtextCashResult(result,{...row,checkoutJson:{paymentMethod:'CARD'}}));
 for(const patch of [{code:48},{serialNumber:'FOREIGN'},{qr:undefined},{rawResultHash:undefined},{posPayments:[]}])assert.throws(()=>validateFtextCashResult({...result,...patch},row));
 assert.equal(ftextCashRequestView(row).operatorConfirmationRequired,true);
 assert.throws(()=>assertFtextOperatorCardApproved(row,settings));
});
test('operator releases only their rejected payment error without sending a fiscal command',async()=>{
 let saved={...structuredClone(row),status:'REQUIRES_CHECK',result:{outcome:'REQUIRES_CHECK',code:48,failedCommand:'PAY||2',rawResultHash:'a'.repeat(64)},checkoutJson:{...row.checkoutJson,ftextCardDecision:{outcome:'NO',actorId:'cashier',resultHash:row.resultHash,settingsHash:row.settingsHash}}},writes=0;
 const tx={$queryRaw:async(parts,...values)=>{if(parts.join('?').startsWith('SELECT'))return values[1]===settings.companyId&&values[2]===settings.storeId&&values[3]===settings.terminalPos?[saved]:[];writes++;saved={...saved,checkoutJson:JSON.parse(values[0])};return [saved]}};
 await assert.rejects(releaseFtextRejectedAttempt(tx,row.id,settings,'other',{registerReady:true}));
 await assert.rejects(releaseFtextRejectedAttempt(tx,row.id,settings,'cashier',{registerReady:false}));
 const original=structuredClone(saved);saved.result={outcome:'REQUIRES_CHECK'};await assert.rejects(releaseFtextRejectedAttempt(tx,row.id,settings,'cashier',{registerReady:true}));saved=original;
 await releaseFtextRejectedAttempt(tx,row.id,settings,'cashier',{registerReady:true});assert.equal(saved.checkoutJson.ftextOperatorRelease.registerReady,true);assert.equal(saved.status,'REQUIRES_CHECK');assert.deepEqual(saved.result,original.result);assert.equal(writes,1);
 await releaseFtextRejectedAttempt(tx,row.id,settings,'cashier',{registerReady:true});assert.equal(writes,1);
});
test('only original cashier can decide after response, immutable decisions bind settings/result; NO cannot finalize',async()=>{
 let saved=structuredClone(row),writes=0;
 const tx={$queryRaw:async(parts,...values)=>{const sql=parts.join('?');if(sql.startsWith('SELECT'))return values[1]===settings.companyId&&values[2]===settings.storeId&&values[3]===settings.terminalPos?[saved]:[];writes++;saved={...saved,checkoutJson:JSON.parse(values[0])};return [saved]}};
 const scope=settings,context=async()=>({settings});
 await assert.rejects(recordFtextOperatorDecision(tx,row.id,scope,'foreign',{outcome:'YES'},{context}));
 await assert.rejects(recordFtextOperatorDecision(tx,row.id,{...scope,storeId:'foreign'},'cashier',{outcome:'YES'},{context}));assert.equal(writes,0);
 await recordFtextOperatorDecision(tx,row.id,scope,'cashier',{outcome:'UNCERTAIN'},{context});
 await recordFtextOperatorDecision(tx,row.id,scope,'cashier',{outcome:'UNCERTAIN'},{context});assert.equal(writes,1);
 await recordFtextOperatorDecision(tx,row.id,scope,'cashier',{outcome:'YES'},{context});assert.equal(writes,2);
 assert.doesNotThrow(()=>assertFtextOperatorCardApproved(saved,settings));
 await recordFtextOperatorDecision(tx,row.id,scope,'cashier',{outcome:'YES'},{context});assert.equal(writes,2);
 await assert.rejects(recordFtextOperatorDecision(tx,row.id,scope,'cashier',{outcome:'NO'},{context}));
 assert.throws(()=>assertFtextOperatorCardApproved({...saved,resultHash:'e'.repeat(64)},settings));
 saved=structuredClone(row);await recordFtextOperatorDecision(tx,row.id,scope,'cashier',{outcome:'NO'},{context});assert.equal(ftextCashRequestView(saved).operatorConfirmationRequired,false);assert.throws(()=>assertFtextOperatorCardApproved(saved,settings));
});

test('unknown NO uses only the original operator decision and current configuration; release never invents physical checks',async()=>{
 const original=structuredClone(row);original.status='REQUIRES_CHECK';original.saleId=null;
 original.result={requestId:row.id,settingsHash:row.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};
 original.resultHash=createHash('sha256').update(JSON.stringify(original.result)).digest('hex');
 original.checkoutJson.ftextCardDecision={outcome:'NO',actorId:'cashier',resultHash:original.resultHash,settingsHash:original.settingsHash};
 let saved=structuredClone(original),writes=0;
 const tx={$queryRaw:async(parts,...values)=>{if(parts.join('?').startsWith('SELECT'))return values[1]===settings.companyId&&values[2]===settings.storeId&&values[3]===settings.terminalPos?[saved]:[];writes++;saved={...saved,checkoutJson:JSON.parse(values[0])};return [saved]}};
 const ack={operatorNo:true},context=async()=>({settings}),release=(a=ack,actor='cashier',scope=settings,c=context)=>releaseFtextRejectedAttempt(tx,row.id,scope,actor,a,{context:c});
 assert.equal(ftextOperatorReleaseMode(saved),'OPERATOR_REVIEW');assert.equal(ftextCashRequestView(saved).operatorReleaseMode,'OPERATOR_REVIEW');
 for(const a of [{registerReady:true},{operatorNo:false},{operatorNo:true,registerReady:true}])await assert.rejects(release(a));
 await assert.rejects(release(ack,'foreign'));await assert.rejects(release(ack,'cashier',{...settings,terminalPos:'foreign'}));await assert.rejects(release(ack,'cashier',settings,null));
 for(const patch of [{lifecycleGeneration:'1'},{serialNumber:'foreign'},{cardEnabled:false},{storeId:'foreign'},{cardPayment:{...settings.cardPayment,resultFormat:'POS_LINE8_OS7'}},{cardPayment:{...settings.cardPayment,code:3}}])await assert.rejects(release(ack,'cashier',settings,async()=>({settings:{...settings,...patch}})));
 for(const patch of [{saleId:'sale'},{status:'CONFIRMED'},{result:{...original.result,code:0}},{result:{...original.result,posPayments:[]}},{checkoutJson:{...original.checkoutJson,ftextVoid:{status:'REQUESTED'}}},{checkoutJson:{...original.checkoutJson,ftextCardMode:'POS_LINE8_OS7'}},{checkoutJson:{...original.checkoutJson,ftextCardDecision:{...original.checkoutJson.ftextCardDecision,outcome:'UNCERTAIN'}}}]){
  saved={...structuredClone(original),...patch};assert.equal(ftextOperatorReleaseMode(saved),null);await assert.rejects(release());
 }
 assert.equal(writes,0);saved=structuredClone(original);
 const released=await release();assert.equal(writes,1);assert.equal(ftextOperatorReleaseMode(released),'RELEASED');
 assert.equal(released.checkoutJson.ftextOperatorRelease.reviewMode,'OPERATOR_NO');
 assert.equal(released.checkoutJson.ftextOperatorRelease.readinessVerified,false);for(const key of ['noReceiptIssued','noChargeApproved'])assert.equal(released.checkoutJson.ftextOperatorRelease[key],undefined);
 assert.equal(released.checkoutJson.ftextOperatorRelease.actorId,'cashier');assert.equal(released.checkoutJson.ftextOperatorRelease.resultHash,original.resultHash);
 for(const key of ['status','result','resultHash','saleId'])assert.deepEqual(released[key],original[key]);assert.deepEqual(released.checkoutJson.ftextCardDecision,original.checkoutJson.ftextCardDecision);
 assert.throws(()=>assertFtextOperatorCardApproved(released,settings));
 assert.deepEqual(await release(ack,'cashier',settings,async()=>assert.fail('replay resolved current context')),released);assert.equal(writes,1);
});
