import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {parseKioskCashWorkbook,compareKioskCashWorkbooks,kioskXlsLimits} from '../src/services/cash-kiosk-xls.js';
import {cashEventSalesText,unmatchedPriceApplication} from '../src/services/cash-event-sales.js';
const scope={companyId:'company',storeId:'store'};
const serial=wall=>(Date.parse(wall+'Z')-Date.UTC(1899,11,30))/86400000;
const when=serial('2026-10-27T21:09:17');
const context=(kind,extra={})=>({...scope,sourceId:'uploaded-file',kind,...(kind==='JOURNAL'?{kioskShiftId:'436',kioskOperator:'ΤΑΜΕΙΟ 6'}:{}),...extra});
const events=(extra={})=>[
 ['Συμβάντα','Κατηγορία'],[1,'Αλλαγή Τιμής Λιανικής'],
 [null,'Ημερομηνία','Χειριστής','αριθμός βάρδιας','Περιγραφή'],
 [null,extra.when??when,'ΤΑΜΕΙΟ 6',436,extra.description??'Αλλαγή τιμής λιανικής για το είδος [ΠΡΟΪΟΝ] από 2,00 € σε 1,00 € (ΤΑΜΕΙΟ 6)']
];
const header=['Κωδ','Ημερομηνία','Επωνυμία','Περιγραφή συναλλαγής','Κέρδος','Τζίρος πώλησης','Πίστωση','Μετρητά','Κάρτα','IRIS','Κουπόνια','προμήθ. PoS','Πληρωμή','Είσπραξη','Όψεως','Επιταγή','X','Είδη'];
const itemHeader=[null,'Περιγραφή είδους','Πελάτης','ΜΜ','Ποσότητα','Λιανική','Έκπτωση','Κέρδος','ΦΠΑ %','Τιμή Μονάδος (Λ)','Μερ.Σύνολο'];
const line=(name='ΠΡΟΪΟΝ',qty=1,retail=2,total=1)=>[null,name,null,'TEM',qty,retail,0,0,24,total/qty,total];
const journal=({lines=[line()],total=lines.reduce((n,l)=>n+l[10],0),at=when,number=123,kind='Πώληση λιανικής',items=lines.length}={})=>[header,[number,at,null,kind,0,total,null,total,null,null,null,null,null,null,null,null,false,items],[],itemHeader,...lines,[null,String(items),null,null,null,null,null,null,null,null,total+' €']];
function workbook(rows,{type='biff8',date1904=false,mutate}={}){
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(book,sheet,'Sheet1');book.Workbook={WBProps:{date1904}};mutate?.(sheet,book);return XLSX.write(book,{type:'buffer',bookType:type});
}
const parse=(rows,kind,options={},ctx={})=>parseKioskCashWorkbook(workbook(rows,options),context(kind,ctx));

