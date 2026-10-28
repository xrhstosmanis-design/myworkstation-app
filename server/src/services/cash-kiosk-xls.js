import {createHash} from 'node:crypto';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import XLSX from 'xlsx';
import {greeceDateTimeToIso} from '../../../shared/greece-time.mjs';
import {compareCashEventSales} from './cash-event-sales.js';

// External identities never become native session, employee or product IDs.
export const kioskXlsLimits=Object.freeze({bytes:7*1024*1024,inflated:16*1024*1024,rows:20000,cells:200000,text:2000,files:12,timeout:5000});
const fail=(reason,status='UNAVAILABLE')=>({status,reason,financialAdjustmentCents:0});
const digest=v=>createHash('sha256').update(v).digest('hex');
const text=v=>typeof v==='string'?v.normalize('NFC').replace(/\s+/g,' ').trim():'';
const id=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?String(v):typeof v==='string'&&/^[\p{L}\p{N} _.-]{1,100}$/u.test(v.trim())?v.trim():null;
const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const money=v=>numeric(v)!==null&&Number.isSafeInteger(Math.round(v*100))?Math.round(v*100):null;
const scopeEqual=(a,b)=>a?.companyId===b?.companyId&&a?.storeId===b?.storeId;

// Check the ZIP directory BEFORE the spreadsheet engine inflates XLSX data.
function checkContainer(bytes){
 const ole=Buffer.from('d0cf11e0a1b11ae1','hex');
 if(bytes.subarray(0,8).equals(ole))return;
 if(bytes.readUInt32LE(0)!==0x04034b50)throw Error('UNSUPPORTED_CONTAINER');
 let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(bytes.readUInt32LE(p)===0x06054b50&&p+22+bytes.readUInt16LE(p+20)===bytes.length){end=p;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw Error('INVALID_ZIP');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
 if(!count||count>300||count!==bytes.readUInt16LE(end+8)||offset+size!==end)throw Error('ZIP_LIMIT');
 let at=offset,total=0;const names=new Set();
 for(let n=0;n<count;n++){
  if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)throw Error('INVALID_ZIP');
  const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),packed=bytes.readUInt32LE(at+20),raw=bytes.readUInt32LE(at+24),len=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),local=bytes.readUInt32LE(at+42);
  if(at+46+len+extra+comment>end||flags&1||![0,8].includes(method)||raw===0xffffffff||packed===0xffffffff||local===0xffffffff||local+30>=offset)throw Error('INVALID_ZIP');
  const name=bytes.subarray(at+46,at+46+len).toString('utf8');
  if(names.has(name)||/\\|(^|\/)\.\.(\/|$)|^\//.test(name)||/vbaproject|externallinks/i.test(name))throw Error('UNSUPPORTED_ZIP_ENTRY');
  names.add(name);total+=raw;
  if(total>kioskXlsLimits.inflated||raw>Math.max(1024*1024,packed*200))throw Error('ZIP_LIMIT');
  if(bytes.readUInt32LE(local)!==0x04034b50||local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28)+packed>offset)throw Error('INVALID_ZIP');
  at+=46+len+extra+comment;
 }
 if(at!==end)throw Error('INVALID_ZIP');
}

