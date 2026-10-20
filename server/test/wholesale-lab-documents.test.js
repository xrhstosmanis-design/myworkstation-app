import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedUnits,formatUnits,validateFrozenSnapshot,createLabDocumentEngine,ensureLabDocumentsSchema} from '../../ops/wholesale-lab/documents.mjs';
import {createLabDocumentPdf} from '../../ops/wholesale-lab/documents-pdf.mjs';
const order=()=>({storeId:'store-a',customerId:'customer-a',netTotal:'10.01',vatTotal:'2.40',grossTotal:'12.41',snapshot:{currency:'EUR',storeId:'store-a',customerId:'customer-a',customerName:'ΕΙΚΟΝΙΚΟΣ ΠΕΛΑΤΗΣ ΔΟΚΙΜΗΣ',items:[{productId:'p-a',name:'Δοκιμαστικό προϊόν',sku:'TEST-A',quantity:'0.1001',unit:'τεμάχιο',vatRate:'24.000',netTotal:'10.01',vatTotal:'2.40',grossTotal:'12.41'}],totals:{net:'10.01',vat:'2.40',gross:'12.41'}}});
test('virtual document quantities/money retain exact arbitrary precision and never accept float/exponent/signed inputs',()=>{
  assert.equal(fixedUnits('9999999999999999.99',2),999999999999999999n);assert.equal(fixedUnits('0.1001',4),1001n);assert.equal(formatUnits(-1001n,4),'-0.1001');assert.equal(formatUnits(1n,2),'0.01');
  for(const value of [1.23,'1e2','-1','+1','01.00','NaN',' 1','1.001',undefined])assert.throws(()=>fixedUnits(value,2));
});
test('frozen accepted order snapshot is authoritative and rejects mismatched scope, repeated items, damaged line/totals and zero quantity',()=>{
  const source=order(),snapshot=validateFrozenSnapshot(source);assert.deepEqual(snapshot,source.snapshot);snapshot.items[0].quantity='99';assert.equal(source.snapshot.items[0].quantity,'0.1001');
  const mutations=[x=>{x.storeId='foreign'},x=>{x.customerId='foreign'},x=>{x.snapshot.currency='USD'},x=>{x.snapshot.items.push({...x.snapshot.items[0]})},x=>{x.snapshot.items[0].grossTotal='12.42'},x=>{x.snapshot.totals.gross='12.42'},x=>{x.grossTotal='12.42'},x=>{x.snapshot.items[0].quantity='0'},x=>{x.snapshot.items=[]}];
  for(const mutate of mutations){const bad=order();mutate(bad);assert.throws(()=>validateFrozenSnapshot(bad))}
});
test('sandbox initialization/engine fail closed before touching an unverified database',async()=>{
  let calls=0;const db={$transaction:async work=>work({$executeRawUnsafe:async()=>{calls++}})};
  assert.throws(()=>createLabDocumentEngine({db}));await assert.rejects(ensureLabDocumentsSchema(db),e=>e.code==='LAB_ISOLATION_REQUIRED');await assert.rejects(ensureLabDocumentsSchema(db,async()=>{throw Error('wrong DB marker')}),/wrong DB marker/);assert.equal(calls,0);
  const engine=createLabDocumentEngine({db,assertIsolated:async()=>{throw Error('wrong DB marker')}});await assert.rejects(engine.seedStock({companyId:'test',storeId:'test',productId:'test',quantity:'1',requestId:'test-initial-a'}),/wrong DB marker/);assert.equal(calls,0);
});
test('virtual PDFs require a TEST document and embed a valid PDF with Greek-capable fonts',async()=>{
  await assert.rejects(createLabDocumentPdf({...order(),type:'INVOICE',testOnly:false}));
  const source=order(),bytes=await createLabDocumentPdf({...source,id:'test-document',number:'TEST-INVOICE-001',type:'INVOICE',testOnly:true,status:'ISSUED',createdAt:'2026-10-19T20:00:00Z',customerName:source.snapshot.customerName,...source.snapshot.totals,netTotal:source.netTotal,vatTotal:source.vatTotal,grossTotal:source.grossTotal});
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.match(bytes.toString('latin1'),/NO FISCAL VALIDITY/);assert.match(bytes.toString('latin1'),/FontDescriptor/);assert.ok(bytes.length>15000);
});