test('actual grouped XLS headers preserve date/seconds and typed external identities without financial allocation',async()=>{
 const e=await parse(events(),'EVENTS'),j=await parse(journal(),'JOURNAL');
 assert.equal(e.status,'AVAILABLE');assert.equal(j.status,'AVAILABLE');assert.equal(e.events[0].when.iso,'2026-10-27T19:09:17.000Z');assert.equal(j.sales[0].transactionNumber,'123');
 const result=compareKioskCashWorkbooks({scope,documents:[e,j]});assert.equal(result.status,'AVAILABLE');assert.equal(result.financialAdjustmentCents,0);assert.equal(result.findings.length,2);
 assert.equal(result.findings[0].sessionId,'KIOSK_SHIFT:436');assert.equal(result.findings[0].operatorId,'KIOSK_OPERATOR:ΤΑΜΕΙΟ 6');assert.equal(result.findings[0].totalReductionCents,100);
 assert.equal(result.findings[1].code,'PRICE_APPLICATION_UNCONFIRMED');assert.equal(result.findings[1].quantity,null);assert.equal(result.findings[1].transactionNumber,null);assert(cashEventSalesText(result).join('').includes(unmatchedPriceApplication));
});
test('XLSX and 1904 serials have the same Greek wall clock, independent of host timezone',async()=>{
 const result=await parse(events({when:when-1462}),'EVENTS',{type:'xlsx',date1904:true});assert.equal(result.status,'AVAILABLE');assert.equal(result.events[0].when.iso,'2026-10-27T19:09:17.000Z');
 const summer=await parse(events({when:serial('2026-07-01T00:13:46')}),'EVENTS');assert.equal(summer.events[0].when.iso,'2026-06-30T21:13:46.000Z');
});
test('ambiguous and nonexistent Athens DST hours refuse complete coverage instead of guessed offset',async()=>{
 for(const wall of ['2026-10-25T03:30:00','2026-03-29T03:30:00']){const r=await parse(events({when:serial(wall)}),'EVENTS');assert.equal(r.status,'LIMITED');assert.equal(r.events[0].when.iso,null);assert.equal(r.issues[0].code,'AMBIGUOUS_OR_NONEXISTENT_GREECE_TIME');}
});
test('zero-value water is reported; only an exact trusted own-use confirmation can exempt its sale line',async()=>{
 const e=await parse(events(),'EVENTS'),j=await parse(journal({lines:[line('ΝΕΡΟ',2,1,0)]}),'JOURNAL');
 const r=compareKioskCashWorkbooks({scope,documents:[e,j]});const z=r.findings.find(f=>f.code==='ZERO_VALUE_SALE');assert.equal(z.quantity,2);assert.equal(z.totalReductionCents,200);
 const c={...scope,kind:'PERMITTED_WATER_OWN_USE',saleId:z.saleId,lineId:z.lineId,productId:z.productId,occurredAt:z.occurredAt,quantity:2,unitPriceCents:100,lineTotalCents:0,evidenceId:'owner-exact-proof'};
 assert.equal(compareKioskCashWorkbooks({scope,documents:[e,j],confirmations:[c]}).findings.filter(f=>f.code==='ZERO_VALUE_SALE').length,0);
 assert.equal(compareKioskCashWorkbooks({scope,documents:[e,j],confirmations:[{...c,lineId:'another'}]}).findings.filter(f=>f.code==='ZERO_VALUE_SALE').length,1);
});
test('permanent edits in an ordinary price category remain catalogue events and same-price sales prove nothing',async()=>{
 const e=await parse(events({description:'Αλλαγή τιμής λιανικής (μόνιμη) για το είδος [ΠΡΟΪΟΝ] από 2,00 € σε 1,00 € (ΤΑΜΕΙΟ 6)'}),'EVENTS');const j=await parse(journal(),'JOURNAL');
 const r=compareKioskCashWorkbooks({scope,documents:[e,j]});assert.equal(r.findings.at(-1).code,'CATALOG_PRICE_CHANGE_UNCONFIRMED');assert.equal(r.findings.at(-1).saleId,null);
});
test('held tills, deletes, returns and a percentage in a product name are excluded from extra check',async()=>{
 const rows=[['Συμβάντα','Κατηγορία'],[1,'Διόρθωση στοιχείων Είδους'],[null,'Ημερομηνία','Χειριστής','αριθμός βάρδιας','Περιγραφή'],[null,when,'ADMIN',1,'Επεξεργασία είδους [30% ΖΑΧΑΡΗ]']];
 const e=await parse(rows,'EVENTS');assert.equal(e.status,'AVAILABLE');assert.equal(e.events.length,0);
 const j=await parse(journal({kind:'Επιστροφή λιανικής',total:-1}),'JOURNAL');assert.equal(j.status,'AVAILABLE');assert.equal(j.sales.length,0);
 assert.equal(compareKioskCashWorkbooks({scope,documents:[e,j]}).findings.length,0);
});
test('genuine repeated item lines survive the product-count field and repeated headers',async()=>{
 const rows=journal({lines:[line('ΙΔΙΟ',1,4,4),line('ΙΔΙΟ',1,4,4)],items:1});rows.push(...journal({number:124}));
 const j=await parse(rows,'JOURNAL');assert.equal(j.status,'AVAILABLE');assert.equal(j.sales.length,2);assert.equal(j.sales[0].lines.length,2);assert.notEqual(j.sales[0].lines[0].lineId,j.sales[0].lines[1].lineId);
 const missing=await parse(journal({total:8,lines:[line('ΙΔΙΟ',1,4,4)],items:1}),'JOURNAL');assert.equal(missing.status,'UNAVAILABLE');assert.equal(missing.reason,'INCOMPLETE_SALE_ITEMS');
});
test('reuploads and overlapping exports are counted once; conflicting transaction or file binding fails closed',async()=>{
 const e=await parse(events(),'EVENTS'),j=await parse(journal(),'JOURNAL'),overlap=await parse([...journal(),...journal({number:124})],'JOURNAL');
 const r=compareKioskCashWorkbooks({scope,documents:[e,j,j,overlap]});assert.equal(r.status,'AVAILABLE');assert.equal(r.coverage.saleCount,2);
 const changed=await parse(journal({total:0,lines:[line('ΠΡΟΪΟΝ',1,2,0)]}),'JOURNAL');assert.equal(compareKioskCashWorkbooks({scope,documents:[e,j,changed]}).reason,'CONFLICTING_TRANSACTION');
 assert.equal(compareKioskCashWorkbooks({scope,documents:[e,j,{...j,source:{...j.source,kioskShiftId:'999'}}]}).reason,'CONFLICTING_FILE_BINDING');
});
test('identical same-time events are preserved as a multiset across overlapping exports',async()=>{
 const rows=events();rows.push(rows.at(-1));const e=await parse(rows,'EVENTS'),overlap=await parse([...rows,[]],'EVENTS'),j=await parse(journal(),'JOURNAL');
 const r=compareKioskCashWorkbooks({scope,documents:[e,overlap,j]});assert.equal(r.status,'AVAILABLE');assert.equal(r.coverage.eventCount,2);assert.equal(r.findings.filter(f=>f.code==='PRICE_APPLICATION_UNCONFIRMED').length,2);
});
test('explicit provenance and separate Kiosk shift/operator namespaces cannot be guessed from filenames or native IDs',async()=>{
 const b=workbook(journal());assert.equal((await parseKioskCashWorkbook(b,{...scope,sourceId:'file',kind:'JOURNAL'})).reason,'EXPLICIT_KIOSK_JOURNAL_BINDING_REQUIRED');
 const e=await parse(events(),'EVENTS'),j=await parse(journal(),'JOURNAL',{}, {kioskShiftId:'different-native-id',kioskOperator:'different-native-user'});
 const r=compareKioskCashWorkbooks({scope,documents:[e,j]});assert.equal(r.findings.find(f=>f.code==='PRICE_APPLICATION_UNCONFIRMED').saleId,null);
 assert.equal(r.status,'LIMITED');assert.deepEqual(r.coverage.missingJournalShiftIds,['436']);
 assert.equal(compareKioskCashWorkbooks({scope:{...scope,storeId:'foreign'},documents:[e,j]}).reason,'SOURCE_INCOMPLETE_OR_FOREIGN');assert.equal(compareKioskCashWorkbooks({scope,documents:[e]}).reason,'EVENTS_AND_JOURNAL_REQUIRED');
});
test('formula/link/error/unknown schema and malformed dates are explicit unavailable, never zero agreement',async()=>{
 for(const change of [s=>{s.B4.f='NOW()';},s=>{s.B4.l={Target:'https://example.com'};},s=>{s.B4.t='e';s.B4.v=7;}]){const r=await parse(events(),'EVENTS',{type:'xlsx',mutate:change});assert.equal(r.status,'UNAVAILABLE');assert.equal(r.reason,'UNSAFE_CELL');}
 assert.equal((await parse([['other export']],'EVENTS')).reason,'UNSUPPORTED_HEADERS');assert.equal((await parse(events({when:'27/10/2026'}),'EVENTS')).reason,'INVALID_TIME');
 const unknown=events({description:'Έκπτωση άγνωστου σχήματος'});assert.equal((await parse(unknown,'EVENTS')).reason,'UNSUPPORTED_PRICE_EVENT_SHAPE');
});
test('input bytes, worksheet range and inflated XLSX directory are bounded before source comparison',async()=>{
 assert.equal((await parseKioskCashWorkbook(Buffer.alloc(kioskXlsLimits.bytes+1),context('EVENTS'))).status,'LIMITED');
 assert.equal((await parse(events(),'EVENTS',{type:'xlsx',mutate:s=>{s['!ref']='A1:E20001';}})).reason,'SHEET_LIMIT');
 const b=workbook(events(),{type:'xlsx'});let changed=false;for(let i=0;i<b.length-46;i++)if(b.readUInt32LE(i)===0x02014b50){b.writeUInt32LE(kioskXlsLimits.inflated+1,i+24);changed=true;break;}assert(changed);assert.equal((await parseKioskCashWorkbook(b,context('EVENTS'))).reason,'ZIP_LIMIT');
});
