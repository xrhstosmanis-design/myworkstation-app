import {exactCents,hash} from './cash-reconciliation-contract.js';

const normalized=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase('el-GR').trim().replace(/\s+/g,' ');
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'});
function day(value){
 if(!value)return null;const d=new Date(value);if(!Number.isFinite(+d))return null;
 const p=Object.fromEntries(formatter.formatToParts(d).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;
}
const months=[['ΙΑΝΟΥΑΡΙΟΣ','ΙΑΝΟΥΑΡΙΟΥ'],['ΦΕΒΡΟΥΑΡΙΟΣ','ΦΕΒΡΟΥΑΡΙΟΥ'],['ΜΑΡΤΙΟΣ','ΜΑΡΤΙΟΥ'],['ΑΠΡΙΛΙΟΣ','ΑΠΡΙΛΙΟΥ'],['ΜΑΙΟΣ','ΜΑΙΟΥ'],['ΙΟΥΝΙΟΣ','ΙΟΥΝΙΟΥ'],['ΙΟΥΛΙΟΣ','ΙΟΥΛΙΟΥ'],['ΑΥΓΟΥΣΤΟΣ','ΑΥΓΟΥΣΤΟΥ'],['ΣΕΠΤΕΜΒΡΙΟΣ','ΣΕΠΤΕΜΒΡΙΟΥ'],['ΟΚΤΩΒΡΙΟΣ','ΟΚΤΩΒΡΙΟΥ'],['ΝΟΕΜΒΡΙΟΣ','ΝΟΕΜΒΡΙΟΥ'],['ΔΕΚΕΜΒΡΙΟΣ','ΔΕΚΕΜΒΡΙΟΥ']];
function partialDate(value){
 const s=normalized(value),numeric=s.match(/^(\d{1,2})[/.-](\d{1,2})$/),greek=s.match(/^(\d{1,2}) ([Α-Ω]+)$/);
 const d=Number(numeric?.[1]||greek?.[1]),m=numeric?Number(numeric[2]):greek?months.findIndex(names=>names.includes(greek[2]))+1:0;
 if(!d||!m||m>12||d>new Date(Date.UTC(2000,m,0)).getUTCDate())return null;
 return `${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function field(line){
 const typed={OPENING_CASH:'openingOperational',CLOSING_CASH:'actualOperational',POS:'cardSales',EFTPOS:'eftposTotal'};
 if(typed[line.kind])return typed[line.kind];
 if(!['OTHER','EXPENSE'].includes(line.kind))return null;
 let label=normalized(line.label),amount=normalized(line.amountText);
 if(amount&&label.endsWith(amount))label=label.slice(0,-amount.length).trim();
 label=label.replace(/[.\/\s:]/g,'');
 if(line.kind==='EXPENSE')return ['ΕΞΟΔΑ','ΣΥΝΟΛΟΕΞΟΔΩΝ'].includes(label)?'expenses':null;
 if(['ΑΡΧ','ΑΡΧΙΚΟ','ΑΡΧΙΚΟΤΑΜΕΙΟ','ΑΡΧΤΑΜ','ΑΡΧΤΑΜΕΙΟΥ','ΑΡΧΤΑΜΕΙΟ','ΑΡΧΤ'].includes(label))return 'openingOperational';
 if(line.kind==='EXPENSE')return ['ΕΞΟΔΑ','ΣΥΝΟΛΟΕΞΟΔΩΝ'].includes(label)?'expenses':null;
 return {POS:'cardSales',EFTPOS:'eftposTotal',ΕΞΟΔΑ:'expenses',ΣΥΝΟΛΟΕΞΟΔΩΝ:'expenses'}[label]||null;
}

// Suggestions only: never replace timed corroboration, printed dates, financial
// evidence coverage or human review. Each section needs two distinct exact fields.
export function handwrittenShiftCandidates({scope,extraction,originals,selectedIds,modelDocumentDate=null}){
 if(modelDocumentDate!==null&&modelDocumentDate!==extraction.documentDate)return [];
 const printedDate=extraction.documentDate,partial=printedDate?null:extraction.documentDate===null?partialDate(extraction.dateText):null;
 if(!printedDate&&!partial)return [];
 const starts=[];extraction.lines.forEach((line,index)=>{if(field(line)==='openingOperational')starts.push(index);});
 const selected=new Set(selectedIds),result=[];
 for(let section=0;section<starts.length;section++){
  const from=starts[section],to=starts[section+1]??extraction.lines.length,opening=extraction.lines[from];
  if(opening.requiresReview||opening.uncertain||!Number.isSafeInteger(opening.amountCents)||opening.amountCents<=0)continue;
  const fields=new Map();let conflict=false;
  for(let index=from;index<to;index++){
   const line=extraction.lines[index],key=field(line);if(!key)continue;
   if(line.requiresReview||line.uncertain||line.quantityText!==null||line.timeText!==null||!Number.isSafeInteger(line.amountCents)){conflict=true;break;}
   if(fields.has(key)){conflict=true;break;}fields.set(key,{field:key,line:index,amountCents:line.amountCents});
  }
  if(conflict||fields.size<2||![...fields.values()].some(f=>f.field!=='openingOperational'&&f.amountCents>0))continue;
  const candidates=originals.filter(original=>{
   const s=original.session,opened=day(s.openedAt),closed=day(s.closedAt);
   if(s.companyId!==scope.companyId||s.storeId!==scope.storeId||s.status!=='CLOSED'||!s.id||!s.terminalPos||!original.sourceHash||!opened||!closed||new Date(s.closedAt)<new Date(s.openedAt))return false;
   if(printedDate?opened!==printedDate:opened.slice(5)!==partial)return false;
   return [...fields.values()].every(f=>exactCents(s[f.field]??original.automaticSnapshot?.[f.field])===f.amountCents);
  });
  if(candidates.length!==1)continue;
  const original=candidates[0],s=original.session;
  result.push({status:'UNVERIFIED_CANDIDATE',reason:'JOINT_SECTION_FIELDS',fromLine:from,toLine:to-1,sessionId:s.id,sourceHash:original.sourceHash,ledgerEvidenceHash:hash({session:s,automaticSnapshot:original.automaticSnapshot||null}),operatorName:s.openedByName||null,terminalPos:s.terminalPos,openedAt:s.openedAt,closedAt:s.closedAt,candidateDate:day(s.openedAt),dateBasis:printedDate?'PRINTED_DATE':'LEDGER_DAY_MONTH_CANDIDATE',selected:selected.has(s.id),proof:[...fields.values()],financialAdjustmentCents:0,humanApproval:false});
 }
 // Two physical sections cannot silently claim the same shift.
 return result.filter(candidate=>result.filter(other=>other.sessionId===candidate.sessionId).length===1);
}
