import test from 'node:test';
import assert from 'node:assert/strict';
import {readAutomaticCashPreview} from '../src/services/automatic-report-source.js';
import {buildAutomaticCashPayload,automaticReviewedMailText} from '../src/services/automatic-report-cash-payload.js';
import {cashRuleFields,legacyCashControlRule} from '../src/services/cash-control-rules.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {projectAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';
import {createAutomaticReportMailAdapter} from '../src/services/automatic-report-mail-adapter.js';
import {createDeliverySlot,claimDelivery,startDelivery} from '../src/services/automatic-report-delivery-lifecycle.js';
import {createHash} from 'node:crypto';

test('complete human-reviewed fixture feeds common text into payload, while modified evidence is rejected',async()=>{
 const configuration={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:cashRuleFields(legacyCashControlRule({name:'LAB'}))};
 const rows=[7,15,23].map((hour,i)=>({id:String(i),companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'e'+i,openedByName:'Χειριστής '+i,openedAt:new Date(`2026-10-15T${String(hour).padStart(2,'0')}:00:00+03:00`),closedAt:new Date(i===2?'2026-10-16T07:00:00+03:00':`2026-10-15T${hour+8}:00:00+03:00`),variance:[-10,8,0][i]}));
 const tx={user:{findUnique:async()=>({role:'SUPER_ADMIN'})},store:{findFirst:async()=>({id:'store',companyId:'co',name:'LAB'})},$queryRaw:async strings=>strings.join('').includes('FROM "AutomaticReportSettings"')?[{version:1}]:strings.join('').includes('FROM "CashControlStoreRule"')?[]:rows};
 const p=await readAutomaticCashPreview({$transaction:fn=>fn(tx)},{actorId:'u',companyId:'co',storeId:'store',day:'2026-10-15',configuration,settingsVersion:1,now:new Date('2026-10-16T08:00:00+03:00')});
 const sessions=new Map(rows.map(r=>[r.id,{session:{...r,shiftLabel:'Βάρδια'},sourceHash:hash(r.id),initialCents:r.variance*100,basisCents:r.variance*100,cardCents:r.id==='0'?20000:0,explainedCents:0,reviewStatus:'VALID',nextClosed:true,transactions:[{id:'PRIVATE'}]}]));
 sessions.get('0').session.nextSession=sessions.get('1').session;
 const source={store:{id:'store',name:'LAB'},rule:{mode:'FULL',carryOverEnabled:true},sessions,selectedIds:rows.map(r=>r.id),period:{from:'2026-10-15',to:'2026-10-16'},coverage:'BOUNDED_CLOSED_SHIFTS'};
 const prior=sessions.get('0').sourceHash,next=sessions.get('1').sourceHash,offset={id:'offset',sequence:1,actorName:'Χρήστος Μάνης',data:{kind:'OFFSET',previousSessionId:'0',nextSessionId:'1',previousHash:prior,nextHash:next,amountCents:200},proof:{previousHash:prior,nextHash:next}};
 const draft=projectReconciliation(source,[offset]);
 const records=[offset,...draft.rows.map((r,i)=>({id:'confirm'+i,sequence:i+2,actorName:'Χρήστος Μάνης',data:{kind:'CONFIRM',sessionId:r.sessionId,sourceHash:r.sourceHash,planHash:r.planHash,note:'Ελέγχθηκε η βάρδια.'},proof:{}}))];
 const report=projectAutomaticReviewedReport(projectReconciliation(source,records)),unsigned={status:'READY',reason:null,companyId:'co',storeId:'store',generation:'0',head:'ROOT',sourceFingerprint:p.sourceFingerprint,report};
 p.reviewedReconciliation=true;p.reviewedCash={...unsigned,fingerprint:hash(unsigned)};
 const result=buildAutomaticCashPayload({preview:p,companyId:'co',storeId:'store',settingsVersion:1}),content=JSON.parse(result.body);
 assert.match(automaticReviewedMailText(content),/ΑΠΟΤΕΛΕΣΜΑ ΜΕΤΑ ΑΠΟ ΕΛΕΓΧΟ/);assert.match(automaticReviewedMailText(content),/POS–EFTPOS: διαφορά \+200,00/);assert.equal(result.body.includes('PRIVATE'),false);
 assert.equal(content.reviewedCash.report.totals.shortageCents,800);assert.equal(content.reviewedCash.report.totals.surplusCents,600);
 const now='2026-10-22T06:00:00.000Z',recipient='fixture@example.com',input={companyId:'co',storeId:'store',reportType:'CASH',frequency:'DAILY',periodFrom:result.period.from,periodTo:result.period.to,recipient,snapshot:{settingsVersion:1,recipientVersion:1,consentRevision:1,lifecycleGeneration:'0',sourceFingerprint:result.sourceFingerprint,payloadFingerprint:result.payloadFingerprint,policyFingerprint:'a'.repeat(64),principalId:'u',financialFinality:'PROVISIONAL',financialReconciliationComplete:false}};
 const auth={...input,checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:true,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};
 const pending=createDeliverySlot(input,{now,current:auth}),claimed=claimDelivery(pending,{expectedVersion:1,token:'test',now,leaseMs:60000}),started=startDelivery(claimed,{expectedVersion:2,token:'test',now,current:auth}),calls=[];
 const adapter=createAutomaticReportMailAdapter({startAttempt:async()=>{calls.push('start');return started},sendMail:async message=>{calls.push(message.text);return {accepted:[recipient],rejected:[],messageId:'fixture'}}});
 const args={scope:{companyId:'co',storeId:'store',slotId:started.slotId},expectedVersion:2,token:'test',now,payload:result};
 assert.equal((await adapter.attempt(args)).outcome,'ACCEPTED');assert.equal(calls[0],'start');assert.equal(calls[1],automaticReviewedMailText(content));
 const altered=structuredClone(args),body=JSON.parse(altered.payload.body);body.reviewedCash.report.rows[0].remainingCents=0;altered.payload.body=JSON.stringify(body);altered.payload.byteLength=Buffer.byteLength(altered.payload.body);altered.payload.payloadFingerprint=createHash('sha256').update(altered.payload.body).digest('hex');calls.length=0;
 await assert.rejects(adapter.attempt(altered),{code:'INVALID_MAIL_ATTEMPT'});assert.equal(calls.length,0);
 const missing=structuredClone(p);missing.reviewedCash.report.rows[0].cardCents=null;const {fingerprint,...missingUnsigned}=missing.reviewedCash;missing.reviewedCash.fingerprint=hash(missingUnsigned);
 assert.throws(()=>buildAutomaticCashPayload({preview:missing,companyId:'co',storeId:'store',settingsVersion:1}),{code:'INVALID_CASH_PAYLOAD'});
 p.reviewedCash.report.rows[0].remainingCents=0;assert.throws(()=>buildAutomaticCashPayload({preview:p,companyId:'co',storeId:'store',settingsVersion:1}),{code:'INVALID_CASH_PAYLOAD'});
});

