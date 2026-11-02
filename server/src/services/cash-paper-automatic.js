import {handwrittenShiftCandidates} from './cash-paper-shift-candidates.js';
import {z} from 'zod';
import {periodSchema,hash,transactionMatchesPaper,exactCents} from './cash-reconciliation-contract.js';
import {paperError,normalizePaper} from './cash-paper-contract.js';

export const automaticPaperRequest=z.object({generation:z.string().regex(/^(0|[1-9][0-9]{0,18})$/),period:periodSchema}).strict();
const discoveryStatuses=new Set(['AWAITING_READING','NO_ATTACHMENTS_IN_DISCOVERY','LIMITED','UNAVAILABLE']);
const text=v=>typeof v==='string'?v.trim():'';
const normalized=v=>text(v).normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase('el-GR').replace(/\s+/g,' ');
const operatorMatches=(printed,recorded)=>{const a=normalized(printed),b=normalized(recorded);if(!a)return true;if(a===b&&a.split(' ').some(word=>/\p{L}{2}/u.test(word)))return true;const words=new Set(b.split(' '));return Boolean(b)&&a.split(' ').every(word=>word.length>=2&&words.has(word));};
const validSource=s=>s&&typeof s.sourceId==='string'&&/^[a-f0-9]{64}$/.test(s.checksum||'')&&Array.isArray(s.references)&&s.references.length>0&&s.references.every(r=>text(r.messageId));
export const automaticPaperByteLimit=25*1024*1024;
// Metadata-only admission before any original bytes or paid extraction. Missing
// sizes are unavailable evidence, never zero-byte sources or a complete scan.
export function boundAutomaticPaperDiscovery(discovery){
 const sources=discovery?.sources;
 const unavailable=reason=>({...discovery,status:'UNAVAILABLE',sources:[],reason});
 if(!Array.isArray(sources)||sources.some(s=>!Number.isSafeInteger(s?.sizeBytes)||s.sizeBytes<=0))return unavailable('ATTACHMENT_SIZE_UNAVAILABLE');
 let bytes=0;for(const source of sources){bytes+=source.sizeBytes;if(!Number.isSafeInteger(bytes)||bytes>automaticPaperByteLimit)return unavailable('ATTACHMENT_BYTE_LIMIT');}
 if(sources.length>50)return unavailable('ATTACHMENT_BYTE_LIMIT');
 return discovery;
}
export function automaticPaperCoverage(discovery,sources){
 const snapshot=discovery?.sources;
 const valid=discoveryStatuses.has(discovery?.status)&&Array.isArray(snapshot)&&Array.isArray(sources)&&sources.length<=50&&sources.every(validSource)&&new Set(sources.map(s=>s.checksum)).size===sources.length&&snapshot.length===sources.length&&snapshot.every(s=>validSource(s)&&sources.some(p=>p.sourceId===s.sourceId&&p.checksum===s.checksum));
 const discoveryComplete=valid&&['AWAITING_READING','NO_ATTACHMENTS_IN_DISCOVERY'].includes(discovery.status)&&((discovery.status==='NO_ATTACHMENTS_IN_DISCOVERY')===(sources.length===0));
 return {scope:'SUPPORTED_STORE_CHAT_ATTACHMENTS',discoveryComplete,limited:!discoveryComplete,sourceCount:Array.isArray(sources)?sources.length:0};
}
// Each explicit request dispatches at most one durable reader operation. Report
// GETs never invoke this runner; pending/uncertain requests are never retried.
export function createAutomaticPaperRunner({repository,reader,discover}){
 return {async readNext(scope,actor,period){
  if(!automaticPaperRequest.safeParse({generation:scope.generation,period}).success)throw paperError('CASH_PAPER_INVALID_REQUEST',400);
  if(await repository.generation(scope)!==scope.generation)throw paperError('STORE_LIFECYCLE_STALE_GENERATION');
  const discovery=await discover(scope),sources=[];
  if(!discoveryStatuses.has(discovery?.status)||!Array.isArray(discovery.sources)||discovery.sources.length>50)throw paperError('CASH_PAPER_UNAVAILABLE',503);
  for(const source of discovery.sources)sources.push({...source,reading:validSource(source)?await repository.get(scope,source.checksum):{status:'REQUIRES_REVIEW'}});
  const validated=new Set();
  const validate=async source=>{
   try{await repository.source(scope,source.references[0].messageId,source.checksum);validated.add(source.checksum);return true;}
   catch(error){if(error?.code==='STORE_LIFECYCLE_STALE_GENERATION'||error?.code==='STORE_LIFECYCLE_MAINTENANCE')throw error;source.reading={status:'REQUIRES_REVIEW',reason:'CURRENT_SOURCE_UNAVAILABLE'};return false;}
  };
  const next=sources.find(s=>validSource(s)&&s.reading.status==='NOT_READ');let processedChecksum=null;
  if(next&&await validate(next)){
   next.reading=await reader.read(scope,actor,{messageId:next.references[0].messageId,checksum:next.checksum});processedChecksum=next.checksum;
  }
  // Intermediate steps read only metadata and the selected original. Once all
  // readings are available, validate the full source set once before COMPLETE.
  // The final report independently revalidates the same originals in its snapshot.
  if(automaticPaperCoverage(discovery,sources).discoveryComplete&&sources.every(s=>validSource(s)&&s.reading.status==='EXTRACTED_UNVERIFIED'))for(const source of sources)if(!validated.has(source.checksum))await validate(source);
  if(await repository.generation(scope)!==scope.generation)throw paperError('STORE_LIFECYCLE_STALE_GENERATION');
  const remaining=sources.filter(s=>s.reading.status==='NOT_READ').length,coverage=automaticPaperCoverage(discovery,sources);
  return {...discovery,storeId:scope.storeId,generation:scope.generation,period,sources,processedChecksum,remaining,status:remaining?'MORE':!coverage.discoveryComplete||sources.some(s=>s.reading.status!=='EXTRACTED_UNVERIFIED')?'REQUIRES_REVIEW':'COMPLETE',coverage};
 }};
}
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function clock(value){
 const date=new Date(value);if(!Number.isFinite(+date))return null;
 const p=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
 return {day:`${p.year}-${p.month}-${p.day}`,minute:`${p.hour}:${p.minute}`,second:p.second};
}
function printedTime(value){const m=text(value).match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);return m&&Number(m[1])<24?{minute:`${m[1].padStart(2,'0')}:${m[2]}`,second:m[3]||null}:null;}
const sameTime=(printed,at,date)=>{const c=clock(at);return c&&printed&&c.day===date&&c.minute===printed.minute&&(!printed.second||printed.second===c.second);};

