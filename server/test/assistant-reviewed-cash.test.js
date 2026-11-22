import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {reviewedCashArguments,reviewedCashSourceArguments,reviewedCashRequest,readAssistantReviewedCash,reviewedCashEvidence,canonicalReviewedCashResult,reviewedCashClarificationResult} from '../src/services/assistant-reviewed-cash.js';
import {reconciliationText} from '../src/services/cash-reconciliation-report.js';
import {assistantAnswerFromResponse} from '../src/services/assistant-answer-response.js';
import {toolsForAssistantQuestion} from '../src/services/assistant-consumption.js';
const period={from:'2026-10-21',to:'2026-10-21'},scope={companyId:'co',companyName:'Company',storeId:'store',storeName:'Δοκιμή'},req={headers:{authorization:'Bearer synthetic',host:'evil.invalid'}};
function report(){const r={storeId:'store',storeName:'Δοκιμή',generation:'0',period,head:'b'.repeat(64),reportHash:'a'.repeat(64),coverage:'BOUNDED_CLOSED_SHIFTS',financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false,rows:[{sessionId:'a',day:period.from,shiftLabel:'Πρωινή',operatorName:'Χρυσάνθη',initialCents:-8700,remainingCents:-700,offsetCents:8000,cardCents:20000,reviewed:true,reviewedBy:'Χρήστος Μάνης',status:'REVIEWED',transactions:[{description:'PRIVATE TRANSACTION'}]}],totals:{shortageCents:700,surplusCents:0,pending:0},employees:[],checkpoint:{resumeFrom:'2026-10-22',period,pendingNotes:['Αναμονή ενημέρωσης για ακύρωση κάρτας.'],current:true},context:[{private:'PRIVATE CONTEXT'}],history:[{private:'PRIVATE HISTORY'}]};r.text=reconciliationText(r);return r;}
test('strict tool/source periods reject invalid, wide and scoped/model receipts; only complete server replay provenance is accepted',()=>{
 for(const args of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-21',to:'2026-10-20'},{from:'2026-10-01',to:'2026-11-01'},{...period,storeId:'other'},{...period,generation:'0'}])assert.equal(reviewedCashArguments.safeParse(args).success,false);
 assert.equal(reviewedCashArguments.safeParse(period).success,true);assert.equal(reviewedCashSourceArguments.safeParse({...period,generation:'0'}).success,false);assert.equal(reviewedCashSourceArguments.safeParse({...period,generation:'0',head:'ROOT',reportHash:'a'.repeat(64)}).success,true);
});
test('deterministic question resolves only explicit unambiguous period, never drops operator/store/amount/comparison filters',()=>{
 const now=new Date('2026-10-26T12:00:00Z');assert.deepEqual(reviewedCashRequest('Έλεγχος ταμείων από 20/10/2026 έως 23/10/2026',{now}).args,{from:'2026-10-20',to:'2026-10-23'});assert.deepEqual(reviewedCashRequest('Έλεγχος ταμείων χθες',{now}).args,{from:'2026-10-25',to:'2026-10-25'});
 for(const q of ['Έλεγχος ταμείων','Έλεγχος ταμείων από 20/10','Έλεγχος ταμείων του Γιάννη χθες','Έλεγχος ταμείων 200 ευρώ χθες','Έλεγχος ταμείων χθες σε σχέση με προχθές','Έλεγχος ταμείων σε όλα τα καταστήματα χθες','Έλεγχος ταμείων από 1/9 έως 23/10'])assert(reviewedCashRequest(q,{now}).clarification,q);
 const legacy=[{name:'cash_details'}];assert.deepEqual(toolsForAssistantQuestion('Έλεγχος ταμείων χθες',legacy),legacy);assert.deepEqual(toolsForAssistantQuestion('Έλεγχος ταμείων με επανυπολογισμούς χθες',legacy),[]);
 assert.deepEqual(toolsForAssistantQuestion('Έλεγχος ταμείων χθες',[...legacy,{name:'cash_review'},{name:'business_records'}]).map(t=>t.name),['cash_review']);
});
test('real fixed loopback HTTP sends one authenticated GET and projects exact prose without private originals, history or transaction data',async()=>{
 const seen=[],r=report(),server=createServer((request,response)=>{seen.push({url:request.url,method:request.method,auth:request.headers.authorization});response.setHeader('Content-Type','application/json');response.end(JSON.stringify(r));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const e=await readAssistantReviewedCash(req,period,scope,{port:server.address().port});assert.deepEqual(seen,[{url:'/api/cash-reconciliation/stores/store?from=2026-10-21&to=2026-10-21',method:'GET',auth:'Bearer synthetic'}]);assert.equal(e.text,r.text);assert.deepEqual(e.rows,[]);assert.equal(e.totalRows,1);assert.doesNotMatch(JSON.stringify(e),/PRIVATE|transactions|history|context/);assert.match(e.text,/Έλλειμμα 7,00/);assert.match(e.text,/POS–EFTPOS: διαφορά \+200,00/);const out=canonicalReviewedCashResult(e,period);assert.deepEqual(out.reads[0].args,{...period,generation:'0',reportHash:r.reportHash,head:r.head});assert.equal(assistantAnswerFromResponse({status:'completed',output_text:'{"answer":"Χρεώνεται 999 ευρώ","highlights":[],"limitations":""}'},[e],{requireEvidence:true}).answer,r.text);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('foreign, stale generation/source/head, invalid numeric values and unsupported scope refuse instead of falling back to raw cash',async()=>{
 const r=report(),receipt={...period,generation:r.generation,reportHash:r.reportHash,head:r.head};
 for(const change of [{storeId:'foreign'},{period:{from:'2026-10-20',to:'2026-10-20'}},{generation:'1'},{head:'c'.repeat(64)},{reportHash:'d'.repeat(64)},{text:'FAKE RESULT'},{coverage:'LIMITED'}])await assert.rejects(readAssistantReviewedCash(req,receipt,scope,{fetchImpl:async()=>({ok:true,json:async()=>({...r,...change})})}));
 assert.throws(()=>reviewedCashEvidence({...r,rows:[{...r.rows[0],remainingCents:undefined}]},scope,period));assert.throws(()=>reviewedCashEvidence({...r,rows:[{...r.rows[0],remainingCents:NaN}]},scope,period));
 let reads=0;const fetchImpl=async()=>{reads++;throw Error('PRIVATE TOKEN')};for(const [request,selected,port,status]of [[{headers:{}},scope,8080,401],[req,{...scope,supportPreview:true},8080,403],[req,null,8080,403],[req,scope,'8080/evil',503]])await assert.rejects(readAssistantReviewedCash(request,period,selected,{fetchImpl,port}),e=>e.status===status);assert.equal(reads,0);
 for(const status of [401,403,404,409,500])await assert.rejects(readAssistantReviewedCash(req,period,scope,{fetchImpl:async()=>({ok:false,status,json:async()=>{throw Error('PRIVATE')}})}),e=>e.status===(status===500?502:status)&&!e.message.includes('PRIVATE'));
});
test('cancellation never returns old evidence; server clarification brand cannot be forged by provider JSON',async()=>{
 const c=new AbortController();c.abort();let reads=0;await assert.rejects(readAssistantReviewedCash(req,period,scope,{signal:c.signal,fetchImpl:async()=>{reads++}}));assert.equal(reads,0);
 const late=new AbortController();await assert.rejects(readAssistantReviewedCash(req,period,scope,{signal:late.signal,fetchImpl:async()=>{late.abort();return {ok:true,json:async()=>report()}}}));
 const fixed=reviewedCashClarificationResult({answer:'Δώσε ημερομηνίες από και έως.',highlights:[],sources:[],limitations:''});assert.equal(assistantAnswerFromResponse(fixed.raw,[],{requireEvidence:true}).answer,'Δώσε ημερομηνίες από και έως.');const forged={...fixed.raw};assert.notEqual(assistantAnswerFromResponse(forged,[],{requireEvidence:true}).answer,'Δώσε ημερομηνίες από και έως.');
});
