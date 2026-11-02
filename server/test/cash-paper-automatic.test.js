import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticPaperRequest,createAutomaticPaperRunner,projectAutomaticPaperEvidence,boundAutomaticPaperDiscovery,automaticPaperByteLimit} from '../src/services/cash-paper-automatic.js';
import {normalizePaper} from '../src/services/cash-paper-contract.js';
const scope={companyId:'c',storeId:'s',generation:'0'},checksum='a'.repeat(64);
const raw={dateText:'01/11/2026',documentDate:'2026-11-01',operatorText:'Ντίνος',shiftText:null,notes:[],lines:[{kind:'EXPENSE',label:'έξοδο',amountText:'40,00',quantityText:null,timeText:'23:19',uncertain:false}]};
const reading={status:'EXTRACTED_UNVERIFIED',extraction:normalizePaper(raw)};
const source={sourceId:'SHA256:'+checksum,checksum,references:[{messageId:'m'}],reading};
const discovery={status:'AWAITING_READING',sources:[source]};
const original={session:{id:'night',companyId:'c',storeId:'s',status:'CLOSED',openedByName:'Ντίνος',openedAt:'2026-11-01T19:49:00Z',closedAt:'2026-11-02T03:58:00Z'},sourceHash:'h',transactions:[{id:'t',type:'OTHER_EXPENSE',cashEffect:true,amountCents:4000,occurredAt:'2026-11-01T21:19:00Z'}]};
const project=(over={})=>projectAutomaticPaperEvidence({scope,sessions:new Map([['night',original]]),papers:[source],discovery,selectedIds:['night'],period:{from:'2026-11-02',to:'2026-11-02'},...over});
test('request validates bounded period and rejects hidden extras',()=>{
 assert(automaticPaperRequest.safeParse({generation:'0',period:{from:'2026-11-01',to:'2026-11-30'}}).success);
 assert(!automaticPaperRequest.safeParse({generation:'0',period:{from:'2026-11-01',to:'2026-12-31'}}).success);
 assert(!automaticPaperRequest.safeParse({generation:'0',period:{from:'2026-11-01',to:'2026-11-01'},reviewed:true}).success);
});
test('explicit runner dispatches only one unread source and reuses uncertain/pending readings',async()=>{
 let calls=0;const states=new Map(),b={...source,sourceId:'b',checksum:'b'.repeat(64),references:[{messageId:'b'}]};
 const runner=createAutomaticPaperRunner({repository:{source:async()=>({}),generation:async()=>scope.generation,get:async(_,key)=>states.get(key)||{status:'NOT_READ'}},reader:{read:async(_,actor,{checksum})=>{calls++;states.set(checksum,reading);return reading;}},discover:async()=>({...discovery,sources:[source,b]})});
 const period={from:'2026-11-01',to:'2026-11-02'};
 const first=await runner.readNext(scope,{id:'actor'},period);assert.equal(calls,1);assert.equal(first.remaining,1);assert.equal(first.processedChecksum,checksum);
 states.set(b.checksum,{status:'PENDING'});const next=await runner.readNext(scope,{id:'actor'},period);assert.equal(calls,1);assert.equal(next.processedChecksum,null);assert.equal(next.status,'REQUIRES_REVIEW');
 states.set(b.checksum,{status:'REQUIRES_REVIEW'});await runner.readNext(scope,{id:'actor'},period);assert.equal(calls,1);
});
test('runner refuses stale generation before provider and after completion',async()=>{
 let reads=0,checks=0;const runner=createAutomaticPaperRunner({repository:{source:async()=>({}),generation:async()=>++checks===1?'0':'1',get:async()=>({status:'NOT_READ'})},reader:{read:async()=>{reads++;return reading}},discover:async()=>discovery});
 await assert.rejects(runner.readNext(scope,{id:'a'},{from:'2026-11-01',to:'2026-11-02'}),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');assert.equal(reads,1);
 await assert.rejects(runner.readNext(scope,{id:'a'},{from:'2026-11-01',to:'2026-11-02'}),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');assert.equal(reads,1);
});
test('printed date/time corroborates overnight recorded expense without changing liability',()=>{
 const before=JSON.stringify(original),out=project();assert.equal(out.status,'COMPLETE');assert.equal(out.items[0].status,'MATCHED');assert.equal(out.items[0].transactionId,'t');assert.equal(out.financialAdjustmentCents,0);assert.equal(out.humanApproval,false);assert.equal(JSON.stringify(original),before);
});
test('equal amount alone, uncertain lines, missing date and duplicate candidate remain unresolved',()=>{
 for(const change of [{timeText:null},{uncertain:true}]){const modified={...source,reading:{...reading,extraction:normalizePaper({...raw,lines:[{...raw.lines[0],...change}]})}};assert.equal(project({papers:[modified]}).items[0].status,'UNRESOLVED');}
 const missing={...source,reading:{...reading,extraction:normalizePaper({...raw,dateText:'1/11',documentDate:null})}};assert.equal(project({papers:[missing]}).items[0].reason,'DOCUMENT_DATE_UNREADABLE');
 const other={...original,session:{...original.session,id:'other'},transactions:[{...original.transactions[0],id:'t2'}]};assert.equal(project({sessions:new Map([['night',original],['other',other]])}).items[0].reason,'AMBIGUOUS_MATCH');
});
test('outside papers/context and bounded/unavailable discovery cannot be mistaken for selected complete proof',()=>{
 assert.equal(project({selectedIds:['other'],sessions:new Map([['night',original],['other',{...original,session:{...original.session,id:'other',openedAt:'2026-11-02T10:00Z',closedAt:'2026-11-02T11:00Z'},transactions:[]}]])}).items[0].status,'OUT_OF_PERIOD');
 for(const status of ['LIMITED','UNAVAILABLE','forged'])assert.equal(project({discovery:{...discovery,status}}).coverage.complete,false);
 assert.equal(project({papers:[],discovery:{status:'NO_ATTACHMENTS_IN_DISCOVERY',sources:[]}}).coverage.complete,true);
 const reversed={...original,transactions:[{...original.transactions[0],reversed:true}]};assert.equal(project({sessions:new Map([['night',reversed]])}).items[0].status,'UNRESOLVED');
});
test('tampered derived fields are recomputed; hash changes on source content',()=>{
 const tampered={...source,reading:{...reading,extraction:{...reading.extraction,lines:[{...reading.extraction.lines[0],amountCents:0,requiresReview:false,uncertain:true}]}}};assert.equal(project({papers:[tampered]}).items[0].reason,'UNCERTAIN_LINE');assert.notEqual(project().hash,project({papers:[tampered]}).hash);
});
test('partial printed name needs an exact word match plus unique date/time/amount',()=>{
 const full={...original,session:{...original.session,openedByName:'ΝΤΙΝΟΣ ΠΑΝΑΓΙΩΤ'}};assert.equal(project({sessions:new Map([['night',full]])}).items[0].status,'MATCHED');
 const wrong={...original,session:{...original.session,openedByName:'ΠΑΝΑΓΙΩΤΗΣ'}};assert.equal(project({sessions:new Map([['night',wrong]])}).items[0].status,'UNRESOLVED');
});
test('unique aggregate boundary corroborates but equal unsupported safe amounts do not',()=>{
 const aggregate=kind=>({...source,reading:{...reading,extraction:normalizePaper({...raw,lines:[{...raw.lines[0],kind,timeText:'21:49',amountText:'1592,00'}]})}});
 const counted={...original,session:{...original.session,openingOperational:'1592.00'}};
 assert.equal(project({sessions:new Map([['night',counted]]),papers:[aggregate('OPENING_CASH')]}).items[0].status,'MATCHED');
 assert.equal(project({sessions:new Map([['night',counted]]),papers:[aggregate('CASHBOX')]}).items[0].status,'UNRESOLVED');
});
test('unavailable discovery cannot return completed runner status',async()=>{
 const runner=createAutomaticPaperRunner({repository:{source:async()=>({}),generation:async()=>scope.generation,get:async()=>{throw Error('must not read')}},reader:{read:async()=>{throw Error('must not dispatch')}},discover:async()=>({status:'UNAVAILABLE',sources:[]})});
 const result=await runner.readNext(scope,{id:'actor'},{from:'2026-11-01',to:'2026-11-02'});assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.coverage.discoveryComplete,false);
});
test('projection cannot hide an unread source from the discovery snapshot',()=>{
 const extra={...source,sourceId:'extra',checksum:'c'.repeat(64)};
 assert.equal(project({discovery:{...discovery,sources:[source,extra]}}).coverage.complete,false);
});
test('runner revalidates current bytes before using cached reading and never dispatches invalid originals',async()=>{
 let dispatched=0,cached=0;
 const runner=createAutomaticPaperRunner({repository:{generation:async()=>scope.generation,source:async()=>{throw Object.assign(Error('changed'),{code:'CASH_PAPER_SOURCE_CHANGED'})},get:async()=>{cached++;return reading}},reader:{read:async()=>{dispatched++;return reading}},discover:async()=>discovery});
 const result=await runner.readNext(scope,{id:'actor'},{from:'2026-11-01',to:'2026-11-02'});
 assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.sources[0].reading.reason,'CURRENT_SOURCE_UNAVAILABLE');assert.equal(cached,1);assert.equal(dispatched,0);
});
test('printed POS and EFTPOS shift totals require exact closing date/time and retain their evidence basis',()=>{
 const totalSource=(kind,change={})=>({...source,reading:{...reading,extraction:normalizePaper({...raw,dateText:'02/11/2026',documentDate:'2026-11-02',lines:[{...raw.lines[0],kind,timeText:'05:58',amountText:kind==='POS'?'120,00':'118,00',...change}]})}});
 const counted={...original,automaticSnapshot:{cardSales:'120.00',eftposTotal:'118.00'}};
 for(const kind of ['POS','EFTPOS']){
  const out=project({sessions:new Map([['night',counted]]),papers:[totalSource(kind)]});assert.equal(out.items[0].status,'MATCHED');assert.equal(out.items[0].evidenceBasis,'SHIFT_TOTAL');assert.equal(out.items[0].transactionId,null);assert.equal(out.financialAdjustmentCents,0);
  assert.equal(project({sessions:new Map([['night',counted]]),papers:[totalSource(kind,{timeText:null})]}).items[0].status,'UNRESOLVED');
  assert.equal(project({sessions:new Map([['night',counted]]),papers:[totalSource(kind,{timeText:'05:57'})]}).items[0].status,'UNRESOLVED');
  const other={...counted,session:{...counted.session,id:'other'}};
  assert.equal(project({sessions:new Map([['night',counted],['other',other]]),papers:[totalSource(kind)]}).items[0].reason,'AMBIGUOUS_MATCH');
 }
 assert.equal(project().items[0].evidenceBasis,'LEDGER_TRANSACTION');
});
test('runner validates only chosen original on intermediate steps, once per source on completion and cached-only reuse',async()=>{
 const b={...source,sourceId:'second',checksum:'b'.repeat(64),references:[{messageId:'second'}]},states=new Map(),validated=[];let paid=0;
 const runner=createAutomaticPaperRunner({repository:{generation:async()=>scope.generation,get:async(_,key)=>states.get(key)||{status:'NOT_READ'},source:async(_,id)=>{validated.push(id);return {}}},reader:{read:async(_,actor,{checksum})=>{paid++;states.set(checksum,reading);return reading}},discover:async()=>({...discovery,sources:[source,b]})});
 const period={from:'2026-11-01',to:'2026-11-02'};
 assert.equal((await runner.readNext(scope,{id:'actor'},period)).status,'MORE');assert.deepEqual(validated,['m']);assert.equal(paid,1);
 validated.length=0;assert.equal((await runner.readNext(scope,{id:'actor'},period)).status,'COMPLETE');assert.deepEqual(validated,['second','m']);assert.equal(new Set(validated).size,2);assert.equal(paid,2);
 validated.length=0;assert.equal((await runner.readNext(scope,{id:'actor'},period)).status,'COMPLETE');assert.deepEqual(validated,['m','second']);assert.equal(paid,2);
});
test('metadata admission caps aggregate originals at25MiB before cached bytes or provider dispatch',async()=>{
 const atLimit={...discovery,sources:[{...source,sizeBytes:automaticPaperByteLimit}]};assert.equal(boundAutomaticPaperDiscovery(atLimit),atLimit);
 const empty={status:'NO_ATTACHMENTS_IN_DISCOVERY',sources:[]};assert.equal(boundAutomaticPaperDiscovery(empty),empty);
 for(const [candidate,reason]of [[{...discovery,sources:[{...source,sizeBytes:automaticPaperByteLimit+1}]},'ATTACHMENT_BYTE_LIMIT'],[discovery,'ATTACHMENT_SIZE_UNAVAILABLE'],[{...discovery,sources:[{...source,sizeBytes:0}]},'ATTACHMENT_SIZE_UNAVAILABLE'],[{...discovery,sources:Array.from({length:51},()=>({...source,sizeBytes:1}))},'ATTACHMENT_BYTE_LIMIT']]){
  const bounded=boundAutomaticPaperDiscovery(candidate);assert.equal(bounded.status,'UNAVAILABLE');assert.equal(bounded.reason,reason);assert.deepEqual(bounded.sources,[]);
  let calls=0;const runner=createAutomaticPaperRunner({repository:{generation:async()=>scope.generation,get:async()=>{calls++;throw Error('unexpected')},source:async()=>{calls++;throw Error('unexpected')}},reader:{read:async()=>{calls++;throw Error('unexpected')}},discover:async()=>bounded});
  const result=await runner.readNext(scope,{id:'actor'},{from:'2026-11-01',to:'2026-11-02'});assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.coverage.discoveryComplete,false);assert.equal(calls,0);
 }
});
test('limited discovery never loads all cached originals to imply completed coverage',async()=>{
 let sourceReads=0;
 const runner=createAutomaticPaperRunner({repository:{generation:async()=>scope.generation,get:async()=>reading,source:async()=>{sourceReads++;return {}}},reader:{read:async()=>{throw Error('must reuse')}},discover:async()=>({...discovery,status:'LIMITED'})});
 const result=await runner.readNext(scope,{id:'actor'},{from:'2026-11-01',to:'2026-11-02'});assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(sourceReads,0);
});
test('hitting60-line extraction boundary cannot certify all physical original lines examined',()=>{
 const at=index=>'22:'+String(index).padStart(2,'0');
 const distinct={...original,transactions:Array.from({length:60},(_,index)=>({...original.transactions[0],id:'t'+index,occurredAt:'2026-11-01T20:'+String(index).padStart(2,'0')+':00Z'}))};
 const paper=count=>({...source,reading:{...reading,extraction:normalizePaper({...raw,lines:Array.from({length:count},(_,index)=>({...raw.lines[0],timeText:at(index)}))})}});
 const below=project({sessions:new Map([['night',distinct]]),papers:[paper(59)]});assert.equal(below.coverage.complete,true);assert.equal(below.items.filter(i=>i.reason==='SOURCE_LINE_LIMIT').length,0);
 const capped=project({sessions:new Map([['night',distinct]]),papers:[paper(60)]});assert.equal(capped.status,'INCOMPLETE');assert.equal(capped.coverage.complete,false);assert.equal(capped.items.filter(i=>i.reason==='SOURCE_LINE_LIMIT').length,1);assert.equal(capped.financialAdjustmentCents,0);
});
test('document-level extraction notes remain explicit unresolved evidence without financial effects',()=>{
 const clean=project();assert.equal(clean.status,'COMPLETE');
 const note='Δεν διαβάστηκε καθαρά η τελευταία παρατήρηση.';
 const paper={...source,reading:{...reading,extraction:normalizePaper({...raw,notes:['  ',note]})}};
 const out=project({papers:[paper]});assert.equal(out.status,'INCOMPLETE');assert.equal(out.coverage.complete,false);assert.equal(out.items.filter(i=>i.reason==='DOCUMENT_NOTES_REQUIRE_REVIEW').length,1);assert.equal(out.items.find(i=>i.reason==='DOCUMENT_NOTES_REQUIRE_REVIEW').note,note);assert.equal(out.financialAdjustmentCents,0);assert.equal(out.humanApproval,false);
 assert(out.items.some(i=>i.status==='MATCHED'));
});
test('two physical same-kind lines cannot reuse one recorded movement within one document',()=>{
 const duplicate={...source,reading:{...reading,extraction:normalizePaper({...raw,lines:[raw.lines[0],{...raw.lines[0]}]})}};
 const out=project({papers:[duplicate]});assert.equal(out.status,'INCOMPLETE');assert.equal(out.coverage.complete,false);assert.equal(out.items.filter(i=>i.reason==='REPEATED_LINE_MATCH').length,2);assert(out.items.every(i=>i.status==='UNRESOLVED'));assert.equal(out.financialAdjustmentCents,0);
 const distinct={...original,transactions:[original.transactions[0],{...original.transactions[0],id:'t2',occurredAt:'2026-11-01T21:20:00Z'}]};
 const separateLines={...source,reading:{...reading,extraction:normalizePaper({...raw,lines:[raw.lines[0],{...raw.lines[0],timeText:'23:20'}]})}};
 const complete=project({sessions:new Map([['night',distinct]]),papers:[separateLines]});assert.equal(complete.status,'COMPLETE');assert.deepEqual(complete.items.map(i=>i.transactionId),['t','t2']);
 const independent={...source,sourceId:'independent',checksum:'d'.repeat(64)};
 const twoDocs=project({papers:[source,independent],discovery:{...discovery,sources:[source,independent]}});assert.equal(twoDocs.status,'COMPLETE');assert(twoDocs.items.every(i=>i.transactionId==='t'));
});
test('repeated same-kind shift aggregates are unresolved while POS and EFTPOS remain separate kinds',()=>{
 const counted={...original,automaticSnapshot:{cardSales:'120.00',eftposTotal:'120.00'}};
 const line={...raw.lines[0],kind:'POS',amountText:'120,00',timeText:'05:58'};
 const paper=lines=>({...source,reading:{...reading,extraction:normalizePaper({...raw,dateText:'02/11/2026',documentDate:'2026-11-02',lines})}});
 const dup=project({sessions:new Map([['night',counted]]),papers:[paper([line,{...line}])]});assert.equal(dup.items.filter(i=>i.reason==='REPEATED_LINE_MATCH').length,2);
 const separate=project({sessions:new Map([['night',counted]]),papers:[paper([line,{...line,kind:'EFTPOS'}])]});assert.equal(separate.status,'COMPLETE');
});
test('LAB closing preserves five verified headers and exactly corroborates numeric-token operator',()=>{
 const header=label=>({kind:'OTHER',label,amountText:null,quantityText:null,timeText:null,uncertain:false});
 const headers=['ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ','ΚΛΕΙΣΙΜΟ ΤΑΜΕΙΟΥ','Ημερομηνία:27/10/2026','Ταμείο:MAIN','Χειριστής:LAB POS 2'].map(header);
 const closing={kind:'CLOSING_CASH',label:'Κλείσιμο',amountText:'9,40€',quantityText:null,timeText:'19:24:28',uncertain:false};
 const lab={...original,session:{...original.session,terminalPos:'MAIN',openedByName:'LAB POS 2',openedAt:'2026-10-27T06:00:00Z',closedAt:'2026-10-27T17:24:28.504186Z',actualOperational:'9.40'}};
 const extraction=lines=>normalizePaper({dateText:'27/10/2026',documentDate:'2026-10-27',operatorText:'LAB POS 2',shiftText:null,notes:[],lines});
 const run=lines=>project({storeName:'ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ',sessions:new Map([['night',lab]]),papers:[{...source,reading:{...reading,extraction:extraction(lines)}}],period:{from:'2026-10-27',to:'2026-10-27'}});
 const out=run([...headers,closing]);assert.equal(out.status,'COMPLETE');assert.equal(out.items.length,6);assert.equal(out.items.filter(i=>i.status==='INFORMATIONAL').length,5);assert.equal(out.items[5].status,'MATCHED');assert.equal(out.items[5].evidenceBasis,'SHIFT_BOUNDARY');
 for(const item of out.items.slice(0,5)){assert.equal(item.reason,'VERIFIED_DOCUMENT_HEADER');assert.equal(item.sessionId,null);assert.equal(item.sourceHash,null);assert.equal(item.checksum,checksum);}
 assert.equal(out.financialAdjustmentCents,0);assert.equal(out.humanApproval,false);
 for(const row of [header('Αγνωστη γραμμή'),header('Ταμείο:OTHER'),header('Χειριστής:LAB POS 3'),header('Ημερομηνία:28/10/2026'),header('ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ 9,40€'),{...headers[1],uncertain:true},{...headers[1],amountText:'9,40'},{...headers[1],quantityText:'1'},{...headers[1],timeText:'19:24:28'},{...headers[1],amountText:''}]){
  const result=run([row,closing]);assert.equal(result.status,'INCOMPLETE');assert.equal(result.items[0].status,'UNRESOLVED');assert.equal(result.items[1].status,'MATCHED');
 }
 const onlyHeaders=run(headers);assert.equal(onlyHeaders.status,'INCOMPLETE');assert(onlyHeaders.items.some(i=>i.reason==='NO_FINANCIAL_DOCUMENT_LINES'));assert.equal(onlyHeaders.items.find(i=>i.label==='ΚΛΕΙΣΙΜΟ ΤΑΜΕΙΟΥ').status,'UNRESOLVED');
 const onlyUnknown=run([header('Αγνωστη γραμμή')]);assert.equal(onlyUnknown.coverage.complete,false);
 const wrongName={...lab,session:{...lab.session,openedByName:'LAB POS 3'}};
 assert.equal(project({sessions:new Map([['night',wrongName]]),papers:[{...source,reading:{...reading,extraction:extraction([closing])}}]}).items[0].status,'UNRESOLVED');
 const duplicateLab={...lab,session:{...lab.session,id:'other'}};
 assert.equal(project({sessions:new Map([['night',lab],['other',duplicateLab]]),papers:[{...source,reading:{...reading,extraction:extraction([closing])}}]}).items[0].reason,'AMBIGUOUS_MATCH');
 const foreign={...lab,session:{...lab.session,id:'foreign',companyId:'elsewhere',terminalPos:'OTHER'}};
 const foreignHeader=project({sessions:new Map([['night',lab],['foreign',foreign]]),papers:[{...source,reading:{...reading,extraction:extraction([header('Ταμείο:OTHER'),closing])}}]});assert.equal(foreignHeader.items[0].status,'UNRESOLVED');
 const loneNumber={...raw,operatorText:'2'};assert.equal(project({sessions:new Map([['night',{...original,session:{...original.session,openedByName:'2'}}]]),papers:[{...source,reading:{...reading,extraction:normalizePaper(loneNumber)}}]}).items[0].status,'UNRESOLVED');
});