function clock(value,date1904){
 if(numeric(value)===null||value<1||value>80000)throw Error('INVALID_TIME');
 const d=XLSX.SSF.parse_date_code(value,{date1904});
 if(!d||d.y<2000||d.y>2100)throw Error('INVALID_TIME');
 const pad=v=>String(v).padStart(2,'0');
 const wall=`${d.y}-${pad(d.m)}-${pad(d.d)}T${pad(d.H)}:${pad(d.M)}:${pad(d.S)}`;
 try{return {wall,iso:greeceDateTimeToIso(wall)};}catch{return {wall,iso:null,reason:'AMBIGUOUS_OR_NONEXISTENT_GREECE_TIME'};}
}
function sourceContext(context,checksum){
 if(!context||!['companyId','storeId','sourceId'].every(k=>typeof context[k]==='string'&&id(context[k]))||!['EVENTS','JOURNAL'].includes(context.kind))throw Error('EXPLICIT_SOURCE_SCOPE_REQUIRED');
 if(context.kind==='JOURNAL'&&(!id(context.kioskShiftId)||!id(context.kioskOperator)))throw Error('EXPLICIT_KIOSK_JOURNAL_BINDING_REQUIRED');
 return {companyId:context.companyId,storeId:context.storeId,sourceId:context.sourceId,kind:context.kind,checksum,...(context.kind==='JOURNAL'?{kioskShiftId:context.kioskShiftId,kioskOperator:context.kioskOperator}:{})};
}
function parseRows(rows,date1904,context,source){
 const events=[],sales=[];let category=null,eventHeader=false,transactionHeader=false,itemHeader=false,current=null,seenHeader=false;const issues=[];
 const stamp=v=>{const c=clock(v,date1904);if(!c.iso)issues.push({code:c.reason,wall:c.wall});return c;};
 function finish(){
  if(!current)return;
  if(current.eligible){
   // Kiosk's Είδη is a product count, not physical printed line count: the
   // export can print the same product twice while Είδη remains one.
   if(!current.lines.length||current.itemCount>current.lines.length||current.lines.reduce((n,l)=>n+Math.round(l.lineTotal*100),0)!==current.totalCents)throw Error('INCOMPLETE_SALE_ITEMS');
   sales.push(current);
  }
  current=null;itemHeader=false;
 }
 for(let index=0;index<rows.length;index++){
  const row=rows[index],r=row.map(v=>typeof v==='string'?text(v):v);
  if(context.kind==='EVENTS'){
   if(r[0]==='Συμβάντα'&&r[1]==='Κατηγορία'){eventHeader=false;category=null;continue;}
   if(typeof r[0]==='number'&&typeof r[1]==='string'){category=r[1];eventHeader=false;continue;}
   if(r[1]==='Ημερομηνία'&&r[2]==='Χειριστής'&&r[3]==='αριθμός βάρδιας'&&r[4]==='Περιγραφή'){eventHeader=true;seenHeader=true;continue;}
   if(!eventHeader&&numeric(r[1])!==null&&/τιμ|έκπτ|εκπτ/iu.test(category||''))throw Error('MISSING_EVENT_HEADER');
   if(!eventHeader||r[1]===null)continue;
   if(!category)throw Error('MISSING_EVENT_CATEGORY');
   // Category defines admissible events; product names containing % are irrelevant.
   if(!/^(?:Μόνιμη αλλαγή Τιμής Λιανικής|Αλλαγή Τιμής Λιανικής|Έκπτωση|Εκπτώσεις)$/u.test(category)){
    if(/τιμ|έκπτ|εκπτ/iu.test(category))throw Error('UNSUPPORTED_PRICE_CATEGORY');
    continue;
   }
   if(numeric(r[1])===null)throw Error('INVALID_TIME');
   const permanent=/\(μόνιμη\)/iu.test(r[4]||'')||category.startsWith('Μόνιμη');
   const m=/^Αλλαγή τιμής λιανικής(?: \(μόνιμη\))? για το είδος \[(.+)\] από (\d+(?:[.,]\d{1,2})?) € σε (\d+(?:[.,]\d{1,2})?) € \(.+\)$/u.exec(r[4]||'');
   if(!m)throw Error('UNSUPPORTED_PRICE_EVENT_SHAPE');
   if(!id(r[2])||!id(r[3]))throw Error('INVALID_KIOSK_IDENTITY');
   const when=stamp(r[1]);
   events.push({id:`KIOSK_EVENT:${source.checksum}:${index+1}`,row:index+1,category,actionType:permanent?'PERMANENT_PRICE_CHANGE':'PRICE_CHANGE',productName:text(m[1]),operator:String(r[2]),shiftId:String(r[3]),oldPrice:Number(m[2].replace(',','.')),newPrice:Number(m[3].replace(',','.')),quantity:null,newTotal:null,when});
  }else{
   if(r[0]==='Κωδ'&&r[1]==='Ημερομηνία'&&r[3]==='Περιγραφή συναλλαγής'&&r[5]==='Τζίρος πώλησης'&&r[17]==='Είδη'){finish();transactionHeader=true;seenHeader=true;continue;}
   if(!transactionHeader&&id(r[0])&&numeric(r[1])!==null)throw Error('MISSING_TRANSACTION_HEADER');
   if(transactionHeader&&id(r[0])&&r[1]!==null){
    if(numeric(r[1])===null)throw Error('INVALID_TIME');
    finish();const when=stamp(r[1]),totalCents=money(r[5]);
    const eligible=r[3]==='Πώληση λιανικής';
    if(eligible&&(totalCents===null||totalCents<0||!Number.isSafeInteger(r[17])||r[17]<1))throw Error('INVALID_SALE_TOTAL');
    current={transactionNumber:String(r[0]),shiftId:String(context.kioskShiftId),operator:String(context.kioskOperator),when,totalCents,itemCount:r[17],eligible,lines:[]};continue;
   }
   if(r[1]==='Περιγραφή είδους'&&r[4]==='Ποσότητα'&&r[5]==='Λιανική'&&r[9]==='Τιμή Μονάδος (Λ)'&&r[10]==='Μερ.Σύνολο'){if(!current)throw Error('ORPHAN_ITEMS');itemHeader=true;continue;}
   if(itemHeader&&current?.eligible&&typeof r[1]==='string'&&numeric(r[4])!==null){
    if(r[4]<=0||money(r[5])===null||money(r[9])===null||money(r[10])===null||r[5]<0||r[9]<0||r[10]<0)throw Error('INVALID_SALE_ITEM');
    current.lines.push({lineId:`KIOSK_LINE:${current.transactionNumber}:${current.lines.length+1}`,productName:r[1],quantity:r[4],retailPrice:r[5],unitPrice:r[9],lineTotal:r[10],discount:r[6],row:index+1});
   }
  }
 }
 finish();if(!seenHeader)throw Error('UNSUPPORTED_HEADERS');
 return {status:issues.length?'LIMITED':'AVAILABLE',source,events,sales,issues,financialAdjustmentCents:0};
}

