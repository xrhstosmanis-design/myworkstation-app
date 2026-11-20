import {automaticReviewedMailText} from './automatic-report-cash-payload.js';

// Presentation of an already-bound CASH payload only. Never changes the stored
// JSON, its fingerprint, source amounts, recipient or delivery identity.
const fail=()=>{throw Object.assign(new Error('Invalid cash mail presentation.'),{code:'INVALID_CASH_MAIL_PRESENTATION'})};
const check=value=>{if(!value)fail()};
const label=value=>{check(typeof value==='string'&&value.trim()&&value.length<=1000&&!/[\u0000-\u001f\u007f\u2028\u2029]/.test(value));return value};
function operatorName(value){
 if(value==null)return 'Χωρίς καταγεγραμμένο όνομα';
 // Canonical payloads permit blank recorded names. Controls remain invalid,
 // including whitespace controls; do not relax store/subject label validation.
 check(typeof value==='string'&&value.length<=1000&&!/[\u0000-\u001f\u007f\u2028\u2029]/.test(value));
 return value.trim()?value:'Χωρίς καταγεγραμμένο όνομα';
}
const moneyCents=value=>{check(typeof value==='number'&&Number.isFinite(value));const n=Math.round(value*100);check(Number.isSafeInteger(n)&&Math.abs(value-n/100)<=1e-9);return n};
const add=(a,b)=>{const n=a+b;check(Number.isSafeInteger(n));return n};
const integers=new Intl.NumberFormat('el-GR',{maximumFractionDigits:0});
const money=(n,signed=false)=>{const value=BigInt(n),absolute=value<0n?-value:value;return `${value<0n?'−':signed&&value>0n?'+':''}${integers.format(absolute/100n)},${String(absolute%100n).padStart(2,'0')} €`};
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Athens',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function instant(value){check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value);return value}
const local=value=>{const p=Object.fromEntries(clock.formatToParts(new Date(instant(value))).map(v=>[v.type,v.value]));return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`};
function day(value){check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value);return value.split('-').reverse().join('/')}
const frequencies={DAILY:'Ημερήσια',WEEKLY:'Εβδομαδιαία',MONTHLY:'Μηνιαία'};

export function automaticCashMailPresentation(content){
 check(content?.format==='MWS_AUTOMATIC_CASH_PAYLOAD_V1'&&Object.hasOwn(frequencies,content.frequency));
 check(content.financialFinality==='PROVISIONAL'&&content.financialReconciliationComplete===false&&content.employeeLiabilityAdjusted===false);
 const store=label(content.storeName),from=local(content.period?.from),to=local(content.period?.to);
 check(content.period.from<content.period.to&&Number.isSafeInteger(content.sourceCount)&&content.sourceCount>0&&content.sourceCount<=1000);
 const frequency=frequencies[content.frequency],turnover=Boolean(content.dailyTurnover);
 const shortStore=store.length>160?store.slice(0,159)+'…':store;
 const subject=`Προσωρινή ${frequency.toLocaleLowerCase('el-GR')} αναφορά ταμείων${turnover?' ΚΑΙ ΤΖΙΡΟΥ':''} · ${shortStore} · ${from.slice(0,10)}`;
 // Retain the separately validated reviewed evidence renderer byte-for-byte.
 if(Object.hasOwn(content,'reviewedCash'))return Object.freeze({subject,text:automaticReviewedMailText(content)});
 check(Array.isArray(content.groups)&&content.groups.length>0&&content.groups.length<=1000);
 const lines=[`${frequency} αναφορά ταμείων`,store,`Περίοδος: ${from} – ${to} (ώρα Ελλάδας)`,`Καταγεγραμμένες βάρδιες: ${content.sourceCount}`,'Προσωρινή ενημέρωση — η οικονομική συμφωνία εκκρεμεί.'];
 let count=0;const seen=new Set();
 for(const group of content.groups){
  const terminal=label(group.terminalPos),date=day(group.day);
  check(['STORE','DELIVERY'].includes(group.cashChain)&&Array.isArray(group.rows)&&group.rows.length>0&&group.rows.length<=1000);
  lines.push('',`${date} · Ταμείο ${terminal}${group.cashChain==='DELIVERY'?' · Διανομή':''}`);
  let shortage=0,surplus=0;const records=[];
  for(const row of group.rows){
   check(++count<=1000&&typeof row.sessionId==='string'&&row.sessionId.length>0&&!seen.has(row.sessionId));seen.add(row.sessionId);
   const name=operatorName(row.employeeName),variance=moneyCents(row.variance);
   const short=Math.max(0,-variance),extra=Math.max(0,variance);shortage=add(shortage,short);surplus=add(surplus,extra);
   records.push(`Χειριστής ανοίγματος: ${name} — διαφορά ${money(variance,true)} (${variance<0?'έλλειμμα':variance>0?'πλεόνασμα':'χωρίς διαφορά'})`);
  }
  check(moneyCents(group.originalShortage)===shortage&&moneyCents(group.originalSurplus)===surplus&&moneyCents(group.offset)===Math.min(shortage,surplus)&&moneyCents(group.netVariance)===surplus-shortage);
  lines.push(`Αρχικά σύνολα: έλλειμμα ${money(shortage)} · πλεόνασμα ${money(surplus)} · διαφορά ${money(surplus-shortage,true)}`,...records,
   `Πιθανός συμψηφισμός: ${money(Math.min(shortage,surplus))} — ενημερωτικός μόνο, δεν έχει εφαρμοστεί και δεν κατανέμεται σε εργαζομένους.`);
 }
 check(count===content.sourceCount);
 lines.push('','Εκκρεμότητες ελέγχου',
  'ΠΡΟΣΩΡΙΝΗ ΑΝΑΦΟΡΑ — Δεν αποτελεί ολοκληρωμένη οικονομική συμφωνία.',
  'Δεν έχουν επαληθευτεί η συμφωνία παραστατικών και πληρωμών, οι αιτιολογίες ελέγχου και τα φυσικά υπόλοιπα ταμείων.',
  'Οι αρχικές διαφορές διατηρούνται. Δεν γίνεται μεταφορά ή καταλογισμός ευθύνης εργαζομένου.');
 const text=lines.join('\n');check(Buffer.byteLength(text,'utf8')<=2*1024*1024);
 return Object.freeze({subject,text});
}
