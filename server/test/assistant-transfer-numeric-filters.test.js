import test from 'node:test';
import assert from 'node:assert/strict';
import {businessPeriodRemainder} from '../src/services/assistant-business-period.js';
import {directTransferRequest,businessTool,businessQuestionClarification} from '../src/services/assistant-business-reports.js';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
const now=new Date('2026-10-18T10:00:00Z'),scope={companyId:'co',storeId:'store',storeName:'LAB'};
const noRead=()=>assert.fail('ambiguous bare numeric qualifier must not reach a provider or source');
const numericError=e=>e.status===422&&/αριθμός εκτός της περιόδου/.test(e.message);
test('direct transfers consume only actual period digits and preserve valid ordinary requests',()=>{
 for(const [text,from,to] of [
  ['χθες','2026-10-17','2026-10-17'],['από1/10 έως18/10/2026','2026-10-01','2026-10-18'],
  ['στις 2026-10-18','2026-10-18','2026-10-18'],['στις 18.10.2026','2026-10-18','2026-10-18'],
  ['τις τελευταίες 7 ημέρες','2026-10-12','2026-10-18'],['τον προηγούμενο μήνα','2026-09-01','2026-09-30']
 ]){
  const q='μεταφορές από τον ιδιοκτήτη '+text;
  assert.doesNotMatch(businessPeriodRemainder(q),/\d/);
  assert.deepEqual(directTransferRequest(q,{now}),{domain:'TRANSFERS_FROM_OWNER',from,to,query:null,status:null});
 }
 assert.match(businessPeriodRemainder('χθες 2269'),/2269/);
 assert.match(businessPeriodRemainder('τελευταίες 7 ημέρες 2269'),/2269/);
});
test('bare numeric qualifiers, later lines and inherited topics clarify before any model/source read',async()=>{
 const history=[{role:'user',content:'μεταφορές χθες 2269'}];
 const questions=[...['0','2269','5200000000000','-2269','١٢٣','１２３'].map(n=>'μεταφορές χθες '+n),
  'μεταφορές χθες\n2269','μεταφορές τις τελευταίες 7 ημέρες 2269',
  assistantEffectiveQuestion('και σήμερα;',history),assistantEffectiveQuestion('σε CSV',history)];
 for(const q of questions){
  assert.throws(()=>directTransferRequest(q,{now}),numericError,q);
  await assert.rejects(runOwnerAssistant({question:q,now,tools:[businessTool],cashTool,requestProvider:noRead,readBusiness:noRead}),numericError,q);
 }
 // A date-shaped decimal already makes the period ambiguous. Preserve that
 // exact server clarification as another zero-read outcome, not query:null.
 for(const q of ['μεταφορές χθες 22.69','μεταφορές χθες 1.10']){
  assert.equal(directTransferRequest(q,{now}),null);
  const out=await runOwnerAssistant({question:q,now,tools:[businessTool],cashTool,requestProvider:noRead,readBusiness:noRead});
  assert.deepEqual(out.reads,[]);assert.deepEqual(out.evidence,[]);assert.deepEqual(JSON.parse(out.raw.output_text),businessQuestionClarification(q,{now}));
 }
});
test('literal labelled numeric/name/status filters retain the original checked extraction path',async()=>{
 for(const q of ['μεταφορές χθες με περιγραφή 2269','μεταφορές χθες από Χειριστή2269','ακυρωμένες μεταφορές χθες 2269'])assert.equal(directTransferRequest(q,{now}),null,q);
 const question='μεταφορές χθες με περιγραφή 2269',args={domain:'TRANSFERS',from:'2026-10-17',to:'2026-10-17',query:'2269',status:null};let calls=0,reads=0;
 const out=await runOwnerAssistant({question,now,tools:[businessTool],cashTool,requestProvider:async()=>++calls===1?{response:{ok:true},raw:{output:[{type:'function_call',name:'business_records',call_id:'literal',arguments:JSON.stringify(args)}]}}:{response:{ok:true},raw:{status:'completed',output_text:'fixture'}},readBusiness:async a=>{reads++;assert.deepEqual(a,args);return {kind:'business_records',domain:'TRANSFERS',source:'isolated fixture',rows:[],result:'no_records'}}});
 assert.equal(reads,1);assert.equal(calls,2);assert.deepEqual(out.reads,[{name:'business_records',args}]);
});
test('both role entry paths refuse ambiguous shorthand and preserve selection/initial authorization',async()=>{
 let ownerAuth=0,error;const handlers=createOwnerAssistantHandlers({authorize:async()=>{ownerAuth++;return scope},requestProvider:noRead,readBusiness:noRead});
 await handlers.ask({body:{question:'μεταφορές χθες 2269'}},{json:noRead},e=>error=e);
 assert.ok(ownerAuth>=3);assert.ok(numericError(error));
 let platformAuth=0;const session=await createPlatformAssistantSession({},scope,{authorize:async()=>{platformAuth++;return scope},readBusiness:noRead});
 await assert.rejects(session.run({question:'μεταφορές χθες 2269',requestProvider:noRead}),numericError);assert.equal(platformAuth,1);
});
