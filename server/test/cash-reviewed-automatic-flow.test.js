import test from 'node:test';
import assert from 'node:assert/strict';
import {readAutomaticCashPreview} from '../src/services/automatic-report-source.js';
import {buildAutomaticCashPayload,automaticReviewedMailText} from '../src/services/automatic-report-cash-payload.js';
import {cashRuleFields,legacyCashControlRule} from '../src/services/cash-control-rules.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {projectAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';

test('complete human-reviewed fixture feeds common text into payload, while modified evidence is rejected',async()=>{
 const configuration={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:cashRuleFields(legacyCashControlRule({name:'LAB'}))};
 const rows=[7,15,23].map((hour,i)=>({id:String(i),companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'e'+i,openedByName:'Χειριστής '+i,openedAt:new Date(`2026-10-15T${String(hour).padStart(2,'0')}:00:00+03:00`),closedAt:new Date(i===2?'2026-10-16T07:00:00+03:00':`2026-10-15T${hour+8}:00:00+03:00`),variance:[-10,8,0][i]}));
 const tx={user:{findUnique:async()=>({role:'SUPER_ADMIN'})},store:{findFirst:async()=>({id:'store',companyId:'co',name:'LAB'})},$queryRaw:async strings=>strings.join('').includes('FROM "AutomaticReportSettings"')?[{version:1}]:strings.join('').includes('FROM "CashControlStoreRule"')?[]:rows};
 const p=await readAutomaticCashPreview({$transaction:fn=>fn(tx)},{actorId:'u',companyId:'co',storeId:'store',day:'2026-10-15',configuration,settingsVersion:1,now:new Date('2026-10-16T08:00:00+03:00')});
 const sessions=new Map(rows.map(r=>[r.id,{session:{...r,shiftLabel:'Βάρδια'},sourceHash:hash(r.id),initialCents:r.variance*100,basisCents:r.variance*100,cardCents:r.id==='0'?20000:0,explainedCents:0,reviewStatus:'VALID',nextClosed:true,transactions:[{id:'PRIVATE'}]}]));
 const source={store:{id:'store',name:'LAB'},rule:{mode:'FULL',carryOverEnabled:true},sessions,selectedIds:rows.map(r=>r.id),period:{from:'2026-10-15',to:'2026-10-16'},coverage:'BOUNDED_CLOSED_SHIFTS'},draft=projectReconciliation(source,[]);
 const records=draft.rows.map((r,i)=>({id:'confirm'+i,sequence:i+1,actorName:'Χρήστος Μάνης',data:{kind:'CONFIRM',sessionId:r.sessionId,sourceHash:r.sourceHash,planHash:r.planHash,note:'Ελέγχθηκε η βάρδια.'},proof:{}}));
 const report=projectAutomaticReviewedReport(projectReconciliation(source,records)),unsigned={status:'READY',reason:null,companyId:'co',storeId:'store',generation:'0',head:'ROOT',sourceFingerprint:p.sourceFingerprint,report};
 p.reviewedReconciliation=true;p.reviewedCash={...unsigned,fingerprint:hash(unsigned)};
 const result=buildAutomaticCashPayload({preview:p,companyId:'co',storeId:'store',settingsVersion:1}),content=JSON.parse(result.body);
 assert.match(automaticReviewedMailText(content),/ΑΠΟΤΕΛΕΣΜΑ ΜΕΤΑ ΑΠΟ ΕΛΕΓΧΟ/);assert.match(automaticReviewedMailText(content),/POS–EFTPOS: διαφορά \+200,00/);assert.equal(result.body.includes('PRIVATE'),false);
 assert.equal(content.reviewedCash.report.totals.shortageCents,1000);assert.equal(content.reviewedCash.report.totals.surplusCents,800);
 p.reviewedCash.report.rows[0].remainingCents=0;assert.throws(()=>buildAutomaticCashPayload({preview:p,companyId:'co',storeId:'store',settingsVersion:1}),{code:'INVALID_CASH_PAYLOAD'});
});
