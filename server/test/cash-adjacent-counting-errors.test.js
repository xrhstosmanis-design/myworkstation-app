import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAdjacentCashCountingCandidates,adjacentCashCountingText} from '../src/services/cash-adjacent-counting-errors.js';

const cents=x=>x===null||x===undefined?null:Math.round(Number(x)*100);
const immediately=(a,b,rule)=>{
  const p=a?.session,n=b?.session;
  return Boolean(rule.mode==='FULL'&&rule.carryOverEnabled===true&&p&&n
    &&p.companyId===n.companyId&&p.storeId===n.storeId&&p.terminalPos===n.terminalPos
    &&p.status==='CLOSED'&&n.status==='CLOSED'&&p.nextSession?.id===n.id
    &&new Date(p.closedAt)<=new Date(n.openedAt)
    &&new Date(p.openedAt)<=new Date(p.closedAt)&&new Date(n.openedAt)<=new Date(n.closedAt));
};
const current=r=>r.auditValid===true;
const base=(x=-34400,y=34308)=>{
  const a={id:'a',companyId:'company',storeId:'store',terminalPos:'POS1',status:'CLOSED',openedAt:'2026-10-22T22:07:00Z',closedAt:'2026-10-23T03:10:00Z',actualOperational:'1081.60',nextSession:{id:'b'}};
  const b={id:'b',companyId:'company',storeId:'store',terminalPos:'POS1',status:'CLOSED',openedAt:'2026-10-23T03:11:00Z',closedAt:'2026-10-23T11:10:00Z',openingOperational:'1081.60',previousSession:{id:'a'}};
  const sessions=new Map([['a',{session:a,sourceHash:'hash-a'}],['b',{session:b,sourceHash:'hash-b'}]]);
  const rows=new Map([['a',{sessionId:'a',sourceHash:'hash-a',operatorName:'Night',remainingCents:x,offsetCents:0,offsets:[],recheck:false,reviewed:false,auditValid:true,cardCents:-22750}],['b',{sessionId:'b',sourceHash:'hash-b',operatorName:'Morning',remainingCents:y,offsetCents:0,offsets:[],recheck:false,reviewed:false,auditValid:true,cardCents:22750}]]);
  return {source:{sessions,rule:{mode:'FULL',carryOverEnabled:true},selectedIds:['a','b']},rows};
};
const project=input=>projectAdjacentCashCountingCandidates({...input,immediatePair:immediately,cashCurrent:current,exactCents:cents,localDay:x=>new Date(x).toISOString().slice(0,10)});