// Corroboration is derived evidence, not a manual review, new expense or change
// to employee liability. Every match retains the exact original source hash.
export function projectAutomaticPaperEvidence({scope,sessions,papers,discovery,selectedIds=[...sessions.keys()],period,storeName}){
 const selected=new Set(selectedIds),items=[],shiftCandidates=[],sources=Array.isArray(papers)?papers:[],coverage=automaticPaperCoverage(discovery,sources);
 const all=[...sessions.values()].filter(s=>s?.session?.companyId===scope.companyId&&s.session.storeId===scope.storeId);
 const selectedSessions=all.filter(s=>selected.has(s.session.id));
 const spans=selectedSessions.map(s=>({from:clock(s.session.openedAt)?.day,to:clock(s.session.closedAt)?.day})).filter(s=>s.from&&s.to);
 const outside=date=>spans.length?spans.every(s=>date<s.from||date>s.to):period?date<period.from||date>period.to:false;
 let readCount=0;
 for(const source of sources){
  const uploaded=source?.references?.[0]?.uploadedAt,uploadedDate=uploaded?new Date(uploaded):null;
  const base={filename:String(source?.references?.[0]?.filename||'Συνημμένο').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,180),uploadedAt:uploadedDate&&Number.isFinite(+uploadedDate)?uploadedDate.toISOString():null,sourceId:source?.sourceId||null,checksum:source?.checksum||null,sourceKey:source?.reading?.sourceKey||null,readingHash:source?.reading?.extraction?hash(source.reading.extraction):null};
  if(!validSource(source)||source.reading?.status!=='EXTRACTED_UNVERIFIED'){
   items.push({...base,line:null,status:'UNRESOLVED',reason:source.reading?.status||'INVALID_SOURCE'});continue;
  }
  let extraction;try{const value=source.reading.extraction;extraction=normalizePaper({dateText:value.dateText,documentDate:value.documentDate,operatorText:value.operatorText,shiftText:value.shiftText,notes:value.notes,lines:value.lines.map(({kind,label,amountText,quantityText,timeText,uncertain})=>({kind,label,amountText,quantityText,timeText,uncertain}))});}catch{items.push({...base,line:null,status:'UNRESOLVED',reason:'INVALID_READING'});continue;}
  readCount++;
  shiftCandidates.push(...handwrittenShiftCandidates({scope,extraction,modelDocumentDate:source.reading.extraction.documentDate,originals:all,selectedIds}).map(candidate=>({...base,...candidate})));
  // The extraction schema caps physical lines at60. Reaching that boundary
  // cannot prove no additional original lines were omitted by the provider.
  if(extraction.lines.length>=60)items.push({...base,line:null,status:'UNRESOLVED',reason:'SOURCE_LINE_LIMIT'});
  for(const note of extraction.notes.map(text).filter(Boolean))items.push({...base,line:null,status:'UNRESOLVED',reason:'DOCUMENT_NOTES_REQUIRE_REVIEW',note:note.slice(0,300)});
  if(!extraction.documentDate){items.push({...base,line:null,status:'UNRESOLVED',reason:'DOCUMENT_DATE_UNREADABLE'});continue;}
  if(outside(extraction.documentDate)){items.push({...base,line:null,status:'OUT_OF_PERIOD',reason:'PRINTED_DATE_OUTSIDE_SELECTED_SHIFTS'});continue;}
  if(!extraction.lines.length){items.push({...base,line:null,status:'UNRESOLVED',reason:'NO_DOCUMENT_LINES'});continue;}
  const hasFinancialLines=extraction.lines.some(line=>line.kind!=='OTHER'&&line.amountCents!==null);
  if(!hasFinancialLines)items.push({...base,line:null,status:'UNRESOLVED',reason:'NO_FINANCIAL_DOCUMENT_LINES'});
  const closingDocument=extraction.lines.some(line=>line.kind==='CLOSING_CASH'&&line.amountCents!==null&&!line.uncertain);
  const headerLabels=new Set([normalized(storeName)].filter(Boolean));
  if(closingDocument)headerLabels.add('ΚΛΕΙΣΙΜΟ ΤΑΜΕΙΟΥ');
  if(/^(?:20\d{2}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]20\d{2})$/.test(text(extraction.dateText)))headerLabels.add(normalized('Ημερομηνία:'+extraction.dateText).replace(/\s*:\s*/g,':'));
  if(text(extraction.operatorText)&&all.some(original=>normalized(original.session.openedByName)===normalized(extraction.operatorText)))headerLabels.add(normalized('Χειριστής:'+extraction.operatorText).replace(/\s*:\s*/g,':'));
  for(const original of all)if(text(original.session.terminalPos))headerLabels.add(normalized('Ταμείο:'+original.session.terminalPos).replace(/\s*:\s*/g,':'));
  const documentStart=items.length;
  extraction.lines.forEach((line,index)=>{
   const detail={...base,label:line.label,timeText:line.timeText,line:index,kind:line.kind,amountCents:line.amountCents,date:extraction.documentDate,sessionId:null,transactionId:null,sourceHash:null};
   if(line.requiresReview){items.push({...detail,status:'UNRESOLVED',reason:'UNCERTAIN_LINE'});return;}
   // Exact scoped metadata remains visible, but never claims a ledger match.
   if(line.kind==='OTHER'&&line.amountText===null&&line.quantityText===null&&line.timeText===null&&headerLabels.has(normalized(line.label).replace(/\s*:\s*/g,':'))){items.push({...detail,status:'INFORMATIONAL',reason:'VERIFIED_DOCUMENT_HEADER'});return;}
   const time=printedTime(line.timeText);
   if(!time){items.push({...detail,status:'UNRESOLVED',reason:'LINE_TIME_UNREADABLE'});return;}
   const candidates=[];
   for(const original of all){
    const session=original.session;
    if(!operatorMatches(extraction.operatorText,session.openedByName))continue;
    if(['OPENING_CASH','CLOSING_CASH'].includes(line.kind)){
     const at=line.kind==='OPENING_CASH'?session.openedAt:session.closedAt;
     const field=line.kind==='OPENING_CASH'?'openingOperational':'actualOperational';
     const amount=exactCents(session[field]??original.automaticSnapshot?.[field]);
     if(session.status==='CLOSED'&&amount!==null&&amount===line.amountCents&&sameTime(time,at,extraction.documentDate))candidates.push({original,transactionId:null,evidenceBasis:'SHIFT_BOUNDARY'});
    }else{
     if(['POS','EFTPOS'].includes(line.kind)){
      const field=line.kind==='POS'?'cardSales':'eftposTotal',amount=exactCents(original.automaticSnapshot?.[field]??session[field]);
      if(session.status==='CLOSED'&&amount!==null&&amount===line.amountCents&&sameTime(time,session.closedAt,extraction.documentDate))candidates.push({original,transactionId:null,evidenceBasis:'SHIFT_TOTAL'});
     }
     for(const transaction of original.transactions||[]){
      if(transactionMatchesPaper(line.kind,transaction,line.amountCents)&&sameTime(time,transaction.occurredAt,extraction.documentDate))candidates.push({original,transactionId:transaction.id,evidenceBasis:'LEDGER_TRANSACTION'});
     }
    }
   }
   if(candidates.length!==1){items.push({...detail,status:'UNRESOLVED',reason:candidates.length?'AMBIGUOUS_MATCH':'NO_MATCHING_RECORDED_MOVEMENT'});return;}
   const match=candidates[0];
   items.push({...detail,sessionId:match.original.session.id,transactionId:match.transactionId,evidenceBasis:match.evidenceBasis,sourceHash:match.original.sourceHash,status:selected.has(match.original.session.id)?'MATCHED':'OUT_OF_PERIOD',reason:selected.has(match.original.session.id)?'UNIQUE_RECORDED_CORROBORATION':'CONTEXT_SHIFT_ONLY'});
  });
  // Multiple physical lines in one document need distinct recorded evidence.
  // Independent documents may corroborate the same movement; kinds remain
  // separate (for example POS versus EFTPOS) within the document.
  const used=new Map();
  for(const item of items.slice(documentStart))if(item.evidenceBasis&&item.sessionId){
   const key=JSON.stringify([item.sourceId,item.kind,item.transactionId?['TRANSACTION',item.transactionId]:['AGGREGATE',item.sessionId]]);
   const group=used.get(key)||[];group.push(item);used.set(key,group);
  }
  for(const group of used.values())if(group.length>1)for(const item of group){item.status='UNRESOLVED';item.reason='REPEATED_LINE_MATCH';}
 }
 const result={version:1,storeId:scope.storeId,generation:scope.generation,shiftCandidates,status:coverage.discoveryComplete&&items.every(i=>i.status!=='UNRESOLVED')?'COMPLETE':'INCOMPLETE',items,coverage:{...coverage,readCount,complete:coverage.discoveryComplete&&items.every(i=>i.status!=='UNRESOLVED')},financialAdjustmentCents:0,humanApproval:false};
 return {...result,hash:hash(result)};
}
