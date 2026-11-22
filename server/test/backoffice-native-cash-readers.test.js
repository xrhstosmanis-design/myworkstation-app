import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readCashDailySummary,readCashSessionInvestigation} from '../src/routes/cash-control.js';

const req=(params={},query={})=>({user:{role:'EMPLOYEE',companyId:'C',storeId:'S',staffAccess:true},params,query});
const session={id:'shift',companyId:'C',storeId:'S',status:'CLOSED',openedAt:new Date('2026-11-01T08:00Z'),closedAt:new Date('2026-11-01T16:00Z'),cashSales:'20',cardSales:'0',eftposTotal:'2',expenses:'3',variance:'-10',cardVariance:'-2',openingVariance:'0',terminalPos:'POS',duplicateReviewJson:[]};
function database({investigation=false,stale=false,shiftFields={},eftposEnabled=true}={}){
 const queries=[];const snapshot={transactionCount:0,activeTotal:0,expenseTotal:0,reversedCount:0,lastMovementAt:null};
 return {queries,store:{findFirst:async args=>{assert.deepEqual(args.where,{id:'S',companyId:'C',active:true});return{id:'S',name:'Store'}}},$queryRaw:async(parts,...values)=>{const sql=parts.join('?');queries.push(sql);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i);if(sql.includes('FROM "CashControlStoreRule"'))return[{mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:eftposEnabled}];if(sql.includes('FROM "CashShiftSession"')){assert.ok(values.includes('C'));return[{...session,...shiftFields}]}if(sql.includes('to_regclass'))return[{operator:null,actions:null,safety:null}];if(sql.includes('COUNT(*)::int'))return[snapshot];if(sql.includes('FROM "CashControlReview"'))return[{id:'review',decision:'EXPLANATION',amount:'5',snapshotJson:stale?{...snapshot,transactionCount:1}:snapshot,createdAt:new Date('2026-11-02Z')}];return[]}};
}

test('cash canonical reader bodies match the reviewed report contracts outside injection/response boundaries',async()=>{
 const original=JSON.parse(await readFile(new URL('./fixtures/backoffice-cash-original-bodies.json',import.meta.url),'utf8'));
 const hashes={readCashDailySummary:'148bf75dad729e1f09f6cd9b3ab5c4e7ab59f2f7fc50e139079fd7ce1dade9f3',readCashSessionInvestigation:'d2bb99266baad6cafee1d768ff61e8ced954fa1a794956bbdc085f98c778170c'};
 const source=await readFile(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');
 for(const [name,body]of Object.entries(original)){
  assert.equal(createHash('sha256').update(body).digest('hex'),hashes[name]);
  const start=source.indexOf('  const prisma=db;\n',source.indexOf('export async function '+name))+19;
  const end=source.indexOf('\n}\n\nrouter.get(',start);
  const normalize=s=>s.replaceAll(',db)',')').replace('if(prepareSource)await prepareSource();','await ensurePosSaleSafetySchema();').replace('return ({','res.json({').replace('throw Object.assign(new Error("Για συγκεκριμένη βάρδια άνοιξε την Ανάλυση της βάρδιας."),{status:400})','return res.status(400).json({error:"Για συγκεκριμένη βάρδια άνοιξε την Ανάλυση της βάρδιας."})').replace('throw Object.assign(new Error("Δεν βρέθηκε η βάρδια."),{status:404})','return res.status(404).json({error:"Δεν βρέθηκε η βάρδια."})');
  assert.equal(normalize(source.slice(start,end)),body,name);
 }
});
test('actual daily cash reader preserves zero/negative financial calculations without preparation',async()=>{
 const db=database();const result=await readCashDailySummary(req({storeId:'S'},{date:'2026-11-01'}),{db});
 assert.equal(result.totals.cashSales,20);assert.equal(result.totals.cardSales,0);assert.equal(result.totals.variance,-10);assert.equal(result.totals.shortage,10);assert.equal(result.totals.cardVariance,-2);assert.equal(result.sessions[0].effectiveVariance,-10);assert.equal(result.coverageStatus,'PROVISIONAL');
 let prepared=0;await readCashDailySummary(req({storeId:'S'},{date:'2026-11-01'}),{db,prepareSource:async()=>prepared++});assert.equal(prepared,1);
});
test('actual investigation preserves review balance and stale proof semantics for genuine employee',async()=>{
 for(const stale of [false,true]){const db=database({investigation:true,stale}),result=await readCashSessionInvestigation(req({sessionId:'shift'}),{db});assert.equal(result.initialVariance,-10);assert.equal(result.cardVariance,-2);assert.equal(result.reviewEvidence,null);assert.equal(result.recheckRequired,stale);assert.equal(result.unexplainedVariance,stale?null:-5);assert.equal(result.reviewBalance.status,stale?'RECHECK_REQUIRED':'VALID');assert.ok(!db.queries.some(sql=>sql.includes('StorePaidModule')))}
});
test('native selected-store and missing-session errors survive pure-reader extraction',async()=>{
 await assert.rejects(readCashDailySummary(req({storeId:'OTHER'}),{db:database()}),error=>error.status===403);
 const db=database();db.$queryRaw=async()=>[];await assert.rejects(readCashSessionInvestigation(req({sessionId:'missing'}),{db}),error=>error.status===404);
});

test('pending shift investigation cannot treat an uncounted shift or earlier review as reconciled',async()=>{
 const db=database({investigation:true,shiftFields:{closeReconciliationStatus:'AWAITING_COUNT',variance:null,cardVariance:null,eftposTotal:null}});
 const result=await readCashSessionInvestigation(req({sessionId:'shift'}),{db});
 assert.equal(result.session.closeReconciliationStatus,'AWAITING_COUNT');
 assert.equal(result.status,'AWAITING_COUNT');
 assert.equal(result.recheckRequired,true);
 assert.equal(result.reviewBalance.reason,'SHIFT_AWAITING_COUNT');
 assert.equal(result.initialVariance,null);
 assert.equal(result.cardVariance,null);
 assert.equal(result.unexplainedVariance,null);
 assert.equal(result.finalizedShortage,false);
 assert.deepEqual(result.confirmedExplanations,[]);
 assert.ok(result.findings.some(row=>row.code==='SHIFT_AWAITING_COUNT'));
});
test('counted shift without EFTPOS keeps card values unavailable and cash variance known',async()=>{
 const db=database({shiftFields:{closeReconciliationStatus:'COUNTED',variance:0,eftposTotal:null,cardVariance:null},eftposEnabled:false});
 const daily=await readCashDailySummary(req({storeId:'S'},{date:'2026-11-01'}),{db});
 assert.equal(daily.totals.awaitingCount,0);
 assert.equal(daily.totals.variance,0);
 assert.equal(daily.totals.eftposTotal,null);
 assert.equal(daily.totals.cardVariance,null);
 const result=await readCashSessionInvestigation(req({sessionId:'shift'}),{db});
 assert.equal(result.initialVariance,0);
 assert.equal(result.cardVariance,null);
});
