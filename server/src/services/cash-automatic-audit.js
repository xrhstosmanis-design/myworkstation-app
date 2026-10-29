import {z} from 'zod';
import {hash,exactCents} from './cash-reconciliation-contract.js';

// Calculation is not a human approval or a financial write. Open questions are
// deliberately independent of whether the recorded arithmetic can be checked.
const cents=z.number().int().safe().nullable();
const check=z.object({code:z.enum(['OPENING','CLOSING','CASH_SALES','EXPENSES','CASH_LEDGER','CASH_VARIANCE','CARD_LEDGER','CARD_VARIANCE','PREVIOUS_HANDOFF','NEXT_HANDOFF']),status:z.enum(['MATCHED','MISMATCH','UNAVAILABLE','NOT_APPLICABLE','AWAITING_NEXT_SHIFT']),differenceCents:cents}).strict();
export const automaticCashAuditSchema=z.object({version:z.literal(1),status:z.enum(['CALCULATED','INCOMPLETE','NOT_APPLICABLE']),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),cashVarianceCents:cents,bankCardVarianceCents:cents,irisCents:cents,checks:z.array(check).max(10),openIssues:z.array(z.enum(['SOURCE_INCOMPLETE','SOURCE_CHANGED','UNKNOWN_TRANSACTION','IRIS_CHANNEL_REQUIRES_CHECK','PREVIOUS_HANDOFF_MISMATCH','NEXT_HANDOFF_MISMATCH','AWAITING_NEXT_SHIFT','SAFE_MOVEMENT_REQUIRES_DOCUMENT'])).max(8),financialAdjustmentCents:z.literal(0),humanApproval:z.literal(false)}).strict();
const cashTypes=new Set(['SALE_CASH','CUSTOMER_RECEIPT_CASH']);
const cardTypes=new Set(['SALE_CARD','CUSTOMER_RECEIPT_CARD']);
const expenseTypes=new Set(['SUPPLIER_PAYMENT','OTHER_EXPENSE']);
const knownTypes=new Set([...cashTypes,...cardTypes,...expenseTypes,'SALE_IRIS','SALE_CREDIT','TRANSFER_AMOUNT','TRANSFER_OUT','SAFE_ADJUSTMENT']);
const sum=values=>values.every(Number.isSafeInteger)&&Number.isSafeInteger(values.reduce((a,b)=>a+b,0))?values.reduce((a,b)=>a+b,0):null;
const at=value=>value==null?NaN:new Date(value).getTime();
const same=(a,b)=>a&&b&&a.companyId===b.companyId&&a.storeId===b.storeId&&a.terminalPos===b.terminalPos;

