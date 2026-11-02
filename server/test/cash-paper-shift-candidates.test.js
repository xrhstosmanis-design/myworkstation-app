import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePaper} from '../src/services/cash-paper-contract.js';
import {handwrittenShiftCandidates} from '../src/services/cash-paper-shift-candidates.js';
import {projectAutomaticPaperEvidence} from '../src/services/cash-paper-automatic.js';
const scope={companyId:'company',storeId:'store',generation:'0'};
const line=(kind,label,amountText,extra={})=>({kind,label,amountText,quantityText:null,timeText:null,uncertain:false,...extra});
const lines=()=>[line('OTHER','Αρχ/ταμ 500,00','500,00'),line('OTHER','POS 21,40','21,40'),line('OTHER','Αρχ. Ταμείου','620,00'),line('POS','POS','42,30')];
const raw=(over={})=>({dateText:'3 Νοεμβρίου',documentDate:null,operatorText:'Heading Person',shiftText:null,notes:[],lines:lines(),...over});
const original=(id,opening,card,over={})=>({sourceHash:'hash-'+id,session:{id,companyId:'company',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedByName:'Operator '+id,openedAt:'2026-11-03T06:00:00Z',closedAt:'2026-11-03T12:00:00Z',openingOperational:opening,cardSales:card,...over}});
const originals=()=>[original('a','500','21.4'),original('b','620','42.3',{openedAt:'2026-11-03T12:01:00Z',closedAt:'2026-11-03T20:00:00Z'})];
const run=(r=raw(),list=originals())=>handwrittenShiftCandidates({scope,extraction:normalizePaper(r),modelDocumentDate:r.documentDate,originals:list,selectedIds:['a']});
test('one original yields distinct joint section candidates with immutable original and ledger provenance',()=>{
 const r=raw(),list=originals(),before=JSON.stringify({r,list}),out=run(r,list);
 assert.deepEqual(out.map(c=>[c.sessionId,c.fromLine,c.toLine,c.selected]),[['a',0,1,true],['b',2,3,false]]);
 for(const candidate of out){assert.equal(candidate.status,'UNVERIFIED_CANDIDATE');assert.equal(candidate.dateBasis,'LEDGER_DAY_MONTH_CANDIDATE');assert.equal(candidate.candidateDate,'2026-11-03');assert.equal(candidate.proof.length,2);assert.equal(candidate.financialAdjustmentCents,0);assert.equal(candidate.humanApproval,false);assert.equal(candidate.sourceHash,'hash-'+candidate.sessionId);}
 assert.equal(JSON.stringify({r,list}),before);
});
test('single amount, missing opening and generic totals or supplier labels cannot establish candidates',()=>{
 for(const rows of [[lines()[0]],[lines()[1]],[lines()[0],line('OTHER','ΣΥΝΟΛΟ','21,40')],[lines()[0],line('OTHER','SUPPLIER POS','21,40')]])assert.deepEqual(run(raw({lines:rows})),[]);
});
test('uncertain or malformed recognized fields and contradictory duplicates fail closed per section',()=>{
 for(const patch of [{uncertain:true},{amountText:'?'},{quantityText:'1'},{timeText:'09:00'},{amountText:'99,00'}]){
  const rows=lines();rows[1]={...rows[1],...patch};assert.deepEqual(run(raw({lines:rows})).map(c=>c.sessionId),['b']);
 }
 const rows=lines();rows.splice(2,0,line('POS','POS','21,40'));assert.deepEqual(run(raw({lines:rows})).map(c=>c.sessionId),['b']);
});
test('uncertain opening remains a section boundary and never leaks its fields into the preceding section',()=>{
 const rows=lines();rows[2].uncertain=true;assert.deepEqual(run(raw({lines:rows})).map(c=>c.sessionId),['a']);
});
test('foreign, open, invalid chronology, missing hash and missing aggregate cannot supply proof',()=>{
 for(const patch of [{companyId:'foreign'},{storeId:'foreign'},{status:'OPEN'},{openedAt:null},{closedAt:null},{closedAt:'2026-11-02T00:00:00Z'},{cardSales:null}])assert.deepEqual(run(raw({lines:lines().slice(0,2)}),[original('a','500','21.4',patch)]),[]);
 const list=originals();delete list[0].sourceHash;assert.deepEqual(run(raw(),list).map(c=>c.sessionId),['b']);
});
test('duplicate ledger candidates including different years and terminals stay ambiguous',()=>{
 for(const patch of [{},{terminalPos:'SECOND'},{openedAt:'2025-11-03T06:00:00Z',closedAt:'2025-11-03T12:00:00Z'}])assert.deepEqual(run(raw({lines:lines().slice(0,2)}),[originals()[0],original('duplicate','500','21.4',patch)]),[]);
});
test('printed full date is distinct from missing-year ledger date and date contradictions fail closed',()=>{
 const full=run(raw({dateText:'03/11/2026',documentDate:'2026-11-03'}));assert.equal(full[0].dateBasis,'PRINTED_DATE');
 for(const patch of [{dateText:'04/11/2026',documentDate:'2026-11-04'},{dateText:'03/11/2026',documentDate:'2025-11-03'},{dateText:'3 Νοεμβρίου',documentDate:'2026-11-03'},{dateText:'3/11 και 4/11'},{dateText:'31/11'},{dateText:'3 ΝοεμβριXYZ'}])assert.deepEqual(run(raw(patch)),[]);
});
test('zero totals do not provide an independent positive anchor and raw derived fields are recomputed',()=>{
 assert.deepEqual(run(raw({lines:[line('OPENING_CASH','Αρχικό','500'),line('POS','POS','0')]}),[original('a','500','0')]),[]);
 const extraction=normalizePaper(raw());extraction.lines[1].uncertain=true;extraction.lines[1].requiresReview=false;
 assert.deepEqual(handwrittenShiftCandidates({scope,extraction,originals:originals(),selectedIds:['a']}).map(c=>c.sessionId),['b']);
});
test('repeated physical sections cannot reuse a single shift candidate',()=>{
 const r=raw({lines:[...lines().slice(0,2),...lines().slice(0,2)]});assert.deepEqual(run(r,[originals()[0]]),[]);
});
test('strict expense aggregate supports a candidate but never proves any expense receipt',()=>{
 const r=raw({lines:[line('OPENING_CASH','Αρχικό','500'),line('EXPENSE','Έξοδα','14,00')]});
 const list=[original('a','500','21.4',{expenses:'14'})],out=run(r,list);assert.equal(out.length,1);assert.equal(out[0].proof[1].field,'expenses');assert.equal(out[0].status,'UNVERIFIED_CANDIDATE');
 r.lines[1].label='Supplier invoice';assert.deepEqual(run(r,list),[],'individual expense is not a printed aggregate');
});
test('an empty opening heading separates sections instead of attaching later POS to the previous employee',()=>{
 const rows=[...lines().slice(0,2),line('OTHER','Αρχ.',null),line('OTHER','POS 11,00','11,00',{uncertain:true})];
 const out=run(raw({lines:rows}));assert.equal(out.length,1);assert.equal(out[0].toLine,1);
});
test('Athens calendar day and original automatic snapshot fields are used without guessing upload dates',()=>{
 const list=[original('a','500','21.4',{openedAt:'2026-11-02T22:30:00Z',closedAt:'2026-11-03T05:00:00Z'})];delete list[0].session.cardSales;list[0].automaticSnapshot={cardSales:'21.4'};
 assert.equal(run(raw({lines:lines().slice(0,2)}),list).length,1);
 assert.equal(run(raw({dateText:'2 Νοεμβρίου',lines:lines().slice(0,2)}),list).length,0);
});
test('automatic report integration preserves unresolved dates and coverage and binds source/reading hashes',()=>{
 const r=raw(),extraction=normalizePaper(r),checksum='a'.repeat(64),paper={sourceId:'paper',checksum,references:[{messageId:'message',filename:'synthetic.jpg',uploadedAt:'2030-01-01T00:00:00Z'}],reading:{status:'EXTRACTED_UNVERIFIED',extraction}};
 const list=originals(),sessions=new Map(list.map(o=>[o.session.id,o])),before=JSON.stringify({paper,list});
 const input={scope,sessions,papers:[paper],discovery:{status:'AWAITING_READING',sources:[paper]},selectedIds:['a'],period:{from:'2026-11-03',to:'2026-11-03'}};
 const result=projectAutomaticPaperEvidence(input);assert.equal(result.shiftCandidates.length,2);assert.equal(result.items[0].reason,'DOCUMENT_DATE_UNREADABLE');assert.equal(result.coverage.complete,false);assert.equal(result.status,'INCOMPLETE');assert.equal(result.financialAdjustmentCents,0);assert.equal(result.humanApproval,false);
 for(const c of result.shiftCandidates){assert.equal(c.checksum,checksum);assert.equal(c.sourceId,'paper');assert.match(c.readingHash,/^[a-f0-9]{64}$/);}
 assert.equal(JSON.stringify({paper,list}),before);list[0].sourceHash='changed';assert.notEqual(projectAutomaticPaperEvidence(input).hash,result.hash);
 const unavailable={...paper,reading:{status:'REQUIRES_REVIEW'}};assert.equal(projectAutomaticPaperEvidence({...input,papers:[unavailable]}).shiftCandidates.length,0);
});