test('unequal adjacent opposite signs produce a counting candidate plus exact residual without touching cash or cards',()=>{
  const input=base(),before=structuredClone(input),pairs=project(input);
  assert.equal(pairs.length,1);
  assert.deepEqual([pairs[0].previousDifferenceCents,pairs[0].nextDifferenceCents,pairs[0].commonCents,pairs[0].previousResidualCents,pairs[0].nextResidualCents],[-34400,34308,34308,-92,0]);
  assert.equal(pairs[0].status,'COUNTING_ERROR_CANDIDATE');
  assert.deepEqual([...input.rows.values()].map(v=>v.cardCents),[-22750,22750]);
  assert.deepEqual(input,before,'source snapshot, original cash, card and prior review are immutable');
  const prose=adjacentCashCountingText(pairs).join('\n');
  assert.match(prose,/ΠΡΟΤΕΙΝΟΜΕΝΟ ΛΑΘΟΣ ΚΑΤΑΜΕΤΡΗΣΗΣ/);
  assert.match(prose,/343,08/);assert.match(prose,/0,92/);assert.match(prose,/όχι οριστικός συμψηφισμός/);
});
test('equal and reversed +/- values are recognized, never automatically applied',()=>{
  for(const [x,y,common,px,ny]of [[-8000,8000,8000,0,0],[500,-700,500,0,-200],[700,-500,500,200,0]]){
    const input=base(x,y),before=structuredClone(input.rows),pairs=project(input);
    assert.equal(pairs.length,1);assert.equal(pairs[0].commonCents,common);assert.equal(pairs[0].previousResidualCents,px);assert.equal(pairs[0].nextResidualCents,ny);
    assert.deepEqual(input.rows,before);
  }
});
test('not genuinely consecutive, scope-separated or carry-disabled pairs fail closed',()=>{
  const changes=[
    x=>x.source.sessions.get('a').session.nextSession={id:'other'},
    x=>x.source.sessions.get('b').session.previousSession={id:'other'},
    x=>x.source.sessions.get('b').session.companyId='foreign',
    x=>x.source.sessions.get('b').session.storeId='foreign',
    x=>x.source.sessions.get('b').session.terminalPos='POS2',
    x=>x.source.sessions.get('b').session.status='OPEN',
    x=>x.source.sessions.get('a').session.status='OPEN',
    x=>x.source.sessions.get('a').session.closedAt='2026-10-23T04:00:00Z',
    x=>x.source.sessions.get('b').session.openingOperational='1081.59',
    x=>x.source.sessions.get('a').session.actualOperational=null,
    x=>x.source.rule.carryOverEnabled=false,
    x=>x.source.rule.mode='DIFFERENCE_ONLY',
    x=>x.source.selectedIds=['other']
  ];
  for(const change of changes){const input=base();change(input);assert.deepEqual(project(input),[],change.toString());}
});
test('cash evidence uncertainty, already approved offset and prior manual review are never revived',()=>{
  const changes=[
    x=>x.rows.get('a').auditValid=false,
    x=>x.rows.get('b').auditValid=false,
    x=>x.rows.get('a').recheck=true,
    x=>x.rows.get('b').reviewed=true,
    x=>x.rows.get('a').offsetCents=34308,
    x=>x.rows.get('b').offsets=['original-manual-offset'],
    x=>x.rows.get('a').remainingCents=null,
    x=>x.rows.get('a').remainingCents=0,
    x=>x.rows.get('b').remainingCents=-34308,
    x=>x.rows.get('b').remainingCents=Number.MAX_SAFE_INTEGER+1,
  ];
  for(const change of changes){const input=base();change(input);assert.deepEqual(project(input),[],change.toString());}
});
test('cards-only opposite differences cannot manufacture a cash-counting finding',()=>{
  const input=base(0,0);input.rows.get('a').cardCents=-22750;input.rows.get('b').cardCents=22750;assert.deepEqual(project(input),[]);
});
test('triple alternating differences are disclosed as ambiguous without allocating the same shift twice',()=>{
  const input=base(),b=input.source.sessions.get('b').session;
  b.nextSession={id:'c'};const c={id:'c',companyId:'company',storeId:'store',terminalPos:'POS1',status:'CLOSED',openedAt:'2026-10-23T11:11:00Z',closedAt:'2026-10-23T18:00:00Z',openingOperational:'1250.00',previousSession:{id:'b'}};
  b.actualOperational='1250.00';input.source.sessions.set('c',{session:c,sourceHash:'hash-c'});
  input.rows.set('c',{sessionId:'c',sourceHash:'hash-c',operatorName:'Afternoon',remainingCents:-10000,offsetCents:0,offsets:[],recheck:false,reviewed:false,auditValid:true,cardCents:0});
  input.source.selectedIds=['a','b','c'];
  const pairs=project(input);assert.equal(pairs.length,2);assert(pairs.every(p=>p.status==='AMBIGUOUS_OVERLAP'&&p.commonCents===null&&p.previousResidualCents===null&&p.nextResidualCents===null));
  assert.match(adjacentCashCountingText(pairs).join('\n'),/ΑΜΦΙΒΟΛΗ ΑΛΛΗΛΟΥΧΙΑ/);
});
test('selected period boundary keeps only the linked pair, with deterministic ordering',()=>{
  const input=base();input.source.selectedIds=['b'];assert.equal(project(input).length,1);
  input.source.selectedIds=['other'];assert.deepEqual(project(input),[]);
  assert.deepEqual(adjacentCashCountingText([]),[]);
});

test('business-day label comes from injected Athens date policy, not UTC prefix',()=>{
 const input=base(),pairs=projectAdjacentCashCountingCandidates({...input,immediatePair:immediately,cashCurrent:current,exactCents:cents,localDay:()=> '2026-10-24'});
 const summary=adjacentCashCountingText(pairs).join('\n');assert.match(summary,/2026-10-24/);
});
