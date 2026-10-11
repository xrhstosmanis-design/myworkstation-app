import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {auditExpenseReason} from '../../client/src/components/commerce/auditExpenseReason.mjs';

const source=readFileSync(new URL('../../client/src/components/commerce/installOwnerPaymentsSuite.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../client/src/components/commerce/owner-payments-suite.css',import.meta.url),'utf8');
const helpers=source.split('\n').filter(s=>/^const (money|number|esc|pct)=/.test(s)).join('\n');
const renderSource=source.slice(source.indexOf('function categoriesHtml('),source.indexOf('function suppliersHtml('));
const render=new Function('auditExpenseReason',`${helpers}\n${renderSource}\nreturn categoriesHtml;`)(auditExpenseReason);
const declaration='ΧΩΡΙΣ ΠΑΡΑΣΤΑΤΙΚΟ — Δηλώνω υπεύθυνα ότι ανοίγω το συρτάρι, καταβάλλω το ποσό από τα μετρητά της βάρδιας και αναλαμβάνω την ευθύνη της καταχώρισης.';

test('actual owner category renderer separates saved reasons without changing grouped amounts or descriptions',()=>{
  const report={summary:{totalExpenses:450},categories:[
    {name:`${declaration} τονια τιμολογια`,type:'OTHER_EXPENSE',count:1,amount:300},
    {name:`${declaration} αντρεας 8 ωρες δευτρα και 8 ωρες νυχτα τριτη`,type:'OTHER_EXPENSE',count:1,amount:100},
    {name:`${declaration} καμερα`,type:'OTHER_EXPENSE',count:1,amount:50},
  ]};
  const before=structuredClone(report);
  const dom=new JSDOM(`<style>${css}</style>${render(report)}`);
  const rows=[...dom.window.document.querySelectorAll('.row')];
  assert.deepEqual([...rows[0].children].map(e=>e.textContent),['Αιτιολογία','Κατηγορία / περιγραφή','Τύπος','Κινήσεις','Ποσό','% συνόλου']);
  for(const [i,note] of ['τονια τιμολογια','αντρεας 8 ωρες δευτρα και 8 ωρες νυχτα τριτη','καμερα'].entries()){
    const cells=rows[i+1].children;
    assert.equal(cells.length,6);assert.equal(cells[0].textContent,note);
    assert.equal(cells[1].textContent,report.categories[i].name);
    assert.equal(cells[2].textContent,'Λοιπά έξοδα');assert.equal(cells[3].textContent,'1');
    assert.equal(cells[4].textContent,report.categories[i].amount.toLocaleString('el-GR',{style:'currency',currency:'EUR'}));
    assert.equal(cells[5].textContent,(report.categories[i].amount/450*100).toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
    assert.equal(dom.window.getComputedStyle(cells[0]).fontSize,'16px');
    assert.equal(dom.window.getComputedStyle(cells[4]).fontSize,'18px');
  }
  assert.deepEqual(report,before);
});

test('actual category renderer escapes notes and preserves missing, unknown and supplier descriptions',()=>{
  const notes=[`${declaration} <img src=x onerror=alert(1)>\nδεύτερη γραμμή`,declaration,'ΧΩΡΙΣ ΠΑΡΑΣΤΑΤΙΚΟ — άγνωστη δήλωση','Πληρωμές προμηθευτών','Χαρτικά'];
  const dom=new JSDOM(render({categories:notes.map((name,i)=>({name,type:i===3?'SUPPLIER_PAYMENT':'OTHER_EXPENSE',count:2,amount:10})),summary:{totalExpenses:50}}));
  assert.deepEqual([...dom.window.document.querySelectorAll('.owner-expense-reason')].map(e=>e.textContent),['<img src=x onerror=alert(1)>\nδεύτερη γραμμή','—','—','—','Χαρτικά']);
  assert.equal(dom.window.document.querySelectorAll('img').length,0);
  assert.deepEqual([...dom.window.document.querySelectorAll('.row:not(.head)>span:nth-child(2)')].map(e=>e.textContent),notes);
  assert.match(render({categories:[]}),/Δεν υπάρχουν κατηγορίες εξόδων/);
});
