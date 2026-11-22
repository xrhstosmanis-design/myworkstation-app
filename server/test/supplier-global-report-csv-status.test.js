import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../../client/src/components/commerce/installSupplierGlobalReports.js',import.meta.url),'utf8');
// Exercise the production projection without installing its document observers.
const csvFunction=source.slice(source.indexOf('function csvRows()'),source.indexOf('\nfunction exportCsv()'));
const state={tab:'invoices',data:{items:[]}};
const fmt=value=>`date:${value}`;
const csvRows=new Function('state','fmt',`${csvFunction};return csvRows;`)(state,fmt);

test('invoice CSV appends visible status and preserves every original row and amount column',()=>{
  state.tab='invoices';
  const statuses=['APPROVED','DRAFT','CANCELLED','REOPENED','LEGACY_STATUS',null];
  state.data={items:statuses.map((status,index)=>({documentDate:`2026-11-${index+1}`,documentNumber:`DOC-${index}`,supplierName:'Supplier',storeName:'LAB',totalNet:index+.125,totalVat:index+.25,totalGross:index+.375,status}))};
  const [header,...rows]=csvRows();
  assert.deepEqual(header,['Ημερομηνία','Παραστατικό','Επωνυμία','Κατάστημα','Χωρίς ΦΠΑ','ΦΠΑ','Σύνολο','Κατάσταση']);
  assert.equal(rows.length,statuses.length);
  rows.forEach((row,index)=>{
    const item=state.data.items[index];
    assert.deepEqual(row.slice(0,7),[fmt(item.documentDate),item.documentNumber,item.supplierName,item.storeName,item.totalNet,item.totalVat,item.totalGross]);
    assert.equal(row[7],item.status||'—');
  });
});

test('payment CSV appends the same active or reversed status as the visible report',()=>{
  state.tab='payments';
  state.data={items:[null,'2026-11-18T18:00:00Z'].map((reversedAt,index)=>({occurredAt:'2026-11-18',supplierName:'Supplier',storeName:'LAB',amount:index+1.125,description:'Payment',actorName:'Owner',reversedAt}))};
  const [header,...rows]=csvRows();
  assert.deepEqual(header,['Ημερομηνία','Επωνυμία','Κατάστημα','Ποσό','Παρατηρήσεις','Χειριστής','Κατάσταση']);
  rows.forEach((row,index)=>{
    const item=state.data.items[index];
    assert.deepEqual(row.slice(0,6),[fmt(item.occurredAt),item.supplierName,item.storeName,item.amount,item.description,item.actorName]);
    assert.equal(row[6],item.reversedAt?'ΑΝΤΙΛΟΓΙΣΜΟΣ':'ΕΝΕΡΓΗ');
  });
});
