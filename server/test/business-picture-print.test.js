import test from 'node:test';
import assert from 'node:assert/strict';
import {businessPicturePrintHtml} from '../../client/src/components/cloud/business-picture-print.js';

const columns=[['salesGross','Πωλήσεις',String],['salesNet','Καθαρά',String],['expenses','Έξοδα',String],['expenseVat','ΦΠΑ εξόδων',String]];
const data={calendarFrom:'2026-09-26',calendarTo:'2026-09-26',totals:{missingCostLines:1,salesLines:2,missingExpenseVatPayments:5,expensePayments:5},calculationNotes:{expenses:'Άγνωστα <script>alert(1)</script>'}};
test('print uses loaded period, escapes report text and keeps unknown amounts unknown',()=>{
 const html=businessPicturePrintHtml({data,storeName:'LAB <img onerror="bad">',columns,rows:[{label:'ΣΥΝΟΛΟ',salesGross:0.5,salesNet:0.44,expenses:null,expenseVat:null}]});
 assert.ok(html.includes('2026-09-26 έως 2026-09-26'));
 assert.ok(html.includes('5 από 5 έξοδα'));
 assert.ok(html.includes('<td>—</td>'));
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 assert.ok(!html.includes('<img'));assert.ok(html.includes('ΣΥΝΟΛΟ'));
 assert.ok(html.includes('size:A4 landscape'));
});
test('print follows visible VAT scope without replacing hidden values with zero',()=>{
 const html=businessPicturePrintHtml({data,storeName:'LAB',columns,rows:[{label:'ΣΥΝΟΛΟ',salesGross:124,salesNet:100,expenses:100,expenseVat:24}],scope:'WITHOUT_VAT'});
 assert.ok(!html.includes('<td>124</td>'));assert.ok(html.includes('<td>100</td>'));assert.ok(html.includes('<td>24</td>'));
});
