import {normalizeLifecycleGeneration} from './store-lifecycle-generation.js';
import {z} from 'zod';
import {periodSchema} from './cash-reconciliation-contract.js';
import {reconciliationText} from './cash-reconciliation-report.js';
import {businessQuestionPeriod,businessPeriodRemainder} from './assistant-business-period.js';
import {normalizeBusinessText,businessQuestionParts} from '../../../shared/assistant-business.mjs';
import {reviewedCashKind,reviewedCashToolName,reviewedCashQuestion,reviewedCashAnswer} from '../../../shared/assistant-reviewed-cash.mjs';
function validGeneration(v){try{return normalizeLifecycleGeneration(v)!==null}catch{return false}}
const validScope=s=>s&&!s.supportPreview&&['companyId','storeId'].every(k=>typeof s[k]==='string'&&s[k].length>0&&s[k].length<=180&&s[k]===s[k].trim()&&!/[\u0000-\u001f\u007f]/.test(s[k]));
export const reviewedCashArguments=periodSchema;
export const reviewedCashSourceArguments=z.object({from:z.string(),to:z.string(),generation:z.string().refine(validGeneration).optional(),reportHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),head:z.union([z.literal('ROOT'),z.string().regex(/^[a-f0-9]{64}$/)]).optional()}).strict().superRefine((v,c)=>{if(!periodSchema.safeParse({from:v.from,to:v.to}).success)c.addIssue({code:'custom',message:'Invalid cash report period'});const count=['generation','reportHash','head'].filter(k=>v[k]!==undefined).length;if(count!==0&&count!==3)c.addIssue({code:'custom',message:'Incomplete original cash source receipt'});});
export const reviewedCashTool={type:'function',name:reviewedCashToolName,strict:true,description:'Διαβάζει αυτούσια την κοινή αναφορά ελέγχου ταμείων με επανυπολογισμούς, επιβεβαιωμένους συμψηφισμούς και εκκρεμότητες ΜΟΝΟ στο ήδη επιλεγμένο εξουσιοδοτημένο κατάστημα. from/to συγκεκριμένες ημερομηνίες κλεισίματος YYYY-MM-DD, ώρα Ελλάδας, έως31 ημέρες. Χωρίς σαφή περίοδο ζήτησε διευκρίνιση. Δεν επιλέγει εταιρεία/κατάστημα/χειριστή και δεν εκτελεί μεταβολές, ανάγνωση AI ή αποστολή. Κράτησε ακριβώς την αναγνωσμένη αναφορά, χωρίς νέο υπολογισμό ή καταλογισμό.',parameters:{type:'object',additionalProperties:false,properties:{from:{type:'string'},to:{type:'string'}},required:['from','to']}};
const fail=(status=502)=>{throw Object.assign(new Error('Δεν διαβάστηκε η τρέχουσα αναφορά ελέγχου ταμείων. Ανανέωσε την ίδια αναζήτηση.'),{status,code:'ASSISTANT_REVIEWED_CASH_UNAVAILABLE'})};
const cents=v=>v===null||Number.isSafeInteger(v)&&Math.abs(v)<=99999999900;
const validRow=r=>r&&typeof r.sessionId==='string'&&r.sessionId.length>0&&typeof r.day==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(r.day)&&typeof r.shiftLabel==='string'&&typeof r.operatorName==='string'&&cents(r.initialCents)&&cents(r.remainingCents)&&cents(r.cardCents)&&Number.isSafeInteger(r.offsetCents)&&r.offsetCents>=0&&typeof r.reviewed==='boolean'&&(r.status==='REVIEWED')===r.reviewed&&['NOT_APPLICABLE','RECHECK_REQUIRED','AWAITING_NEXT_SHIFT','AWAITING_REVIEW','REVIEWED'].includes(r.status)&&(!r.reviewed||r.status==='REVIEWED'&&r.remainingCents!==null&&typeof r.reviewedBy==='string'&&r.reviewedBy.length>0);
const clarification=()=>({answer:'Γράψε σαφή περίοδο έως 31 ημέρες για τον έλεγχο όλων των βαρδιών του επιλεγμένου καταστήματος, π.χ. «Έλεγχος ταμείων από 20/10/2026 έως 23/10/2026».',highlights:[],sources:[],limitations:'Πρόσθετο φίλτρο χειριστή, ποσού ή συγκριτική περίοδος δεν παραλείπεται σιωπηρά.'});
const words=new Set('ελενξε ελεγξε ελεγχος ελεγχο ελεγχου ελεγχον ταμεια ταμειο ταμειων ταμειου μετρητα μετρητων pos eftpos cash διαφορα διαφορες διαφορων ελλειμμα ελλειμματα ελλειμματων πλεονασμα πλεονασματα πλεονασματων βγαλε δωσε δειξε μου θελω κανε αναφορα αναφορες αναφορας αναλυση αναλυσεις αποτελεσμα αποτελεσματα μετα απο τον την το τα τις οι στην στον στο σε για εως μεχρι και σημερα χθες προχθες συνολο συνολικη συνολικο συνολικα αναλυτικη αναλυτικα ανα ημερα υπαλληλο υπαλληλους εργαζομενο εργαζομενους ολες ολων βαρδιες βαρδιων βαρδιας βαρδια επιλεγμενο επιλεγμενου καταστημα καταστηματος αυτη αυτης αυτον αυτο αυτου τρεχουσα τρεχοντα τρεχοντος προηγουμενη προηγουμενο προηγουμενου προηγουμενης περασμενη περασμενο περασμενου περασμενης εβδομαδα εβδομαδας μηνα μηνας μηνο χρονια χρονο χρονου ετος ετους φετος περσι περυσι τελευταιες τελευταιων ημερες ημερων μερες μερων επανυπολογισμο επανυπολογισμους επανυπολογισμων συμψηφισμο συμψηφισμους συμψηφισμων με τους των της του τελικη τελικο τελικα excel xlsx csv pdf word docx'.split(' '));
export function reviewedCashRequest(question,{now=new Date()}={}){
 if(!reviewedCashQuestion(question))return null;
 const period=businessQuestionPeriod(question,{now}),parsed=reviewedCashArguments.safeParse(period);
 const p=businessQuestionParts(question),remainder=businessPeriodRemainder([p.current,p.topic,p.period].join(' ')),tokens=normalizeBusinessText(remainder).replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(Boolean);
 if(!parsed.success||!tokens.every(w=>words.has(w)))return {clarification:clarification()};
 return {args:parsed.data};
}
export function reviewedCashEvidence(report,scope,period){
 if(!validScope(scope)||!report||report.storeId!==scope.storeId||report.period?.from!==period.from||report.period?.to!==period.to||report.coverage!=='BOUNDED_CLOSED_SHIFTS'||report.financialFinality!=='REVIEWED_CASH_ROWS_ONLY'||report.originalFinancialLedgerChanged!==false||typeof report.storeName!=='string'||!report.storeName||!validGeneration(report.generation)||!Array.isArray(report.rows)||report.rows.length>200||report.rows.some(r=>!validRow(r)||r.day<period.from||r.day>period.to)||new Set(report.rows.map(r=>r.sessionId)).size!==report.rows.length||!Array.isArray(report.employees)||!report.totals||!['shortageCents','surplusCents','pending'].every(k=>Number.isSafeInteger(report.totals[k])&&report.totals[k]>=0)||!Array.isArray(report.checkpoint?.pendingNotes||[])||typeof report.text!=='string'||report.text.length>150000)fail();
 try{if(report.text!==reconciliationText(report))fail();}catch{fail();}
 if(!/^[a-f0-9]{64}$/.test(report.reportHash)||(report.head!=='ROOT'&&!/^[a-f0-9]{64}$/.test(report.head)))fail();
 return {kind:reviewedCashKind,source:'Έλεγχος ταμείων',scope:'OWNER_SELECTED_STORE',companyId:scope.companyId,companyName:scope.companyName,storeId:scope.storeId,storeName:report.storeName,from:period.from,to:period.to,date:period.from,timeZone:'Europe/Athens',closedShiftsOnly:true,financialFinality:report.financialFinality,rows:[],totalRows:report.rows.length,truncated:false,text:report.text,reportHash:report.reportHash,generation:report.generation,head:report.head,asOf:report.checkedAt||null};
}
export async function readAssistantReviewedCash(req,value,scope,{fetchImpl=fetch,port=process.env.PORT||8080,signal}={}){
 const receipt=reviewedCashSourceArguments.parse(value),args={from:receipt.from,to:receipt.to},authorization=req.headers?.authorization,validPort=String(port);
 if(!validScope(scope))fail(403);
 if(typeof authorization!=='string'||!/^Bearer \S+$/.test(authorization))fail(401);
 if(!/^\d{1,5}$/.test(validPort)||Number(validPort)<1||Number(validPort)>65535)fail(503);
 signal?.throwIfAborted();let response,report;
 try{response=await fetchImpl(`http://127.0.0.1:${validPort}/api/cash-reconciliation/stores/${encodeURIComponent(scope.storeId)}?${new URLSearchParams(args)}`,{method:'GET',headers:{Authorization:authorization},redirect:'error',signal});if(!response.ok)fail([401,403,404,409].includes(response.status)?response.status:502);report=await response.json();}catch(error){signal?.throwIfAborted();fail([401,403,404,409].includes(error?.status)?error.status:502);}
 signal?.throwIfAborted();if(receipt.generation!==undefined&&(report.generation!==receipt.generation||report.reportHash!==receipt.reportHash||report.head!==receipt.head))fail(409);return reviewedCashEvidence(report,scope,args);
}
export function canonicalReviewedCashResult(report,args){
 const answer=reviewedCashAnswer([report]);if(!answer||!answer.canonicalCash)fail();return {response:{ok:true},raw:{status:'completed',output_text:JSON.stringify(answer)},evidence:[report],reads:[{name:reviewedCashToolName,args:{...args,generation:report.generation,reportHash:report.reportHash,head:report.head}}]};
}
// Only this server-created identity may bypass the evidence-required guard for
// a clarification. Provider JSON cannot create an entry in this WeakMap.
const clarifications=new WeakMap();
export function reviewedCashClarificationResult(answer){const raw={status:'completed',output_text:JSON.stringify(answer)};clarifications.set(raw,answer);return {response:{ok:true},raw,evidence:[],reads:[]};}
export const canonicalCashClarification=raw=>raw&&typeof raw==='object'?clarifications.get(raw)||null:null;
