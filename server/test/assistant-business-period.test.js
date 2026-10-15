import test from 'node:test';
import assert from 'node:assert/strict';
import {businessQuestionPeriod,isBusinessPeriodFollowup} from '../src/services/assistant-business-period.js';
import {businessQuestionClarification,businessTool,directTransferRequest} from '../src/services/assistant-business-reports.js';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
import {assistantBusinessDomain} from '../../shared/assistant-business.mjs';
const now=new Date('2026-10-15T21:27:13Z'); // Friday 16 October in Athens
const period=(q,n=now)=>businessQuestionPeriod(q,{now:n});
test('natural periods use Athens date, Monday week and inclusive current/previous calendar bounds',()=>{
 for(const [text,from,to] of [
  ['σήμερα','2026-10-16','2026-10-16'],['χθες','2026-10-15','2026-10-15'],['προχθές','2026-10-14','2026-10-14'],
  ['αυτή την εβδομάδα','2026-10-12','2026-10-16'],['την προηγούμενη εβδομάδα','2026-10-05','2026-10-11'],
  ['αυτό τον μήνα','2026-10-01','2026-10-16'],['τον περασμένο μήνα','2026-09-01','2026-09-30'],
  ['φέτος','2026-01-01','2026-10-16'],['πέρσι','2025-01-01','2025-12-31'],['το προηγούμενο έτος','2025-01-01','2025-12-31'],
  ['τις τελευταίες 7 ημέρες','2026-10-10','2026-10-16'],['τον Οκτώβριο','2026-10-01','2026-10-31'],
  ['από 15 Οκτωβρίου έως σήμερα','2026-10-15','2026-10-16'],['από 1.10.2026 έως 16.10.2026','2026-10-01','2026-10-16'],
  ['από 2026-10-1 έως 2026-10-16','2026-10-01','2026-10-16'],['από χθες έως σήμερα','2026-10-15','2026-10-16']
 ])assert.deepEqual(period('Μεταφορές στον ιδιοκτήτη '+text),{from,to},text);
});
test('year/month rollover, leap years and DST retain calendar dates and 366day cap',()=>{
 const jan=new Date('2026-01-01T00:15:00Z');assert.deepEqual(period('προηγούμενο μήνα',jan),{from:'2025-12-01',to:'2025-12-31'});
 assert.deepEqual(period('πέρσι',new Date('2025-01-01T00:00:00Z')),{from:'2024-01-01',to:'2024-12-31'});
 assert.deepEqual(period('Φεβρουάριο 2024'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(period('προηγούμενη εβδομάδα',new Date('2026-03-30T00:00:00Z')),{from:'2026-03-23',to:'2026-03-29'});
 assert.deepEqual(period('τελευταίες 1 ημέρες'),{from:'2026-10-16',to:'2026-10-16'});
 assert.ok(period('τελευταίες 366 ημέρες'));assert.equal(period('τελευταίες 367 ημέρες'),null);
});
test('ambiguous, partial, mixed and invalid periods clarify instead of model guesses',()=>{
 for(const text of ['τον μήνα','από1/10','από 1/10','έως σήμερα','31/2/2026','29 Φεβρουαρίου 2026','1/10 ή 2/10','1/10 και 2/10','αυτή και την προηγούμενη εβδομάδα','σήμερα τον προηγούμενο μήνα','σύγκρινε φέτος με πέρσι','τελευταίες 0 ημέρες','τελευταίες 500 ημέρες']){
  const q='μεταφορές στον ιδιοκτήτη '+text;assert.equal(period(q),null,text);assert.match(businessQuestionClarification(q,{now}).answer,/έγκυρο/);
 }
 assert.equal(isBusinessPeriodFollowup('και χθες;'),true);assert.equal(isBusinessPeriodFollowup('τον προηγούμενο μήνα'),true);
 assert.equal(isBusinessPeriodFollowup('χθες από άλλο κατάστημα'),false);
});
test('business follow-ups preserve latest user period, direction and exports without old-date contamination',()=>{
 const users=['μεταφορές στον ιδιοκτήτη από 1/10 έως σήμερα','και χθες;','μεταφορές από τον ιδιοκτήτη'];
 const history=users.map(content=>({role:'user',content}));
 const changed=assistantEffectiveQuestion('και προχθές;',history);assert.deepEqual(period(changed),{from:'2026-10-14',to:'2026-10-14'});
 const next=assistantEffectiveQuestion('μεταφορές στον ιδιοκτήτη',history);assert.deepEqual(period(next),{from:'2026-10-15',to:'2026-10-15'});
 assert.equal(assistantBusinessDomain(next),'TRANSFERS_TO_OWNER');assert.equal(assistantBusinessDomain(changed),'TRANSFERS_FROM_OWNER');
 assert.deepEqual(period('μεταφορές από τον ιδιοκτήτη σήμερα'),{from:'2026-10-16',to:'2026-10-16'});
 const file=assistantEffectiveQuestion('σε Excel',history);assert.deepEqual(period(file),{from:'2026-10-15',to:'2026-10-15'});
 const relative=assistantEffectiveQuestion('μεταφορές στον ιδιοκτήτη',[{role:'user',content:'μεταφορές στον ιδιοκτήτη αυτή την εβδομάδα'}]);assert.deepEqual(period(relative),{from:'2026-10-12',to:'2026-10-16'});
 const other=assistantEffectiveQuestion('μεταφορές στον ιδιοκτήτη',[...history,{role:'user',content:'πωλήσεις νερού σήμερα'}]);assert.equal(period(other),null);
 const untrusted=assistantEffectiveQuestion('μεταφορές στον ιδιοκτήτη',[{role:'assistant',content:'μεταφορές 1/1 έως σήμερα'}]);assert.equal(period(untrusted),null);
 const filtered=assistantEffectiveQuestion('και χθες;',[{role:'user',content:'μεταφορές στον ιδιοκτήτη από Λεωνίδα από 1/10 έως σήμερα'}]);
 assert.equal(directTransferRequest(filtered,{now}),null,'direct path must not drop an inherited actor filter');
});
test('actual dispatcher uses canonical natural dates and refuses ambiguous requests before any model/source call',async()=>{
 let calls=0;const readBusiness=async args=>{calls++;assert.equal(args.from,'2026-10-05');assert.equal(args.to,'2026-10-11');return {kind:'business_records',domain:args.domain,from:args.from,to:args.to,rows:[],result:'no_records'}};
 const options={prompt:'fixture',tools:[businessTool],cashTool,now,readBusiness,requestProvider:()=>assert.fail('exact transfer range does not need model inference')};
 const out=await runOwnerAssistant({...options,question:'μεταφορές στον ιδιοκτήτη την προηγούμενη εβδομάδα'});assert.equal(calls,1);assert.equal(out.reads[0].args.to,'2026-10-11');
 const denied=await runOwnerAssistant({...options,question:'μεταφορές στον ιδιοκτήτη αυτή και την προηγούμενη εβδομάδα'});assert.equal(calls,1);assert.equal(denied.reads.length,0);
});
test('model filters cannot replace a recognized natural period or the newer direction',async()=>{
 const question='μεταφορές στον ιδιοκτήτη από Λεωνίδα αυτό τον μήνα';
 const requestProvider=async()=>({response:{ok:true},raw:{output:[{type:'function_call',call_id:'c',name:'business_records',arguments:JSON.stringify({domain:'TRANSFERS_TO_OWNER',from:'2026-10-15',to:'2026-10-16',query:'Λεωνίδα',status:null})}]}});
 await assert.rejects(runOwnerAssistant({prompt:'fixture',question,tools:[businessTool],cashTool,now,requestProvider,readBusiness:()=>assert.fail('wrong provider dates must not read')}),e=>e.status===422);
 assert.deepEqual(period('μεταφορές από Χρόνη από 1/10 έως σήμερα'),{from:'2026-10-01',to:'2026-10-16'});
});
