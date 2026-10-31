import {cashIssueRegisterSchema,assertCashIssues} from './cash-issue-replies.js';
import {calculatedCashResultSchema,assertCalculatedCashResult,cashArithmeticIsCurrent,hasCashNumericContradiction} from './cash-automatic-result.js';
import {automaticCashAuditSchema} from './cash-automatic-audit.js';
import {z} from 'zod';
import {hash,day} from './cash-reconciliation-contract.js';
import {reconciliationText} from './cash-reconciliation-report.js';
import {summarizeCashVariances} from './automatic-report-policy.js';
import {cashReportRowDay} from '../../../client/src/lib/cash-report-period.js';

// Only public report fields cross this boundary. Original transactions,
// associated paper contents and adjacent context are deliberately excluded.
const text=z.string().max(1000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const id=text.refine(v=>v.length>0&&v.length<=200), sha=z.string().regex(/^[a-f0-9]{64}$/);
const cents=z.number().int().safe(), nullableCents=cents.nullable();
const instant=z.string().datetime().refine(v=>{try{return new Date(v).toISOString()===v}catch{return false}});
const period=z.object({from:day,to:day}).strict().refine(v=>v.to>=v.from&&(Date.parse(v.to)-Date.parse(v.from))/86400000<32);
const eventFinding=z.object({code:z.enum(['ZERO_VALUE_SALE','SALE_PRICE_REDUCTION','CATALOG_PRICE_CHANGE_UNCONFIRMED','PRICE_APPLICATION_UNCONFIRMED']),eventId:text.nullable(),saleId:text.nullable(),transactionNumber:text.nullable(),lineId:text.nullable(),occurredAt:instant.nullable(),eventAt:instant.nullable(),sessionId:text.nullable(),operatorId:text.nullable(),operatorName:text.nullable(),productId:text.nullable(),productName:text.nullable(),quantity:z.number().finite().positive().nullable(),originalPriceCents:nullableCents,finalPriceCents:nullableCents,totalReductionCents:nullableCents}).strict();
const eventSales=z.object({status:z.enum(['AVAILABLE','UNAVAILABLE','LIMITED']),findings:z.array(eventFinding).max(500),financialAdjustmentCents:z.literal(0),evidenceHash:sha.optional()}).strict();
const kioskEventSales=eventSales.extend({evidenceHash:sha,sourceChecksums:z.array(sha).max(12),coverage:z.object({eventCount:z.number().int().min(0).max(2000),saleCount:z.number().int().min(0).max(2000),eventQuantityAvailable:z.literal(false),externalOnly:z.literal(true),missingJournalShiftIds:z.array(id).max(2000),unverifiedEventOverlapCount:z.number().int().min(0).max(2000),sourceUnavailable:z.boolean()}).strict()}).strict();
const row=z.object({sessionId:id,sourceHash:sha,planHash:sha,openedAt:instant,closedAt:instant,terminalPos:id,shiftLabel:id,operatorId:id.nullable(),operatorName:id,initialCents:nullableCents,explainedCents:nullableCents,offsetCents:cents,remainingCents:nullableCents,cardCents:nullableCents,nextClosed:z.boolean(),recheck:z.boolean(),eligible:z.boolean(),reviewed:z.boolean(),status:z.enum(['NOT_APPLICABLE','RECHECK_REQUIRED','AWAITING_NEXT_SHIFT','REVIEWED','AWAITING_REVIEW']),reviewedBy:id.nullable(),reviewNote:text.nullable(),day:day,identityRequiresReview:z.boolean(),employeeKey:id,automaticAudit:automaticCashAuditSchema.optional(),automaticallyCalculated:z.boolean().optional(),eventSales:eventSales.optional(),expenseFindings:z.array(z.object({code:z.enum(['EXPENSE_WITHOUT_DOCUMENT','EXPENSE_DOCUMENT_MISMATCH','EXPENSE_DOCUMENT_PARTIAL','EXPENSE_DOCUMENT_UNVERIFIED']),amountCents:nullableCents,occurredAt:instant.nullable(),transactionId:id.optional(),evidenceHash:sha.optional()}).strict()).max(500),pendingEvidence:z.array(z.object({id,kind:id,label:text,date:day,amountCents:cents}).strict()).max(100)}).strict();
const employee=z.object({key:id,name:id,identityRequiresReview:z.boolean(),shortageCents:cents,surplusCents:cents}).strict();
const checkpoint=z.object({resumeFrom:day,pendingNotes:z.array(text).max(20),period:period,current:z.boolean().nullable()}).strict().nullable();
const reportSchema=z.object({storeId:id,storeName:id,period,rows:z.array(row).min(1).max(200),totals:z.object({shortageCents:cents,surplusCents:cents,pending:z.number().int().min(0).max(200)}).strict(),employees:z.array(employee).max(200),reportHash:sha,calculatedResult:calculatedCashResultSchema.optional(),checkpoint,issueRegister:cashIssueRegisterSchema.optional(),text:z.string().max(200000),kioskEventSales:kioskEventSales.optional()}).strict();
const iso=v=>new Date(v).toISOString();
const projectRow=r=>({sessionId:r.sessionId,sourceHash:r.sourceHash,planHash:r.planHash,openedAt:iso(r.openedAt),closedAt:iso(r.closedAt),terminalPos:r.terminalPos,shiftLabel:r.shiftLabel,operatorId:r.operatorId??null,operatorName:r.operatorName,initialCents:r.initialCents,explainedCents:r.explainedCents,offsetCents:r.offsetCents,remainingCents:r.remainingCents,cardCents:r.cardCents,nextClosed:r.nextClosed,recheck:r.recheck,eligible:r.eligible,reviewed:r.reviewed,status:r.status,reviewedBy:r.reviewedBy??null,reviewNote:r.reviewNote??null,day:r.day,identityRequiresReview:r.identityRequiresReview,employeeKey:r.employeeKey,expenseFindings:r.expenseFindings||[],...(r.automaticallyCalculated!==undefined?{automaticallyCalculated:r.automaticallyCalculated}:{}),...(r.automaticAudit?{automaticAudit:r.automaticAudit}:{}),...(r.eventSales?{eventSales:r.eventSales}:{}),pendingEvidence:(r.pendingEvidence||[]).map(({id,kind,label,date,amountCents})=>({id,kind,label,date,amountCents}))});
export function projectAutomaticReviewedReport(r){
 const data={storeId:r.storeId,storeName:r.storeName,period:r.period,rows:r.rows.map(projectRow),totals:r.totals,employees:r.employees,reportHash:r.reportHash,...(r.calculatedResult?{calculatedResult:r.calculatedResult}:{}),checkpoint:r.checkpoint?{resumeFrom:r.checkpoint.resumeFrom,pendingNotes:r.checkpoint.pendingNotes,period:r.checkpoint.period,current:r.checkpoint.current}:null,text:r.text,...(r.issueRegister?{issueRegister:r.issueRegister}:{}),...(r.kioskEventSales?{kioskEventSales:r.kioskEventSales}:{})};
 const parsed=reportSchema.parse(data);assertCalculatedCashResult(parsed);if(reconciliationText(parsed)!==parsed.text)throw Error('Cash report text changed.');return parsed;
}

// This validation is useful only with groups from the already authorized source
// query; a self-consistent envelope supplied by an API caller is not authority.
export function validateAutomaticReviewedReport(report,{companyId,storeId,groups,rule,dayStartHour}){
 try{
  const p=reportSchema.parse(report);assertCalculatedCashResult(p);if(p.storeId!==storeId||reconciliationText(p)!==p.text||!Array.isArray(groups)||!rule?.deliveryTerminalPattern)return false;
  const originals=new Map();for(const g of groups){if(g.companyId!==companyId||g.storeId!==storeId||!Array.isArray(g.rows))return false;for(const r of g.rows){if(originals.has(r.sessionId))return false;originals.set(r.sessionId,{...r,day:g.day,terminalPos:g.terminalPos,cashChain:g.cashChain});}}
  if(originals.size!==p.rows.length||new Set(p.rows.map(r=>r.sessionId)).size!==p.rows.length)return false;
  const employees=new Map();let shortage=0,surplus=0,pending=0;
  for(const r of p.rows){
   const original=originals.get(r.sessionId);if(!original||original.terminalPos!==r.terminalPos||(original.employeeId??null)!==r.operatorId||(original.employeeName||null)!==(r.operatorName==='Χωρίς καταγεγραμμένο χειριστή'?null:r.operatorName)||!Number.isSafeInteger(r.initialCents)||Math.round(original.variance*100)!==r.initialCents)return false;
   if(r.closedAt<r.openedAt||cashReportRowDay(r.closedAt)!==r.day||r.day<p.period.from||r.day>p.period.to)return false;
   const reconstructed=summarizeCashVariances([{id:r.sessionId,status:'CLOSED',companyId,storeId,terminalPos:r.terminalPos,cashChain:original.cashChain,openedAt:r.openedAt,variance:r.initialCents/100}],{dayStartHour});
   if(reconstructed.length!==1||reconstructed[0].day!==original.day||original.cashChain!==(r.terminalPos.toUpperCase().includes(rule.deliveryTerminalPattern.toUpperCase())?'DELIVERY':'STORE'))return false;
   if(!r.reviewed&&r.status!=='NOT_APPLICABLE')pending++;
   if(!r.reviewed)continue;
   if(!r.eligible||r.recheck||r.status!=='REVIEWED'||!r.reviewedBy||r.remainingCents===null)return false;
   const e=employees.get(r.employeeKey)||{key:r.employeeKey,name:r.operatorName,identityRequiresReview:r.identityRequiresReview,shortageCents:0,surplusCents:0};
   if(e.name!==r.operatorName||e.identityRequiresReview!==r.identityRequiresReview)return false;
   const a=Math.max(0,-r.remainingCents),b=Math.max(0,r.remainingCents);shortage+=a;surplus+=b;e.shortageCents+=a;e.surplusCents+=b;employees.set(r.employeeKey,e);
  }
  return [shortage,surplus].every(Number.isSafeInteger)&&p.totals.shortageCents===shortage&&p.totals.surplusCents===surplus&&p.totals.pending===pending&&hash([...employees.values()])===hash(p.employees);
 }catch{return false}
}

// Pending shifts may be delivered only as explicitly provisional lines. Missing
// amounts or invalidated evidence must remain a hard hold, not become zero.
export function canSendProvisionalCashReport(report){
 try{
  const p=reportSchema.parse(report);assertCalculatedCashResult(p);assertCashIssues(p);
  return p.rows.every(r=>{
   if(hasCashNumericContradiction(r.automaticAudit)||!r.reviewed&&r.automaticAudit&&r.automaticAudit.status!=='NOT_APPLICABLE'&&!cashArithmeticIsCurrent(r))return false;
   if(!r.reviewed&&r.automaticAudit?.checks.some(c=>c.code.startsWith('CARD_')&&c.status==='UNAVAILABLE'))return false;
   if(!Number.isSafeInteger(r.initialCents)||!Number.isSafeInteger(r.remainingCents)||!Number.isSafeInteger(r.cardCents)||r.recheck)return false;
   if(r.reviewed)return r.status==='REVIEWED'&&r.eligible&&!!r.reviewedBy;
   if(r.reviewedBy!==null)return false;
   if(r.status==='AWAITING_REVIEW')return r.eligible;
   if(r.status==='AWAITING_NEXT_SHIFT')return !r.nextClosed&&!r.eligible;
   return false;
  });
 }catch{return false}
}

const receiptSchema=z.object({status:z.literal('READY'),reason:z.null(),companyId:id,storeId:id,generation:z.string().regex(/^(0|[1-9][0-9]{0,18})$/),head:z.union([sha,z.literal('ROOT')]),sourceFingerprint:sha,report:reportSchema,fingerprint:sha}).strict();
export function validateAutomaticReviewedReceipt(value,{companyId,storeId,groups,rule,dayStartHour,sourceFingerprint}){
 try{
  const receipt=receiptSchema.parse(value),{fingerprint,...unsigned}=receipt;
  return receipt.companyId===companyId&&receipt.storeId===storeId&&receipt.sourceFingerprint===sourceFingerprint&&BigInt(receipt.generation)<=9223372036854775807n&&hash(unsigned)===fingerprint&&canSendProvisionalCashReport(receipt.report)&&validateAutomaticReviewedReport(receipt.report,{companyId,storeId,groups,rule,dayStartHour});
 }catch{return false}
}