function parseInternal(input,context){
 const bytes=Buffer.from(input);
 if(bytes.length<8||bytes.length>kioskXlsLimits.bytes)throw Error('FILE_SIZE_LIMIT');
 const source=sourceContext(context,digest(bytes));checkContainer(bytes);
 const book=XLSX.read(bytes,{type:'buffer',cellDates:false,cellFormula:true,cellHTML:false,bookVBA:false,bookDeps:false,sheetRows:kioskXlsLimits.rows+1});
 if(book.SheetNames.length!==1||book.vbaraw)throw Error('UNSUPPORTED_WORKBOOK');
 const sheet=book.Sheets[book.SheetNames[0]],range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
 if(range.e.r>=kioskXlsLimits.rows||range.e.c>=30)throw Error('SHEET_LIMIT');
 let count=0;
 for(const [key,cell] of Object.entries(sheet)){
  if(key.startsWith('!'))continue;
  if(++count>kioskXlsLimits.cells)throw Error('CELL_LIMIT');
  if(cell.f||cell.F||cell.l||cell.t==='e'||typeof cell.v==='string'&&(cell.v.length>kioskXlsLimits.text||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(cell.v)))throw Error('UNSAFE_CELL');
 }
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true});
 return parseRows(rows,book.Workbook?.WBProps?.date1904===true,context,source);
}

// A resource-limited worker is essential: a file-byte limit alone does not bound
// legacy CFB parsing. No network, provider, database or financial writer is used.
export async function parseKioskCashWorkbook(bytes,context){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<8||bytes.byteLength>kioskXlsLimits.bytes)return fail('FILE_SIZE_LIMIT','LIMITED');
 try{sourceContext(context,digest(bytes));}catch(error){return fail(error.message);}
 return new Promise(resolve=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{cashKioskWorkbook:true,bytes,context},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
  let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);void worker.terminate();};
  const timer=setTimeout(()=>finish(fail('PARSER_TIME_LIMIT','LIMITED')),kioskXlsLimits.timeout);
  worker.once('message',finish);worker.once('error',()=>finish(fail('PARSER_FAILED','LIMITED')));worker.once('exit',()=>finish(fail('PARSER_EXIT','LIMITED')));
 });
}
if(!isMainThread&&workerData?.cashKioskWorkbook){
 try{parentPort.postMessage(parseInternal(workerData.bytes,workerData.context));}catch(error){parentPort.postMessage(fail(/^[A-Z_]{1,80}$/.test(error.message)?error.message:'PARSER_FAILED'));}
}

