import {z} from 'zod';
import {automaticCashAuditSchema} from './cash-automatic-audit.js';
import {hash} from './cash-reconciliation-contract.js';

const cashCodes=['OPENING','CLOSING','CASH_SALES','EXPENSES','CASH_LEDGER','CASH_VARIANCE'];
const auditOf=row=>automaticCashAuditSchema.safeParse(row?.automaticAudit);
export function hasCashNumericContradiction(audit){
 const p=automaticCashAuditSchema.safeParse(audit);
 return p.success&&p.data.checks.some(c=>cashCodes.includes(c.code)&&c.status==='MISMATCH');
}
// Card discrepancies and missing expense documents are independent questions.
// No caller-provided result flag is authority; recompute from the scoped audit.
export function cashArithmeticIsCurrent(row){
 const p=auditOf(row);if(!p.success||p.data.status==='NOT_APPLICABLE'||row.recheck!==false)return false;
 const a=p.data;if(cashCodes.some(code=>a.checks.filter(c=>c.code===code&&c.status==='MATCHED'&&c.differenceCents===0).length!==1)||new Set(a.checks.map(c=>c.code)).size!==a.checks.length)return false;
 const {initialCents:initial,explainedCents:explained,offsetCents:offset,remainingCents:remaining}=row;
 if(![initial,explained,offset,remaining].every(Number.isSafeInteger)||explained<0||offset<0||!Number.isSafeInteger(explained+offset)||explained+offset>Math.abs(initial))return false;
 return remaining===Math.sign(initial)*(Math.abs(initial)-explained-offset);
}
export function canAutomaticallyCalculate(row){
 if(!cashArithmeticIsCurrent(row)||row.eligible!==true||row.identityRequiresReview!==false||typeof row.operatorId!=='string'||!row.operatorId||row.employeeKey!=='operator:'+row.operatorId||!row.operatorName)return false;
 return row.automaticAudit.checks.filter(c=>c.code.endsWith('_HANDOFF')).every(c=>c.status==='NOT_APPLICABLE'||c.status==='MATCHED'&&c.differenceCents===0);
}
const cents=z.number().int().safe().nonnegative();
const count=z.number().int().min(0).max(200);
const employee=z.object({key:z.string().min(1).max(200),name:z.string().min(1).max(200),identityRequiresReview:z.boolean(),shortageCents:cents,surplusCents:cents,shifts:count}).strict();
export const calculatedCashResultSchema=z.object({version:z.literal(1),automaticCount:count,manualCount:count,pending:count,shortageCents:cents,surplusCents:cents,employees:z.array(employee).max(200),days:z.array(employee.extend({day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict()).max(200),financialAdjustmentCents:z.literal(0),humanApproval:z.literal(false)}).strict();
export function calculateCashResult(rows){
 const employees=new Map(),days=new Map();let automaticCount=0,manualCount=0,pending=0,shortageCents=0,surplusCents=0;
 for(const r of rows){
  if(r.status==='NOT_APPLICABLE')continue;
  const manual=r.reviewed===true&&r.status==='REVIEWED'&&r.eligible===true&&r.recheck===false&&!!r.reviewedBy&&Number.isSafeInteger(r.remainingCents);
  if(!manual&&!canAutomaticallyCalculate(r)){pending++;continue;}
  if(manual)manualCount++;else automaticCount++;
  const shortage=Math.max(0,-r.remainingCents),surplus=Math.max(0,r.remainingCents);shortageCents+=shortage;surplusCents+=surplus;
  for(const [map,key,day]of [[employees,r.employeeKey,null],[days,JSON.stringify([r.day,r.employeeKey]),r.day]]){
   const value=map.get(key)||{key:r.employeeKey,name:r.operatorName,identityRequiresReview:r.identityRequiresReview,shortageCents:0,surplusCents:0,shifts:0,...(day?{day}:{})};
   if(value.name!==r.operatorName||value.identityRequiresReview!==r.identityRequiresReview)throw Error('Cash result identity changed.');
   value.shortageCents+=shortage;value.surplusCents+=surplus;value.shifts++;map.set(key,value);
  }
 }
 return calculatedCashResultSchema.parse({version:1,automaticCount,manualCount,pending,shortageCents,surplusCents,employees:[...employees.values()],days:[...days.values()],financialAdjustmentCents:0,humanApproval:false});
}
export function assertCalculatedCashResult(report){
 if(report.calculatedResult===undefined){
  if(report.rows.some(r=>r.automaticallyCalculated!==undefined))throw Error('Cash calculated result missing.');
  return;
 }
 const expected=calculateCashResult(report.rows);
 if(hash(calculatedCashResultSchema.parse(report.calculatedResult))!==hash(expected)||report.rows.some(r=>r.automaticallyCalculated!==canAutomaticallyCalculate(r)))throw Error('Cash calculated result changed.');
}
