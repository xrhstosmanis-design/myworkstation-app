import {z} from 'zod';
import {hash,day,exactCents,reconcileError} from './cash-reconciliation-contract.js';
import {cashReportRowDay} from '../../../client/src/lib/cash-report-period.js';
import {issueStatusLabel} from './cash-issue-replies.js';

const sha=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(180);
const text=z.string().max(1000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const instant=z.string().datetime(),cents=z.number().int().safe();
const shape={id:sha,previousSessionId:id,nextSessionId:id,previousHash:sha,nextHash:sha,ruleHash:sha,terminalPos:id,previousDay:day,nextDay:day,previousOperator:text.refine(v=>v.length>0&&v.length<=200),nextOperator:text.refine(v=>v.length>0&&v.length<=200),previousOpenedAt:instant,previousClosedAt:instant,nextOpenedAt:instant,nextClosedAt:instant,previousClosingCents:cents,nextOpeningCents:cents,differenceCents:cents.refine(v=>v!==0),fingerprint:sha};
const question=z.object(shape).strict().refine(q=>q.previousSessionId!==q.nextSessionId&&q.previousOpenedAt<=q.previousClosedAt&&q.previousClosedAt<=q.nextOpenedAt&&q.nextOpenedAt<=q.nextClosedAt&&q.differenceCents===q.nextOpeningCents-q.previousClosingCents&&Number.isSafeInteger(q.differenceCents)&&q.previousDay===cashReportRowDay(q.previousClosedAt)&&q.nextDay===cashReportRowDay(q.nextClosedAt));
const reply=z.object({id:z.string().min(1).max(200),decision:z.enum(['OPEN','CLOSED']),note:text.refine(v=>v.trim().length>=10),actorName:id,createdAt:instant,fingerprint:sha}).strict();
const issue=z.object({...shape,current:z.boolean(),status:z.enum(['OPEN','CLOSED','RECHECK_REQUIRED']),lastReply:reply.nullable(),repliesCount:z.number().int().min(0).max(10000)}).strict().refine(q=>question.safeParse(handoffQuestion(q)).success);
export const handoffRegisterSchema=z.object({version:z.literal(1),status:z.enum(['AVAILABLE','LIMITED']),limit:z.literal(500),issues:z.array(issue).max(500)}).strict();
export const handoffIssueId=(storeId,a,b)=>hash(['CASH_HANDOFF_ISSUE_V1',storeId,a,b]);
export const handoffQuestion=q=>Object.fromEntries(Object.keys(shape).map(k=>[k,q[k]]));
const fingerprint=q=>{const {fingerprint,...values}=handoffQuestion(q);return hash(values);};
const limited=()=>({version:1,status:'LIMITED',limit:500,issues:[]});
const iso=v=>new Date(v).toISOString();
export function projectHandoffIssues(source,records,pairValid){
 const selected=new Set(source.selectedIds),questions=new Map(),current=new Set();
 for(const a of source.sessions.values()){
  const b=source.sessions.get(a.session.nextSession?.id);
  if(!b||![a.session.id,b.session.id].some(id=>selected.has(id))||!pairValid(a,b,source.rule))continue;
  const closing=exactCents(a.session.actualOperational),opening=exactCents(b.session.openingOperational);
  if(closing===null||opening===null||closing===opening||!Number.isSafeInteger(opening-closing))continue;
  const q={id:handoffIssueId(source.store.id,a.session.id,b.session.id),previousSessionId:a.session.id,nextSessionId:b.session.id,previousHash:a.sourceHash,nextHash:b.sourceHash,ruleHash:hash(source.rule),terminalPos:a.session.terminalPos,previousDay:cashReportRowDay(a.session.closedAt),nextDay:cashReportRowDay(b.session.closedAt),previousOperator:a.session.openedByName||'Χωρίς καταγεγραμμένο χειριστή',nextOperator:b.session.openedByName||'Χωρίς καταγεγραμμένο χειριστή',previousOpenedAt:iso(a.session.openedAt),previousClosedAt:iso(a.session.closedAt),nextOpenedAt:iso(b.session.openedAt),nextClosedAt:iso(b.session.closedAt),previousClosingCents:closing,nextOpeningCents:opening,differenceCents:opening-closing};
  q.fingerprint=fingerprint(q);question.parse(q);questions.set(q.id,q);current.add(q.id);
  if(questions.size>500)return limited();
 }
 const replies=new Map(),counts=new Map();
 for(const r of records.filter(r=>r.data.kind==='HANDOFF_ISSUE'&&[r.data.previousSessionId,r.data.nextSessionId].some(id=>selected.has(id)))){
  const p=question.safeParse(r.proof?.handoffQuestion),q=p.data,d=r.data;
  if(!p.success||q.id!==handoffIssueId(source.store.id,q.previousSessionId,q.nextSessionId)||q.fingerprint!==fingerprint(q)||d.issueId!==q.id||d.previousSessionId!==q.previousSessionId||d.nextSessionId!==q.nextSessionId||d.previousHash!==q.previousHash||d.nextHash!==q.nextHash||d.issueFingerprint!==q.fingerprint)throw reconcileError('CASH_RECONCILIATION_INVALID_HISTORY');
  if(!current.has(q.id))questions.set(q.id,q);
  if(questions.size>500)return limited();
  counts.set(q.id,(counts.get(q.id)||0)+1);replies.set(q.id,reply.parse({id:r.id,decision:d.status,note:d.note,actorName:r.actorName,createdAt:iso(r.createdAt),fingerprint:q.fingerprint}));
 }
 if(!questions.size)return undefined;
 if([...replies.values()].reduce((n,r)=>n+r.note.length,0)>60000)return limited();
 return handoffRegisterSchema.parse({version:1,status:'AVAILABLE',limit:500,issues:[...questions.values()].map(q=>{const lastReply=replies.get(q.id)||null,exists=current.has(q.id);return {...q,current:exists,status:exists&&(!lastReply||lastReply.fingerprint===q.fingerprint)?lastReply?.decision||'OPEN':'RECHECK_REQUIRED',lastReply,repliesCount:counts.get(q.id)||0};}).sort((a,b)=>a.previousClosedAt.localeCompare(b.previousClosedAt)||a.id.localeCompare(b.id))});
}
export function assertHandoffIssues(report){
 const mismatches=report.rows.filter(r=>r.handoffIssueIds?.length).flatMap(r=>(r.automaticAudit?.checks||[]).filter(c=>c.status==='MISMATCH'&&['PREVIOUS_HANDOFF','NEXT_HANDOFF'].includes(c.code)).map(c=>({row:r,check:c})));
 if(report.handoffRegister===undefined){if(report.rows.some(r=>r.handoffIssueIds?.length))throw Error('Handoff register missing.');return;}
 const register=handoffRegisterSchema.parse(report.handoffRegister);
 if(register.status==='LIMITED'){if(register.issues.length)throw Error('Invalid limited handoffs.');return;}
 const seen=new Set();
 for(const q of register.issues){
  if(seen.has(q.id)||q.id!==handoffIssueId(report.storeId,q.previousSessionId,q.nextSessionId)||q.fingerprint!==fingerprint(q)||!report.rows.some(r=>[q.previousSessionId,q.nextSessionId].includes(r.sessionId)))throw Error('Handoff identity changed.');seen.add(q.id);
  if((q.lastReply===null)!==(q.repliesCount===0))throw Error('Handoff history changed.');
  const expected=q.current&&(!q.lastReply||q.lastReply.fingerprint===q.fingerprint)?q.lastReply?.decision||'OPEN':'RECHECK_REQUIRED';if(q.status!==expected)throw Error('Handoff decision changed.');
  if(!q.current)continue;
  for(const r of report.rows.filter(r=>[q.previousSessionId,q.nextSessionId].includes(r.sessionId))){
   const previous=r.sessionId===q.previousSessionId,check=r.automaticAudit?.checks.find(c=>c.code===(previous?'NEXT_HANDOFF':'PREVIOUS_HANDOFF'));
   if(r.terminalPos!==q.terminalPos||r.sourceHash!==(previous?q.previousHash:q.nextHash)||iso(r.openedAt)!==(previous?q.previousOpenedAt:q.nextOpenedAt)||iso(r.closedAt)!==(previous?q.previousClosedAt:q.nextClosedAt)||r.operatorName!==(previous?q.previousOperator:q.nextOperator)||!check||check.status!=='MISMATCH'||check.differenceCents!==q.differenceCents)throw Error('Handoff source changed.');
  }
 }
 for(const row of report.rows)for(const id of row.handoffIssueIds||[])if(!register.issues.some(q=>q.current&&q.id===id&&[q.previousSessionId,q.nextSessionId].includes(row.sessionId)))throw Error('Handoff reference omitted.');
 for(const {row,check}of mismatches)if(!register.issues.some(q=>q.current&&(check.code==='NEXT_HANDOFF'?q.previousSessionId===row.sessionId:q.nextSessionId===row.sessionId)&&q.differenceCents===check.differenceCents))throw Error('Handoff omitted.');
}
const money=v=>(v/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export function handoffIssueText(register){
 if(!register)return [];
 if(register.status==='LIMITED')return ['','ΑΠΑΝΤΗΣΕΙΣ ΠΑΡΑΔΟΣΕΩΝ ΒΑΡΔΙΑΣ','Ο κατάλογος παραδόσεων είναι περιορισμένος. Επίλεξε μικρότερη περίοδο.'];
 return ['','ΑΠΑΝΤΗΣΕΙΣ ΠΑΡΑΔΟΣΕΩΝ ΒΑΡΔΙΑΣ',...register.issues.flatMap(q=>[`${q.previousDay} · ${q.previousOperator} (${q.previousSessionId}) → ${q.nextDay} · ${q.nextOperator} (${q.nextSessionId}) · ${q.terminalPos}: λήξη ${money(q.previousClosingCents)}, έναρξη ${money(q.nextOpeningCents)}, απόκλιση ${money(q.differenceCents)} · ${issueStatusLabel[q.status]}.`,...(q.lastReply?[`Απάντηση ${q.lastReply.actorName} · ${q.lastReply.createdAt}: ${q.lastReply.note}`]:[]),...(!q.current?['Προηγούμενη παράδοση: διατηρείται το ιστορικό, η τρέχουσα πηγή χρειάζεται επανέλεγχο.']:[])]),'Η απάντηση αφορά την εκκρεμότητα· δεν μεταβάλλει τα ποσά, δεν συμψηφίζει και δεν επιβεβαιώνει φυσική συμφωνία.'];
}
