import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAutomaticCash,automaticCashAuditText,automaticCashAuditSchema} from '../src/services/cash-automatic-audit.js';

const rule={mode:'FULL',carryOverEnabled:true};
function fixture(){
 const session={id:'a',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedAt:'2026-10-21T06:00:00Z',closedAt:'2026-10-21T14:00:00Z',openingDrawer:80,openingCustody:10,openingCoins:10,openingOperational:100,closingDrawer:95,closingCustody:10,closingCoins:10,actualOperational:115,expectedOperational:120,variance:-5,cashSales:50,expenses:25,cardSales:30,eftposTotal:28,cardVariance:2,openingSafe:500,closingSafe:500,nextSession:{id:'b'}};
 const transactions=[['cash','SALE_CASH',50],['card','SALE_CARD',30],['in','TRANSFER_AMOUNT',10],['out','TRANSFER_OUT',15],['expense','SUPPLIER_PAYMENT',25],['external','OTHER_EXPENSE',90]].map(([id,type,amount])=>({id,type,amount,companyId:'co',storeId:'store',sessionId:'a',subtractFromShift:id!=='external',reversedAt:null}));
 const next={...session,id:'b',openedAt:'2026-10-21T14:01:00Z',closedAt:'2026-10-21T22:00:00Z',openingOperational:115,nextSession:null};
 return {session,transactions,next,rule};
}
test('recomputes original cash and cards with expenses, transfers and external payments; never mutates or approves',()=>{
 const input=fixture(),original=structuredClone(input),a=assessAutomaticCash(input);
 assert.equal(a.status,'CALCULATED');assert.equal(a.cashVarianceCents,-500);assert.equal(a.bankCardVarianceCents,200);assert.equal(a.irisCents,0);
 assert.equal(a.financialAdjustmentCents,0);assert.equal(a.humanApproval,false);assert.deepEqual(a.openIssues,[]);assert.deepEqual(input,original);
 assert.equal(a.checks.find(c=>c.code==='NEXT_HANDOFF').status,'MATCHED');
 assert.equal(automaticCashAuditSchema.safeParse({...a,humanApproval:true}).success,false);
});
test('missing, malformed and overflowing data never become a zero or a completed check',()=>{
 for(const field of ['openingDrawer','closingCoins','actualOperational','eftposTotal','variance'])for(const v of [null,undefined,'',true,'NaN','0.001','99999999999999999999']){
  const input=fixture();input.session[field]=v;const a=assessAutomaticCash(input);assert.equal(a.status,'INCOMPLETE',field+':'+v);assert.equal(a.cashVarianceCents,null);
 }
 for(const transactions of [undefined,Array(501).fill({}),[{id:'alien',companyId:'elsewhere'}]]){const a=assessAutomaticCash({...fixture(),transactions});assert.equal(a.status,'INCOMPLETE');}
});
test('changed stored arithmetic and stale source stay incomplete, rather than confirming a numerical variance',()=>{
 for(const field of ['expectedOperational','cashSales','cardSales','cardVariance']){
  const input=fixture();input.session[field]=999;const a=assessAutomaticCash(input);assert.equal(a.status,'INCOMPLETE');assert(a.openIssues.includes('SOURCE_CHANGED'));
 }
 const a=assessAutomaticCash({...fixture(),sourceValid:false});assert.equal(a.status,'INCOMPLETE');assert(a.openIssues.includes('SOURCE_CHANGED'));
});
test('reversed entries do not count twice, signed cash returns do count, unknown types never silently disappear',()=>{
 const input=fixture();input.transactions.push({...input.transactions[0],id:'reversed',amount:100,reversedAt:'2026-10-21T10:00:00Z'});assert.equal(assessAutomaticCash(input).cashVarianceCents,-500);
 input.transactions.push({...input.transactions[0],id:'return',amount:-10});input.session.cashSales=40;input.session.expectedOperational=110;input.session.variance=5;
 const a=assessAutomaticCash(input);assert.equal(a.status,'CALCULATED');assert.equal(a.cashVarianceCents,500);
 input.transactions.push({...input.transactions[0],id:'unknown',type:'UNSUPPORTED'});assert.equal(assessAutomaticCash(input).status,'INCOMPLETE');
 input.transactions.pop();input.transactions.push(input.transactions[0]);assert.equal(assessAutomaticCash(input).status,'INCOMPLETE');
});
test('IRIS remains separate and visibly unresolved without changing the recorded cash or pretending EFTPOS agreement',()=>{
 const input=fixture();input.transactions.push({...input.transactions[0],id:'iris',type:'SALE_IRIS',amount:10});input.session.cardSales=40;input.session.cardVariance=12;
 const a=assessAutomaticCash(input);assert.equal(a.status,'CALCULATED');assert.equal(a.cashVarianceCents,-500);assert.equal(a.irisCents,1000);assert.equal(a.bankCardVarianceCents,null);assert(a.openIssues.includes('IRIS_CHANNEL_REQUIRES_CHECK'));
 assert.match(automaticCashAuditText(a).join('\n'),/Εκκρεμότητα:.*IRIS/);
});
test('handoff mismatches and the last shift stay open without suppressing a known calculation or inventing an offset',()=>{
 const input=fixture();input.next.openingOperational=120;const a=assessAutomaticCash(input);assert.equal(a.status,'CALCULATED');assert.equal(a.cashVarianceCents,-500);assert(a.openIssues.includes('NEXT_HANDOFF_MISMATCH'));assert.equal(a.financialAdjustmentCents,0);assert.match(automaticCashAuditText(a).join('\n'),/παράδοση στην επόμενη βάρδια · απόκλιση \+5,00/);
 for(const next of [null,{...input.next,status:'OPEN'}]){const a=assessAutomaticCash({...input,next});assert.equal(a.status,'CALCULATED');assert(a.openIssues.includes('AWAITING_NEXT_SHIFT'));}
 for(const patch of [{terminalPos:'DELIVERY'},{companyId:'other'},{storeId:'other'},{openedAt:'2026-10-21T13:00:00Z'}]){
  const a=assessAutomaticCash({...fixture(),next:{...fixture().next,...patch}});assert(a.openIssues.includes('NEXT_HANDOFF_MISMATCH'));assert.equal(a.checks.at(-1).status,'UNAVAILABLE');
 }
});
test('a safe movement is an open document question, not another cash deduction; mode and fingerprints retain provenance',()=>{
 const input=fixture(),before=assessAutomaticCash(input);input.session.closingSafe=300;const after=assessAutomaticCash(input);assert.notEqual(after.fingerprint,before.fingerprint);assert.equal(after.cashVarianceCents,-500);assert(after.openIssues.includes('SAFE_MOVEMENT_REQUIRES_DOCUMENT'));
 assert.equal(assessAutomaticCash({...input,rule:{mode:'POS_EFTPOS_ONLY'}}).status,'NOT_APPLICABLE');
 const difference=assessAutomaticCash({session:{id:'difference-only',variance:-7},transactions:undefined,rule:{mode:'DIFFERENCE_ONLY',carryOverEnabled:false}});assert.equal(difference.status,'NOT_APPLICABLE');assert.deepEqual(difference.checks,[]);assert.deepEqual(difference.openIssues,[]);
});
