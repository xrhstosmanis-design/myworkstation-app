import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePosProposalOptions,createPosProposalSnapshots} from '../src/services/pos-order-proposal.js';
import {buildOrderSuggestions} from '../src/lib/order-suggestions.js';
import {posProposalRows,renderPosOrderProposal} from '../../shared/pos-order-proposal-report.mjs';
const now=new Date('2026-11-25T12:00:00Z'),scope={companyId:'c',storeId:'s',actorId:'op'};
const report={storeId:'s',storeName:'LAB <b>store</b>',generatedAt:now.toISOString(),period:{fromDate:'2026-11-01',toDate:'2026-11-20'},supplier:{id:'sup',name:'Supplier\r\nBcc: not-an-address'},options:{historyDays:20,coverageDays:14,leadDays:2},expectedReceipts:{available:false},rows:[{productId:'p',name:'WATER <script>alert(1)</script>',sku:'SKU1',netQuantity:20,soldQuantity:23,returnedQuantity:3,currentStock:-2,minStock:4,suggestedQuantity:18,unitLabel:'τεμ.',reason:'Κάλυψη',warnings:['Αρνητικό απόθεμα'],confirmedPendingStockQuantity:0},{productId:'p2',name:'Milk',sku:'SKU2',suggestedQuantity:0,warnings:[]}]};
test('Greek date periods include both calendar dates and correctly span DST',()=>{
 const spring=parsePosProposalOptions({fromDate:'2026-03-29',toDate:'2026-03-29',coverageDays:'14',leadDays:'0'},now);
 assert.equal(spring.options.historyDays,1);assert.equal(spring.options.coverageDays,14);assert.equal(spring.options.leadDays,0);assert.equal(spring.salesPeriod.toExclusive-spring.salesPeriod.from,23*3600000);
 const autumn=parsePosProposalOptions({fromDate:'2026-10-25',toDate:'2026-10-25'},now);assert.equal(autumn.salesPeriod.toExclusive-autumn.salesPeriod.from,25*3600000);
 const leap=parsePosProposalOptions({fromDate:'2024-01-01',toDate:'2024-12-31'},now);assert.equal(leap.options.historyDays,366);
 const defaults=parsePosProposalOptions({},now);assert.deepEqual(defaults.options,{historyDays:28,coverageDays:7,leadDays:3});assert.equal(defaults.period.fromDate,'2026-10-29');assert.equal(defaults.period.toDate,'2026-11-25');
});
test('invalid, reversed, incomplete, future, oversized periods and invalid day values reject',()=>{
 for(const query of [{fromDate:'2026-11-01'},{toDate:'2026-11-01'},{fromDate:'2026-02-30',toDate:'2026-03-03'},{fromDate:'2026-11-20',toDate:'2026-11-01'},{fromDate:'2026-11-25',toDate:'2026-11-26'},{fromDate:'2024-01-01',toDate:'2025-01-01'},{coverageDays:'0'},{leadDays:'31'},{historyDays:'6'},{supplierId:['a','b']}])assert.throws(()=>parsePosProposalOptions(query,now));
});
test('explicit calendar periods support 1–366 days without relaxing legacy day bounds',()=>{
 const row={productId:'p',name:'Water',unit:'PIECE',currentStock:2,minStock:0,soldQuantity:9,returnedQuantity:3};
 assert.equal(buildOrderSuggestions([row],{historyDays:1,coverageDays:2,leadDays:0,calendarPeriod:true})[0].suggestedQuantity,10);
 assert.throws(()=>buildOrderSuggestions([row],{historyDays:1}));assert.throws(()=>buildOrderSuggestions([row],{historyDays:367,calendarPeriod:true}));
});
test('one canonical projection drives email/print including filters, quantities and review warnings',()=>{
 const result=renderPosOrderProposal(report,'SKU1');assert.equal(result.rowCount,1);assert.equal(posProposalRows(report,'SKU1')[0].productId,'p');
 for(const value of ['2026-11-01','2026-11-20','14','18','Αρνητικό απόθεμα','αναμενόμενες παραλαβές','εβδομαδιαία αυτόματη']){assert.ok(result.text.includes(value),value);assert.ok(result.html.includes(value),value)}
 assert.ok(result.html.includes('&lt;script&gt;'));assert.ok(!result.html.includes('<script>'));assert.ok(!result.html.includes('<b>store</b>'));assert.ok(!/[\r\n]/.test(result.subject));assert.ok(!result.text.includes('SKU2'));
 assert.equal(renderPosOrderProposal(report,'missing').rowCount,0);
});
test('snapshots bind actor/company/store, freeze the calculated data and expire without background timers',()=>{
 let time=1000;const cache=createPosProposalSnapshots({now:()=>time,ttl:100,maxEntries:2,maxBytes:100000});const input=structuredClone(report),one=cache.create(input,scope);input.rows[0].suggestedQuantity=999;
 assert.equal(cache.get(one.id,scope).report.rows[0].suggestedQuantity,18);
 for(const changed of [{actorId:'other'},{companyId:'other'},{storeId:'other'}])assert.throws(()=>cache.get(one.id,{...scope,...changed}),/έληξε/);
 const two=cache.create(report,scope);cache.create(report,scope);assert.throws(()=>cache.get(one.id,scope));assert.ok(cache.get(two.id,scope));time+=101;assert.throws(()=>cache.get(two.id,scope));
 assert.throws(()=>cache.create({...report,huge:'x'.repeat(2097153)},scope),/μεγάλη/);
});
test('SMTP adapter exposes partial recipient rejection only when requested, preserving legacy return shape',async()=>{
 const nodemailer=(await import('nodemailer')).default,{sendEmail}=await import('../src/services/mail.js');
 const original=nodemailer.createTransport,keys=['SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASSWORD','MAIL_FROM','MAIL_TEST_RECIPIENT'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));let calls=0;
 try{
  Object.assign(process.env,{SMTP_HOST:'fixture.invalid',SMTP_PORT:'587',SMTP_SECURE:'false',SMTP_USER:'fixture@example.invalid',SMTP_PASSWORD:'isolated-fixture',MAIL_FROM:'fixture@example.invalid',MAIL_TEST_RECIPIENT:'unused@example.invalid'});
  nodemailer.createTransport=()=>({sendMail:async()=>{calls++;return {messageId:'<sink@local.invalid>',accepted:['one@example.invalid'],rejected:['two@example.invalid']}}});
  const message={to:['one@example.invalid','two@example.invalid'],subject:'Fixture',text:'No network',companyId:'c',storeId:'s'};
  const detailed=await sendEmail({...message,includeDeliveryResult:true});assert.deepEqual(detailed.accepted,['one@example.invalid']);assert.deepEqual(detailed.rejected,['two@example.invalid']);
  const legacy=await sendEmail(message);assert.deepEqual(Object.keys(legacy).sort(),['messageId','recipients']);assert.equal(calls,2);
 }finally{nodemailer.createTransport=original;for(const k of keys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}
});
