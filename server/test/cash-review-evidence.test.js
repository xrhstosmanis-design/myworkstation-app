import test from 'node:test';
import assert from 'node:assert/strict';
import {consecutiveSaleCandidates,shiftChainEvidence,readCashReviewEvidence} from '../src/services/cash-review-evidence.js';
const line={productId:'p',description:'Water',quantity:1,unitPrice:5,discount:0,lineTotal:5};
const sale=(id,seconds=0,extra={})=>({saleId:id,linked:true,occurredAt:new Date(Date.UTC(2026,9,12,10,0,seconds)),total:5,lines:[{...line}],payments:[{method:'CASH',amount:5}],...extra});
const shift=(id,hour,variance=0,extra={})=>({sessionId:id,companyId:'c',storeId:'s',terminalPos:'MAIN',openedAt:new Date(Date.UTC(2026,9,12,hour)),closedAt:new Date(Date.UTC(2026,9,12,hour+8)),status:'CLOSED',variance,...extra});
test('actual baskets and payment changes are candidates without card variance; evidence is retained, never corrected',()=>{
 const a=sale('a'),b=sale('b',20,{payments:[{method:'CARD',amount:5}]});const before=JSON.stringify([a,b]);
 const out=consecutiveSaleCandidates([b,a]);assert.equal(out.length,1);assert.equal(out[0].requiresConfirmation,true);assert.equal(out[0].secondsApart,20);assert.equal(out[0].transactions[0].products[0].productId,'p');assert.equal(out[0].transactions[1].payments[0].method,'CARD');assert.equal(JSON.stringify([a,b]),before);
});
test('different items, pack quantity, repeated lines, discounts, missing identity, unlinked and nonadjacent sales never masquerade as same basket',()=>{
 for(const lines of [[{...line,productId:'other'}],[{...line,quantity:2}],[line,line],[{...line,discount:1}],[{...line,productId:null}]])assert.equal(consecutiveSaleCandidates([sale('a'),sale('b',20,{lines})]).length,0);
 assert.equal(consecutiveSaleCandidates([sale('a'),sale('unlinked',10,{linked:false}),sale('b',20)]).length,0);
 assert.equal(consecutiveSaleCandidates([sale('a'),sale('b',121)]).length,0);
 assert.equal(consecutiveSaleCandidates([sale('a'),sale('b',20,{lines:[]})]).length,0);
});
test('same-chain next two and preceding context cross dates without including other tenants, terminals or overlapping sessions',()=>{
 const current=shift('current',22,-27.3),next=shift('next',30,29.4);const before=JSON.stringify(current);
 const result=shiftChainEvidence(current,[shift('previous',14),next,shift('second',38),shift('foreign',30,27.3,{companyId:'x'}),shift('delivery',30,27.3,{terminalPos:'DELIVERY'})]);
 assert.equal(result.findings.length,1);assert.equal(result.findings[0].netVariance,2.1);assert.equal(result.findings[0].contextOnly,true);assert.equal(result.nextClosedCount,2);assert.equal(result.context.length,4);assert.equal(JSON.stringify(current),before);
 assert.equal(shiftChainEvidence(current,[shift('overlap',23,27.3)]).findings.length,0);
 assert.equal(shiftChainEvidence(current,[shift('open',30,null,{closedAt:null,status:'OPEN'}),shift('later',38,27.3)]).findings.length,0);
});
test('read source binds immutable tenant/store/session; failures and caps stay explicit and read-only',async()=>{
 const calls=[];const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});return sql.includes('FROM "Sale" s')?[sale('a'),sale('b',10)]:[shift('next',30),shift('second',38)];}};
 const out=await readCashReviewEvidence(db,shift('current',22));assert.equal(out.salesStatus,'LINKED_POS_SCOPE');assert.equal(out.chainStatus,'CONTEXT_AVAILABLE');assert.equal(out.checkedSales,2);assert.equal(out.findings.length,1);assert.equal(out.readOnly,true);
 assert(calls.every(c=>c.values.includes('c')&&c.values.includes('s')));assert(calls[0].values.includes('current'));assert(calls[1].values.includes('MAIN'));assert(calls[0].sql.includes('LIMIT 2001'));assert(calls[0].sql.includes('LIMIT 1001'));
 const failed=await readCashReviewEvidence({$queryRaw:async()=>{throw Error('offline')}},shift('current',22));assert.equal(failed.salesStatus,'UNAVAILABLE');assert.equal(failed.chainStatus,'UNAVAILABLE');assert.equal(failed.findings.length,0);
 const capped=await readCashReviewEvidence({$queryRaw:async strings=>strings.join('').includes('FROM "Sale" s')?Array.from({length:2001},(_,i)=>sale(String(i))):[]},shift('current',22));assert.equal(capped.salesStatus,'LIMITED');assert.equal(capped.checkedSales,null);assert.equal(capped.findings.length,0);assert.equal(capped.chainStatus,'AWAITING_NEXT_SHIFTS');
});

test('actual Analyses labels expose both receipts, products, methods and contextual net with no automatic attribution',async()=>{
 const {readFileSync}=await import('node:fs');const ui=readFileSync(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8');
 const body=ui.slice(ui.indexOf('const cashNumber='),ui.indexOf('const cashWrittenReport='));const label=new Function(body+';return cashFindingLabel;')();
 const duplicate=consecutiveSaleCandidates([sale('receipt-a'),sale('receipt-b',30,{payments:[{method:'CARD',amount:5}]})])[0];const text=label(duplicate);
 for(const value of ['receipt-a','receipt-b','Water','CASH','CARD','δεν αφαιρείται αυτόματα'])assert(text.includes(value));
 const offset=shiftChainEvidence(shift('current',22,-27.3),[shift('next',30,29.4) ]).findings[0];const rendered=label(offset);assert(rendered.includes('next'));assert.match(rendered,/2,10/);assert.match(rendered,/χωρίς αλλαγή συνόλων ή καταλογισμό/);
});
