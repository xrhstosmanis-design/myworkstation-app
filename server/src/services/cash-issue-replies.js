import {z} from 'zod';
import {hash,day,reconcileError} from './cash-reconciliation-contract.js';

const sha=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(180);
const text=z.string().max(1000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const codes=['EXPENSE_WITHOUT_DOCUMENT','EXPENSE_DOCUMENT_MISMATCH','EXPENSE_DOCUMENT_PARTIAL','EXPENSE_DOCUMENT_UNVERIFIED'];
const questionSchema=z.object({id:sha,sessionId:id,transactionId:id,code:z.enum(codes),day,operatorName:text.refine(v=>v.length>0&&v.length<=200),amountCents:z.number().int().safe().nullable(),occurredAt:z.string().datetime().nullable(),sourceHash:sha,evidenceHash:sha,fingerprint:sha}).strict();
const replySchema=z.object({id:z.string().min(1).max(200),decision:z.enum(['OPEN','CLOSED']),note:text.refine(v=>v.trim().length>=10),actorName:id,createdAt:z.string().datetime(),fingerprint:sha}).strict();
const issueSchema=questionSchema.extend({current:z.boolean(),status:z.enum(['OPEN','CLOSED','RECHECK_REQUIRED']),lastReply:replySchema.nullable(),repliesCount:z.number().int().min(0).max(10000)}).strict();
export const cashIssueRegisterSchema=z.object({version:z.literal(1),status:z.enum(['AVAILABLE','LIMITED']),limit:z.literal(500),issues:z.array(issueSchema).max(500)}).strict();
const limited=()=>({version:1,status:'LIMITED',limit:500,issues:[]});
export const expenseIssueId=(storeId,sessionId,finding)=>hash(['CASH_EXPENSE_ISSUE_V1',storeId,sessionId,finding.transactionId,finding.code]);
const fingerprint=q=>hash({id:q.id,sourceHash:q.sourceHash,evidenceHash:q.evidenceHash,amountCents:q.amountCents,occurredAt:q.occurredAt});
export const cashIssueQuestion=value=>questionSchema.parse(Object.fromEntries(Object.keys(questionSchema.shape).map(k=>[k,value[k]])));
function question(storeId,row,f){
 if(!id.safeParse(f.transactionId).success||!sha.safeParse(f.evidenceHash).success)return null;
 const q={id:expenseIssueId(storeId,row.sessionId,f),sessionId:row.sessionId,transactionId:f.transactionId,code:f.code,day:row.day,operatorName:row.operatorName,amountCents:f.amountCents,occurredAt:f.occurredAt,sourceHash:row.sourceHash,evidenceHash:f.evidenceHash};
 return questionSchema.parse({...q,fingerprint:fingerprint(q)});
}
export function projectCashIssues(storeId,rows,records){
 const selected=new Set(rows.map(r=>r.sessionId)),questions=new Map(),current=new Set();
 for(const row of rows)for(const f of row.expenseFindings||[]){
  const q=question(storeId,row,f);if(!q)continue;
  if(questions.has(q.id))return limited();questions.set(q.id,q);current.add(q.id);
  if(questions.size>500)return limited();
 }
 const replies=new Map(),counts=new Map();
 for(const r of records.filter(r=>r.data.kind==='ISSUE'&&selected.has(r.data.sessionId))){
  const parsed=questionSchema.safeParse(r.proof?.question),q=parsed.data;
  if(!parsed.success||q.id!==expenseIssueId(storeId,q.sessionId,q)||q.fingerprint!==fingerprint(q)||r.data.issueId!==q.id||r.data.sessionId!==q.sessionId||r.data.sourceHash!==q.sourceHash||r.data.issueFingerprint!==q.fingerprint)throw reconcileError('CASH_RECONCILIATION_INVALID_HISTORY');
  if(!current.has(q.id))questions.set(q.id,q);
  if(questions.size>500)return limited();
  counts.set(q.id,(counts.get(q.id)||0)+1);
  replies.set(q.id,replySchema.parse({id:r.id,decision:r.data.status,note:r.data.note,actorName:r.actorName,createdAt:new Date(r.createdAt).toISOString(),fingerprint:q.fingerprint}));
 }
 if(!questions.size)return undefined;
 if([...replies.values()].reduce((n,r)=>n+r.note.length,0)>60000)return limited();
 const issues=[...questions.values()].map(q=>{
  const lastReply=replies.get(q.id)||null,exists=current.has(q.id),matches=exists&&(!lastReply||lastReply.fingerprint===q.fingerprint);
  return {...q,current:exists,status:matches?(lastReply?.decision||'OPEN'):'RECHECK_REQUIRED',lastReply,repliesCount:counts.get(q.id)||0};
 }).sort((a,b)=>a.day.localeCompare(b.day)||a.id.localeCompare(b.id));
 return cashIssueRegisterSchema.parse({version:1,status:'AVAILABLE',limit:500,issues});
}
export function assertCashIssues(report){
 const register=report.issueRegister;
 if(register===undefined){
  if(report.rows.some(r=>(r.expenseFindings||[]).some(f=>id.safeParse(f.transactionId).success&&sha.safeParse(f.evidenceHash).success)))throw Error('Cash issue register missing.');
  return;
 }
 const p=cashIssueRegisterSchema.parse(register);
 if(p.status==='LIMITED'){if(p.issues.length)throw Error('Invalid limited cash issues.');return;}
 const expected=new Map();
 for(const row of report.rows)for(const f of row.expenseFindings||[]){const q=question(report.storeId,row,f);if(q){if(expected.has(q.id))throw Error('Duplicate cash question.');expected.set(q.id,q);}}
 const seen=new Set();
 for(const issue of p.issues){
  if(seen.has(issue.id)||!report.rows.some(r=>r.sessionId===issue.sessionId)||issue.id!==expenseIssueId(report.storeId,issue.sessionId,issue)||issue.fingerprint!==fingerprint(issue))throw Error('Cash issue identity changed.');
  seen.add(issue.id);const q=expected.get(issue.id);
  if(issue.current!==Boolean(q)||q&&hash(cashIssueQuestion(issue))!==hash(q))throw Error('Cash issue source changed.');
  if((issue.lastReply===null)!==(issue.repliesCount===0))throw Error('Cash issue history changed.');
  const state=issue.current&&(!issue.lastReply||issue.lastReply.fingerprint===issue.fingerprint)?(issue.lastReply?.decision||'OPEN'):'RECHECK_REQUIRED';
  if(issue.status!==state)throw Error('Cash issue decision changed.');
 }
 if([...expected.keys()].some(k=>!seen.has(k)))throw Error('Cash issue omitted.');
}
export function isExpenseIssueClosed(report,row,f){
 return report.issueRegister?.status==='AVAILABLE'&&report.issueRegister.issues.some(q=>q.id===expenseIssueId(report.storeId,row.sessionId,f)&&q.current&&q.status==='CLOSED');
}
export const issueStatusLabel={OPEN:'Ανοιχτή',CLOSED:'Κλειστή με τεκμηρίωση',RECHECK_REQUIRED:'Χρειάζεται επανέλεγχο της πηγής'};
export const issueCodeLabel={EXPENSE_WITHOUT_DOCUMENT:'Λείπει παραστατικό εξόδου',EXPENSE_DOCUMENT_MISMATCH:'Διαφορά ποσού παραστατικού',EXPENSE_DOCUMENT_PARTIAL:'Μερική πληρωμή παραστατικού',EXPENSE_DOCUMENT_UNVERIFIED:'Μη επιβεβαιωμένο παραστατικό'};
export function cashIssueText(register){
 if(!register)return [];
 if(register.status==='LIMITED')return ['','ΑΠΑΝΤΗΣΕΙΣ ΕΚΚΡΕΜΟΤΗΤΩΝ','Ο κατάλογος εκκρεμοτήτων είναι περιορισμένος. Επίλεξε μικρότερη περίοδο πριν καταχωρίσεις απάντηση.'];
 const lines=['','ΑΠΑΝΤΗΣΕΙΣ ΕΚΚΡΕΜΟΤΗΤΩΝ'];
 for(const q of register.issues){
  const amount=q.amountCents===null?'άγνωστο ποσό':(q.amountCents/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
  lines.push(`${q.day} · ${q.operatorName} · ${issueCodeLabel[q.code]} · ${amount} · κίνηση ${q.transactionId}: ${issueStatusLabel[q.status]}.`);
  if(q.lastReply)lines.push(`Απάντηση ${q.lastReply.actorName} · ${q.lastReply.createdAt}: ${q.lastReply.note}`);
  if(!q.current)lines.push('Προηγούμενο εύρημα: το ιστορικό διατηρείται, αλλά η τρέχουσα πηγή δεν επιβεβαιώνεται.');
 }
 return lines;
}