import {cashPreviewPeriod,reportDayOffset,reportWallTime} from '../src/services/automatic-report-policy.js';
test('reviewed business windows cover DST and month-end morning without dropping sessions',async()=>{
 const configuration={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:cashRuleFields(legacyCashControlRule({name:'LAB'}))};
 for(const [frequency,day,hours]of [['DAILY','2026-03-28',23],['DAILY','2026-10-24',25],['WEEKLY','2026-10-21',169],['MONTHLY','2026-10-15',745]]){
  const window=cashPreviewPeriod(day,frequency,configuration),rows=[];
  for(let d=window.fromDay;d<=window.toDay;d=reportDayOffset(d,1))for(let slot=0;slot<3;slot++){
   const next=reportDayOffset(d,1),start=reportWallTime(d,7).getTime(),from=new Date(start+slot*8*3600000),to=slot===2?reportWallTime(next,7):new Date(start+(slot+1)*8*3600000);
   rows.push({id:d+'-'+slot,companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'e'+slot,openedByName:'Χειριστής '+slot,openedAt:from,closedAt:to,variance:[-10,8,0][slot]});
  }
  const tx={user:{findUnique:async()=>({role:'SUPER_ADMIN'})},store:{findFirst:async()=>({id:'store',companyId:'co',name:'LAB'})},$queryRaw:async strings=>strings.join('').includes('FROM "AutomaticReportSettings"')?[{version:1}]:strings.join('').includes('FROM "CashControlStoreRule"')?[]:rows};
  const p=await readAutomaticCashPreview({$transaction:fn=>fn(tx)},{actorId:'u',companyId:'co',storeId:'store',day,frequency,configuration,settingsVersion:1,now:new Date(window.to.getTime()+3600000)});
  assert.equal(p.ready,true);assert.equal((window.to-window.from)/3600000,hours);
  const sessions=new Map(rows.map(r=>[r.id,{session:{...r,shiftLabel:'Βάρδια'},sourceHash:hash(r.id),initialCents:r.variance*100,basisCents:r.variance*100,cardCents:0,explainedCents:0,reviewStatus:'VALID',nextClosed:true,transactions:[]} ]));
  const source={store:{id:'store',name:'LAB'},rule:{mode:'FULL',carryOverEnabled:true},sessions,selectedIds:rows.map(r=>r.id),period:{from:window.fromDay,to:reportDayOffset(window.toDay,1)},coverage:'BOUNDED_CLOSED_SHIFTS'},draft=projectReconciliation(source,[]);
  const records=draft.rows.map((r,i)=>({id:'confirm'+i,sequence:i+1,actorName:'Χρήστος Μάνης',data:{kind:'CONFIRM',sessionId:r.sessionId,sourceHash:r.sourceHash,planHash:r.planHash,note:'Ελέγχθηκε η βάρδια.'},proof:{}}));
  const report=projectAutomaticReviewedReport(projectReconciliation(source,records)),unsigned={status:'READY',reason:null,companyId:'co',storeId:'store',generation:'0',head:'ROOT',sourceFingerprint:p.sourceFingerprint,report};
  p.reviewedReconciliation=true;p.reviewedCash={...unsigned,fingerprint:hash(unsigned)};
  const result=buildAutomaticCashPayload({preview:p,companyId:'co',storeId:'store',settingsVersion:1}),content=JSON.parse(result.body);
  assert.equal(content.reviewedCash.report.rows.length,rows.length);assert.equal(content.reviewedCash.report.period.to,reportDayOffset(window.toDay,1));assert.equal(new Set(content.reviewedCash.report.rows.map(r=>r.sessionId)).size,rows.length);
 }
});