export function assessAutomaticCash({session,transactions,previous=null,next=null,rule,sourceValid=true}){
 const checks=[],issues=new Set();
 const issue=code=>issues.add(code);
 const compare=(code,left,right)=>{
  const difference=Number.isSafeInteger(left)&&Number.isSafeInteger(right)?sum([left,-right]):null;
  checks.push({code,status:difference===null?'UNAVAILABLE':difference===0?'MATCHED':'MISMATCH',differenceCents:difference});
 };
 const value=key=>exactCents(session?.[key]);
 const fingerprint=hash({version:1,session,transactions,previous,next,rule,sourceValid});
 const finish=(status,cash=null,card=null,iris=null)=>automaticCashAuditSchema.parse({version:1,status,fingerprint,cashVarianceCents:cash,bankCardVarianceCents:card,irisCents:iris,checks,openIssues:[...issues],financialAdjustmentCents:0,humanApproval:false});
 if(!['FULL','DIFFERENCE_ONLY','POS_EFTPOS_ONLY'].includes(rule?.mode)||rule.mode==='FULL'&&typeof rule.carryOverEnabled!=='boolean'){issue('SOURCE_INCOMPLETE');return finish('INCOMPLETE');}
 if(rule?.mode==='POS_EFTPOS_ONLY')return finish('NOT_APPLICABLE');
 if(!session?.id||!session.companyId||!session.storeId||!session.terminalPos||session.status!=='CLOSED'||!Number.isFinite(at(session.openedAt))||!Number.isFinite(at(session.closedAt))||at(session.closedAt)<at(session.openedAt)||!Array.isArray(transactions)||transactions.length>500){issue('SOURCE_INCOMPLETE');return finish('INCOMPLETE');}
 if(!sourceValid)issue('SOURCE_CHANGED');
 compare('OPENING',sum(['openingDrawer','openingCustody','openingCoins'].map(value)),value('openingOperational'));
 compare('CLOSING',sum(['closingDrawer','closingCustody','closingCoins'].map(value)),value('actualOperational'));
 const ledger={cash:0,card:0,iris:0,expenses:0,in:0,out:0};let valid=true;
 const ids=new Set();
 for(const t of transactions){
  if(!t?.id||ids.has(t.id)||t.companyId!==session.companyId||t.storeId!==session.storeId||t.sessionId!==session.id){valid=false;continue;}ids.add(t.id);
  if(t.reversedAt!=null)continue;
  const amount=exactCents(t.amount);
  if(amount===null||!knownTypes.has(t.type)){valid=false;issue('UNKNOWN_TRANSACTION');continue;}
  let key=cashTypes.has(t.type)?'cash':cardTypes.has(t.type)?'card':t.type==='SALE_IRIS'?'iris':t.type==='TRANSFER_AMOUNT'?'in':t.type==='TRANSFER_OUT'?'out':null;
  if(expenseTypes.has(t.type)){
   if(typeof t.subtractFromShift!=='boolean'){valid=false;continue;}
   if(t.subtractFromShift)key='expenses';
  }
  if(key){ledger[key]=sum([ledger[key],amount]);if(ledger[key]===null)valid=false;}
 }
 const expected=valid?sum([value('openingOperational'),ledger.cash,ledger.in,-ledger.expenses,-ledger.out]):null;
 const cash=expected===null?null:sum([value('actualOperational'),-expected]);
 const pooledCards=valid?sum([ledger.card,ledger.iris]):null;
 compare('CASH_SALES',valid?ledger.cash:null,value('cashSales'));
 compare('EXPENSES',valid?ledger.expenses:null,value('expenses'));
 compare('CASH_LEDGER',expected,value('expectedOperational'));
 compare('CASH_VARIANCE',expected===value('expectedOperational')?cash:null,value('variance'));
 compare('CARD_LEDGER',pooledCards,value('cardSales'));
 compare('CARD_VARIANCE',pooledCards===null||value('eftposTotal')===null?null:sum([pooledCards,-value('eftposTotal')]),value('cardVariance'));
 // The existing closing writer pools IRIS with cards. Do not silently assume
 // the declared EFTPOS total excludes (or includes) IRIS, or alter that writer.
 if(valid&&ledger.iris!==0)issue('IRIS_CHANNEL_REQUIRES_CHECK');
 const bankCard=valid&&ledger.iris===0?sum([ledger.card,value('eftposTotal')===null?null:-value('eftposTotal')]):null;
 if(rule?.mode==='FULL'&&rule.carryOverEnabled===true){
  const handoff=(a,b,code)=>{
   if(!a||!b||!same(a,b)||a.nextSession?.id!==b.id||a.status!=='CLOSED'||!Number.isFinite(at(a.openedAt))||!Number.isFinite(at(a.closedAt))||at(a.closedAt)<at(a.openedAt)||!Number.isFinite(at(b.openedAt))||!Number.isFinite(at(b.closedAt))||at(b.closedAt)<at(b.openedAt)||at(a.closedAt)>at(b.openedAt)){
    checks.push({code,status:'UNAVAILABLE',differenceCents:null});return;
   }
   compare(code,exactCents(b.openingOperational),exactCents(a.actualOperational));
  };
  if(previous)handoff(previous,session,'PREVIOUS_HANDOFF');else checks.push({code:'PREVIOUS_HANDOFF',status:'NOT_APPLICABLE',differenceCents:null});
  if(!next||next.status!=='CLOSED'){
   checks.push({code:'NEXT_HANDOFF',status:'AWAITING_NEXT_SHIFT',differenceCents:null});issue('AWAITING_NEXT_SHIFT');
  }else handoff(session,next,'NEXT_HANDOFF');
  for(const c of checks.filter(c=>c.code.endsWith('_HANDOFF')&&['MISMATCH','UNAVAILABLE'].includes(c.status)))issue(c.code==='PREVIOUS_HANDOFF'?'PREVIOUS_HANDOFF_MISMATCH':'NEXT_HANDOFF_MISMATCH');
 }
 const safeOpen=value('openingSafe'),safeClose=value('closingSafe');
 if(safeOpen!==null&&safeClose!==null&&safeOpen!==safeClose)issue('SAFE_MOVEMENT_REQUIRES_DOCUMENT');
 const numeric=checks.filter(c=>!c.code.endsWith('_HANDOFF'));
 if(!valid||numeric.some(c=>c.status==='UNAVAILABLE'))issue('SOURCE_INCOMPLETE');
 if(numeric.some(c=>c.status==='MISMATCH'))issue('SOURCE_CHANGED');
 const calculated=sourceValid&&valid&&numeric.every(c=>c.status==='MATCHED');
 return finish(calculated?'CALCULATED':'INCOMPLETE',calculated?cash:null,bankCard,valid?ledger.iris:null);
}