export function compareKioskCashWorkbooks({scope,documents,confirmations=[]}){
 if(!id(scope?.companyId)||!id(scope?.storeId)||!Array.isArray(documents)||!documents.length||documents.length>kioskXlsLimits.files)return fail('EXPLICIT_SOURCE_SCOPE_REQUIRED');
 if(documents.some(d=>d?.status!=='AVAILABLE'||!scopeEqual(d.source,scope)||!d.source?.checksum||!Array.isArray(d.events)||!Array.isArray(d.sales)))return fail('SOURCE_INCOMPLETE_OR_FOREIGN');
 const byChecksum=new Map();
 for(const d of documents){const previous=byChecksum.get(d.source.checksum);if(previous&&JSON.stringify([previous.source.kind,previous.source.kioskShiftId,previous.source.kioskOperator])!==JSON.stringify([d.source.kind,d.source.kioskShiftId,d.source.kioskOperator]))return fail('CONFLICTING_FILE_BINDING');byChecksum.set(d.source.checksum,d);}
 const unique=[...byChecksum.values()];
 const events=[],sales=[],seenSales=new Map(),seenEvents=new Map();
 // Dedup overlapping exports as multisets: preserve genuinely repeated events
 // inside one export, and reject inconsistent versions of one transaction.
 for(const doc of unique){
  const counts=new Map();
  for(const e of doc.events){const signature=JSON.stringify([e.actionType,e.productName,e.operator,e.shiftId,e.oldPrice,e.newPrice,e.when]);const occurrence=(counts.get(signature)||0)+1;counts.set(signature,occurrence);const key=signature+':'+occurrence;if(!seenEvents.has(key)){seenEvents.set(key,true);events.push(e);}}
  for(const s of doc.sales){const key=s.shiftId+':'+s.transactionNumber,signature=JSON.stringify({...s,lines:s.lines.map(({row,...line})=>line)});if(seenSales.has(key)){if(seenSales.get(key)!==signature)return fail('CONFLICTING_TRANSACTION');continue;}seenSales.set(key,signature);sales.push(s);}
 }
 if(events.length>2000||sales.length>2000||sales.reduce((n,s)=>n+s.lines.length,0)>10000)return fail('COMPARISON_LIMIT','LIMITED');
 if(!unique.some(d=>d.source.kind==='EVENTS')||!unique.some(d=>d.source.kind==='JOURNAL'))return fail('EVENTS_AND_JOURNAL_REQUIRED');
 const shifts=new Set([...events.map(e=>e.shiftId),...sales.map(s=>s.shiftId)]),results=[];
 for(const shift of shifts){
  const sessionId='KIOSK_SHIFT:'+shift,localScope={...scope,sessionId};
  const nativeSales=sales.filter(s=>s.shiftId===shift).map(s=>({...localScope,saleId:'KIOSK_SALE:'+shift+':'+s.transactionNumber,receiptNumber:s.transactionNumber,occurredAt:s.when.iso,actorId:'KIOSK_OPERATOR:'+s.operator,actorName:s.operator,status:'COMPLETED',source:'POS',linked:true,total:s.totalCents/100,lines:s.lines.map(l=>({...l,productId:'KIOSK_NAME:'+l.productName,description:l.productName,unitPrice:l.retailPrice}))}));
  const nativeEvents=events.filter(e=>e.shiftId===shift).map(e=>({...localScope,id:e.id,actionType:e.actionType,productId:'KIOSK_NAME:'+e.productName,productName:e.productName,actorId:'KIOSK_OPERATOR:'+e.operator,actorName:e.operator,createdAt:e.when.iso,oldPrice:e.oldPrice,newPrice:e.newPrice,quantity:e.quantity,newTotal:e.newTotal}));
  // Actual export has no event qty/transaction ID. Keep it unconfirmed, even
  // when a plausible nearby final-price sale exists. Never fabricate these.
  const result=compareCashEventSales({scope:localScope,sales:nativeSales,events:nativeEvents,confirmations});
  if(result.status!=='AVAILABLE')return fail('COMPARISON_LIMIT','LIMITED');
  results.push(...result.findings);
 }
 if(results.length>500)return fail('FINDING_LIMIT','LIMITED');
 const journalShifts=new Set(unique.filter(d=>d.source.kind==='JOURNAL').map(d=>String(d.source.kioskShiftId)));
 const missingJournalShiftIds=[...new Set(events.map(e=>e.shiftId).filter(shift=>!journalShifts.has(shift)))].sort();
 return {status:missingJournalShiftIds.length?'LIMITED':'AVAILABLE',findings:results,sourceChecksums:unique.map(d=>d.source.checksum).sort(),financialAdjustmentCents:0,coverage:{eventCount:events.length,saleCount:sales.length,eventQuantityAvailable:false,externalOnly:true,missingJournalShiftIds}};
}
