import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {consecutiveSaleCandidates} from '../src/services/cash-review-evidence.js';
import {linkRecordedCorrections,readRecordedCorrections} from '../src/services/cash-correction-links.js';
const session={companyId:'c',storeId:'s',sessionId:'current',openedAt:new Date('2026-10-11T10:00:00Z'),closedAt:new Date('2026-10-12T20:00:00Z')};
const finding={code:'SALE_LINE_DUPLICATE_CANDIDATE',amount:1,requiresConfirmation:true,secondsApart:76.229,transactions:['a','b'].map((saleId,i)=>({saleId,occurredAt:`2026-10-11T17:3${7+i}:00Z`,total:1,products:[{description:'Water',quantity:1}],payments:[{method:'CASH',amount:1}]}))};
const row=(original='a',extra={})=>({transactionId:original+'-tx',companyId:'c',storeId:'s',sessionId:'current',type:'SALE_CASH',amount:-1,description:`POS ΕΠΙΣΤΡΟΦΗ ${original}-reverse · αρχική ${original} · ΜΕΤΡΗΤΑ`,reversedAt:null,correctionSaleId:original+'-reverse',source:'POS_REVERSAL',status:'COMPLETED',total:-1,occurredAt:'2026-10-11T17:39:00Z',payments:[{method:'CASH',amount:-1}],...extra});
test('recorded complete, partial and absent corrections retain original candidate and immutable financial values',()=>{
 const rows=[row('a'),row('b')],before=JSON.stringify({finding,rows,session});
 const out=linkRecordedCorrections(finding,rows,session);assert.equal(out.recordedCorrectionSummary.recordedNet,0);assert(out.transactions.every(s=>s.recordedCorrections.status==='FULL_AMOUNT_CORRECTED'));assert.equal(out.amount,1);assert.equal(out.requiresConfirmation,true);assert.equal(JSON.stringify({finding,rows,session}),before);
 const partial=linkRecordedCorrections(finding,[row('a',{amount:-.4,total:-.4,payments:[{method:'CASH',amount:-.4}]})],session);assert.equal(partial.transactions[0].recordedCorrections.recordedNet,.6);assert.equal(partial.transactions[0].recordedCorrections.status,'PARTIAL_AMOUNT_CORRECTED');assert.equal(partial.transactions[1].recordedCorrections.recordedNet,1);assert.equal(partial.recordedCorrectionSummary.recordedNet,1.6);
});
test('only exact owned same-session correction links qualify; wrong identity, plain text and reversed records never explain a sale',()=>{
 for(const extra of [{companyId:'foreign'},{storeId:'control'},{sessionId:'other'},{reversedAt:'2026-10-12'},{description:'expense a-reverse a'},{description:'POS ΕΠΙΣΤΡΟΦΗ a-reverse · αρχική prefix-a · CASH'}]){
  const out=linkRecordedCorrections(finding,[row('a',extra)],session);assert.equal(out.transactions[0].recordedCorrections.recordedNet,1);
 }
 for(const extra of [{correctionSaleId:'wrong'},{source:'POS'},{status:'VOID'},{amount:0},{amount:1},{amount:NaN},{total:-2},{payments:[{method:'CARD',amount:-1}]},{payments:[]},{occurredAt:'invalid'},{occurredAt:'2026-10-10T01:00:00Z'}]){
  const out=linkRecordedCorrections(finding,[row('a',extra)],session);assert.equal(out.transactions[0].recordedCorrections.status,'RECHECK_REQUIRED');assert.equal(out.recordedCorrectionSummary.recordedNet,null);
 }
 const over=linkRecordedCorrections(finding,[row('a',{amount:-2,total:-2,payments:[{method:'CASH',amount:-2}]})],session);assert.equal(over.transactions[0].recordedCorrections.recordedNet,null);
 const duplicate=linkRecordedCorrections(finding,[row('a'),row('a')],session);assert.equal(duplicate.recordedCorrectionSummary.recordedNet,null);
 const ambiguous=linkRecordedCorrections(finding,[row('a'),row('b',{correctionSaleId:'a-reverse',description:'POS ΕΠΙΣΤΡΟΦΗ a-reverse · αρχική b · CASH'})],session);assert.equal(ambiguous.recordedCorrectionSummary.recordedNet,null);assert(ambiguous.transactions.every(t=>t.recordedCorrections.status==='RECHECK_REQUIRED'));
});
test('split cash/card corrections require all method amounts and total, including post-close same-session evidence',()=>{
 const payments=[{method:'CASH',amount:-.6},{method:'CARD',amount:-.4}],a=row('a',{amount:-.6,payments,occurredAt:'2026-10-13T01:00:00Z'}),b=row('a',{transactionId:'card-tx',type:'SALE_CARD',amount:-.4,payments,occurredAt:'2026-10-13T01:00:00Z'});
 assert.equal(linkRecordedCorrections(finding,[a,b],session).transactions[0].recordedCorrections.recordedNet,0);
 assert.equal(linkRecordedCorrections(finding,[a],session).transactions[0].recordedCorrections.recordedNet,null);
});
test('real correction reader retains explicit missing/limited source and emits scoped read-only SQL',async()=>{
 const calls=[];const db={$queryRaw:async(strings,...values)=>{calls.push({sql:strings.join('?'),values});return [row('a'),row('b')];}};
 const out=await readRecordedCorrections(db,session,[finding]);assert.equal(out[0].recordedCorrectionSummary.recordedNet,0);assert(calls[0].values.includes('c')&&calls[0].values.includes('s')&&calls[0].values.includes('current'));assert.match(calls[0].sql,/LEFT JOIN "Sale" c/);assert.match(calls[0].sql,/LIMIT 2001/);
 for(const db of [{$queryRaw:async()=>{throw Error('offline')}},{$queryRaw:async()=>Array.from({length:2001},()=>row())}])assert.equal((await readRecordedCorrections(db,session,[finding]))[0].recordedCorrectionSummary.recordedNet,null);
 assert.deepEqual(await readRecordedCorrections({$queryRaw:()=>{throw Error('must not query')}},session,[]),[]);
});
test('actual Platform label and written paragraph retain exact correction IDs, recorded net and no second deduction',()=>{
 const ui=readFileSync(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8');const body=ui.slice(ui.indexOf('const cashNumber='),ui.indexOf('const cashWrittenReport='));const label=new Function(body+';return cashFindingLabel;')();
 const out=linkRecordedCorrections(finding,[row('a'),row('b')],session),text=label(out);for(const word of ['a-reverse','b-reverse','a-tx','b-tx','διορθωθεί ολόκληρο','δεν αφαιρείται ξανά','χωρίς καταγεγραμμένο αριθμό απόδειξης'])assert(text.includes(word));assert.match(text,/καθαρό ποσό ζεύγους 0,00/);
 const writtenBody=ui.slice(ui.indexOf('const cashNumber='),ui.indexOf('const cashShiftResult='));const report=new Function(writtenBody+';return cashWrittenReport;')();const paragraph=report({variance:-5.5,investigation:{completed:false,findings:[out]}});assert.equal(paragraph.paragraphs[0],text);assert.match(paragraph.conclusion,/ΠΡΟΣΩΡΙΝΟ/);
 const unknown=label(linkRecordedCorrections(finding,[],session,'UNAVAILABLE'));assert.match(unknown,/Καθαρό ποσό ζεύγους άγνωστο/);assert.doesNotMatch(unknown,/καθαρό ποσό ζεύγους 0,00/);
});

test('recorded actual LAB source pair and both existing corrections produce zero information net without changing variance',()=>{
 const evidence=JSON.parse(readFileSync(new URL('../../CHECKPOINTS/EVIDENCE/cash-central-review-20261016/source-reconciliation.json',import.meta.url),'utf8'));
 const sales=evidence.results.sourceSaleResult.flat(),reversals=evidence.results.sourceReturnSaleResult.flat(),movements=evidence.results.sourceRawMovementResult.flat();
 const scope={companyId:evidence.companyId,storeId:evidence.storeId,sessionId:sales[0].ledger[0].sessionId};
 const candidate=consecutiveSaleCandidates(sales.map(s=>({...s,saleId:s.id,linked:true})))[0];assert.equal(candidate.secondsApart,76.229);
 const rows=movements.filter(t=>Number(t.amount)<0).map(t=>{const id=t.description.match(/^POS (?:ΑΚΥΡΩΣΗ|ΕΠΙΣΤΡΟΦΗ) ([^ ]+)/)[1],r=reversals.find(r=>r.id===id);return {...scope,...t,transactionId:t.id,correctionSaleId:id,source:r.source,status:r.status,total:r.total,occurredAt:r.occurredAt,payments:r.payments};});
 const result=linkRecordedCorrections(candidate,rows,scope);assert.equal(result.recordedCorrectionSummary.recordedNet,0);assert.equal(result.transactions.length,2);assert(result.transactions.every(t=>t.recordedCorrections.status==='FULL_AMOUNT_CORRECTED'));assert.equal(evidence.results.sourceShiftResult.flat().find(s=>s.id==='4d853b34-4ce3-4086-970e-14537cf1fd7b').variance,-5.5);
});
