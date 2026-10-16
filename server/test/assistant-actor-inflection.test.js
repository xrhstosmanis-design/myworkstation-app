import test from 'node:test';
import assert from 'node:assert/strict';
import {readAssistantBusiness} from '../src/services/assistant-business-reports.js';

const scope={companyId:'fixture-company',storeId:'fixture-store'},now=new Date('2026-10-16T10:00:00Z');
const args={domain:'TRANSFERS_TO_OWNER',from:'2026-10-01',to:'2026-10-16',query:'Νίκο Δοκιμαστικό',status:null};
const row=(id,extra={})=>({id,...scope,recordedAt:new Date('2026-10-12T10:00:00Z'),recordType:'TRANSFER_OUT',operatorName:'ΝΙΚΟΣ ΔΟΚΙΜΑΣΤΙΚΟΣ',label:'Εικονική παράδοση',amount:'1.01',...extra});
const read=(rows,a={})=>readAssistantBusiness({...args,...a},scope,{now,db:{$queryRaw:async()=>rows}});

test('full Greek inflected operator name finds only that stored transfer operator and retains original fields',async()=>{
 const out=await read([row('one'),row('two',{amount:'2.02'}),row('other',{operatorName:'ΜΑΡΙΟΣ ΑΛΛΟΣ'})]);
 assert.equal(out.result,'matched');assert.equal(out.rows.length,2);assert.equal(out.totals.amount,3.03);
 assert.equal(out.query,args.query);assert.equal(out.rows[0].operatorName,'ΝΙΚΟΣ ΔΟΚΙΜΑΣΤΙΚΟΣ');assert.equal(out.sourceRows,3);
 const nominative=await read([row('one')],{query:'νίκος δοκιμαστικός'});assert.equal(nominative.rows.length,1);
 const reversed=await read([row('one',{operatorName:'ΝΙΚΟ ΔΟΚΙΜΑΣΤΙΚΟ'})],{query:'ΝΙΚΟΣ ΔΟΚΙΜΑΣΤΙΚΟΣ'});assert.equal(reversed.rows.length,1);
});
test('exact search retains priority and full-name fallback never stems labels, suppliers or other domains',async()=>{
 const exact=row('exact',{operatorName:'ΜΑΡΙΟΣ ΑΛΛΟΣ',label:'Παράδοση από Νίκο Δοκιμαστικό'});
 assert.deepEqual((await read([row('fallback'),exact])).rows.map(r=>r.recordId),['exact']);
 for(const query of ['Νίκο Δοκιμα','Νικ Δοκιμαστικο','Αθηνα','Niko Dokimastiko'])assert.equal((await read([row('one')],{query})).result,'no_records',query);
 assert.equal((await read([row('label',{operatorName:null,label:'ΝΙΚΟΣ ΔΟΚΙΜΑΣΤΙΚΟΣ',supplierName:'ΝΙΚΟΣ ΔΟΚΙΜΑΣΤΙΚΟΣ'})])).result,'no_records');
 assert.equal((await read([row('expense',{recordType:'OTHER_EXPENSE'})],{domain:'EXPENSES'})).result,'no_records');
});
test('distinct eligible stored names require clarification while status and direction remain binding',async()=>{
 const variants=[row('one',{status:'RECORDED'}),row('two',{operatorName:'ΝΙΚΟΣ ΔΟΚΙΜΑΣΤΙΚΟ',status:'PENDING'})];
 await assert.rejects(read(variants),e=>e.status===422&&/ακριβ/.test(e.message));
 const out=await read(variants,{status:'RECORDED'});assert.deepEqual(out.rows.map(r=>r.recordId),['one']);
 assert.equal((await read(variants,{status:'ABSENT'})).result,'no_records');
 const from=await read([row('in',{recordType:'TRANSFER_AMOUNT'})],{domain:'TRANSFERS_FROM_OWNER'});assert.equal(from.rows.length,1);
});
test('name fallback cannot bypass foreign, reversed, duplicate, calendar or capped source guards',async()=>{
 for(const rows of [[row('one',{storeId:'foreign'})],[row('one',{companyId:'foreign'})],[row('one',{reversedAt:now})],[row('same'),row('same')],[row('one',{recordedAt:new Date('2026-09-01T00:00:00Z')})],[row('one',{recordType:'TRANSFER_AMOUNT'})]])await assert.rejects(read(rows),e=>e.status===502);
 const cap=await read(Array.from({length:501},(_,i)=>row(String(i))));assert.equal(cap.result,'source_limited');assert.equal(cap.rows.length,0);assert.equal(cap.totals,null);
});
