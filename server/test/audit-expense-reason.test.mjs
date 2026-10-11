import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {auditExpenseReason} from '../../client/src/components/commerce/auditExpenseReason.mjs';

const declaration = 'Δηλώνω υπεύθυνα ότι ανοίγω το συρτάρι, καταβάλλω το ποσό από τα μετρητά της βάρδιας και αναλαμβάνω την ευθύνη της καταχώρισης.';
const expense = note => ({eventType:'OTHER_EXPENSE',description:`ΧΩΡΙΣ ΠΑΡΑΣΤΑΤΙΚΟ — ${declaration} ${note}`});

test('existing expense notes are separate from each exact current responsibility declaration', () => {
  assert.equal(auditExpenseReason(expense('τονια τιμολογια')), 'τονια τιμολογια');
  assert.equal(auditExpenseReason(expense('καμερα')), 'καμερα');
  const paymentSource = readFileSync(new URL('../../client/src/components/store/StorePosPaymentsModal.jsx', import.meta.url),'utf8');
  for (const text of [declaration,
    'Δηλώνω υπεύθυνα ότι παρέλαβα το ποσό σε μετρητά και το κατέθεσα στο συρτάρι της ενεργής βάρδιας.',
    'Δηλώνω υπεύθυνα ότι πραγματοποιώ την εξωτερική πληρωμή και αναλαμβάνω την ευθύνη της καταχώρισης.']) {
    assert.ok(paymentSource.includes(text));
    assert.equal(auditExpenseReason({eventType:'OTHER_EXPENSE',description:`ΧΩΡΙΣ ΠΑΡΑΣΤΑΤΙΚΟ — ${text} αιτιολογία\nδεύτερη γραμμή`}), 'αιτιολογία\nδεύτερη γραμμή');
  }
});

test('missing, unknown and unrelated declarations never invent expense reasons', () => {
  for (const item of [null,{}, {...expense('note'),eventType:'SUPPLIER_PAYMENT'},expense(''),
    {eventType:'OTHER_EXPENSE'}, {eventType:'OTHER_EXPENSE',description:'ΧΩΡΙΣ ΠΑΡΑΣΤΑΤΙΚΟ — άγνωστη δήλωση'},
    {eventType:'OTHER_EXPENSE',description:`ΧΩΡΙΣ ΠΑΡΑΣΤΑΤΙΚΟ — ${declaration}not-a-boundary`}])
    assert.equal(auditExpenseReason(item),'');
  assert.equal(auditExpenseReason({eventType:'OTHER_EXPENSE',description:'τονια τιμολογια'}),'τονια τιμολογια');
  assert.equal(auditExpenseReason(expense(`σημείωση: ${declaration}`)),`σημείωση: ${declaration}`);
});

test('actual Audit renderer has distinct reason, preserves original description and escapes notes', () => {
  const source=readFileSync(new URL('../../client/src/components/commerce/installKioskReportsAuditV2.js',import.meta.url),'utf8');
  const escLine=source.split('\n').find(line=>line.startsWith('const esc='));
  const esc=new Function(`${escLine};return esc`)();
  const renderer=source.split('\n').find(line=>line.startsWith('function auditRows('));
  const head=c=>`<div class="kr-head">${c.map(x=>`<span>${x}</span>`).join('')}</div>`;
  const row=c=>`<div class="kr-row">${c.map(x=>`<span>${x}</span>`).join('')}</div>`;
  const auditRows=new Function('head','row','fmt','esc','eventLabel','auditAmount','financialText','money','paymentLabel','auditExpenseReason',`${renderer};return auditRows`)(head,row,x=>x,esc,()=> 'Λοιπά έξοδα',r=>r.amount,()=> 'unchanged financials',n=>`${n} €`,()=> 'Μετρητά βάρδιας',auditExpenseReason);
  const note='τονια τιμολογια <img src=x onerror=alert(1)>';
  const original={...expense(note),id:'existing300',amount:300,sourceType:'StoreTransaction',storeName:'own-store'};
  const before=structuredClone(original);
  const dom=new JSDOM(auditRows([original],true));
  const headers=[...dom.window.document.querySelectorAll('.kr-head>span')].map(e=>e.textContent);
  assert.equal(headers[3],'Αιτιολογία'); assert.equal(headers[4],'Περιγραφή / Τιμολόγιο');
  const cells=dom.window.document.querySelectorAll('.kr-row>span');
  assert.equal(cells.length,headers.length);assert.equal(cells[3].textContent,note);
  assert.equal(cells[4].textContent,original.description);assert.equal(cells[6].textContent,'300 €');
  assert.equal(cells[11].textContent,'own-store');assert.ok(cells[12].querySelector('button'));
  assert.equal(dom.window.document.querySelectorAll('img').length,0);assert.deepEqual(original,before);
});