const labels={SOURCE_INCOMPLETE:'Λείπουν πλήρη στοιχεία για τον αριθμητικό έλεγχο.',SOURCE_CHANGED:'Οι καταχωρισμένες τιμές δεν συμφωνούν με τις διαθέσιμες κινήσεις· απαιτείται επανέλεγχος.',UNKNOWN_TRANSACTION:'Υπάρχει κίνηση που δεν μπορεί να ταξινομηθεί με ασφάλεια.',IRIS_CHANNEL_REQUIRES_CHECK:'Εκκρεμεί διαχωρισμός IRIS από το δηλωμένο σύνολο EFTPOS.',PREVIOUS_HANDOFF_MISMATCH:'Εκκρεμεί διευκρίνιση της παράδοσης από την προηγούμενη βάρδια.',NEXT_HANDOFF_MISMATCH:'Εκκρεμεί διευκρίνιση της παράδοσης στην επόμενη βάρδια.',AWAITING_NEXT_SHIFT:'Αναμονή κλεισίματος της επόμενης βάρδιας.',SAFE_MOVEMENT_REQUIRES_DOCUMENT:'Εκκρεμούν αποδεικτικά για τη μεταβολή του χρηματοκιβωτίου.'};
export function automaticCashAuditText(audit){
 const a=automaticCashAuditSchema.parse(audit);
 const checks={OPENING:'άθροισμα έναρξης',CLOSING:'άθροισμα λήξης',CASH_SALES:'σύνολο πωλήσεων μετρητών',EXPENSES:'σύνολο εξόδων μετρητών',CASH_LEDGER:'αναμενόμενο ταμείο',CASH_VARIANCE:'καταχωρισμένη διαφορά μετρητών',CARD_LEDGER:'καταχωρισμένο σύνολο καρτών/IRIS',CARD_VARIANCE:'καταχωρισμένη διαφορά καρτών',PREVIOUS_HANDOFF:'παράδοση από προηγούμενη βάρδια',NEXT_HANDOFF:'παράδοση στην επόμενη βάρδια'};
 const mismatches=a.checks.filter(c=>c.status==='MISMATCH').map(c=>`Εκκρεμότητα: ${checks[c.code]} · απόκλιση ${c.differenceCents>0?'+':'−'}${(Math.abs(c.differenceCents)/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'})}.`);
 return [a.status==='CALCULATED'?'Ο αυτόματος αριθμητικός έλεγχος των καταχωρισμένων κινήσεων ολοκληρώθηκε.':a.status==='NOT_APPLICABLE'?'Δεν εφαρμόζεται αυτόματος έλεγχος μετρητών.':'Ο αυτόματος αριθμητικός έλεγχος παραμένει ελλιπής.',...mismatches,...a.openIssues.map(code=>'Εκκρεμότητα: '+labels[code])];
}
