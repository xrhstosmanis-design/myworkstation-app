import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInventorySourceEvidence} from '../src/services/inventory-reconciliation-evidence.js';
import {reconcileInventory} from '../src/services/inventory-reconciliation.js';
const t=h=>`2026-10-01T${String(h).padStart(2,'0')}:00:00Z`;
const fixture=()=>({previous:{id:'old',companyId:'c',storeId:'s',status:'FINALIZED',startedAt:t(1),finalizedAt:t(4)},current:{id:'new',companyId:'c',storeId:'s',status:'FINALIZED',startedAt:t(8),finalizedAt:t(12)},previousLines:[{id:'a',productId:'p',countedAt:t(2),countedQuantity:100}],currentLines:[{id:'b',productId:'p',countedAt:t(10),countedQuantity:70,unitCost:2}],events:[{id:'e1',stocktakeId:'old',lineId:'a',eventType:'COUNT',countedQuantity:100,createdAt:t(2)},{id:'e2',stocktakeId:'new',lineId:'b',eventType:'COUNT',countedQuantity:70,createdAt:t(10)}],movements:[{id:'sale',productId:'p',quantity:-20,movementType:'SALE',sourceId:'sale1',createdAt:t(6)}]});
const window={productId:'p',from:t(2),to:t(10)};
const sale={saleId:'self',lineId:'line',productId:'p',quantity:'1',source:'SELF_CONSUMPTION',status:'COMPLETED',occurredAt:t(7),createdAt:t(7),actorName:'Ελεγκτής'};
test('accepted consumption without StockMovement is derived once, without changing any source',()=>{
  const input={movements:[],sales:[sale],windows:[window]},copy=structuredClone(input);
  const r=buildInventorySourceEvidence(input);assert.deepEqual(input,copy);assert.equal(r.movements.length,1);assert.equal(r.movements[0].quantity,-1);assert.equal(r.movements[0].sourceId,'self');assert.equal(r.evidence.transactions[0].disposition,'DERIVED_IMMUTABLE_TRANSACTION');
  const f=fixture();f.previousLines[0].countedQuantity=10;f.currentLines[0].countedQuantity=4;f.events[0].countedQuantity=10;f.events[1].countedQuantity=4;f.events[1].expectedQuantity=5;
  f.movements=[{id:'waste',productId:'p',movementType:'WASTE',quantity:-4,sourceId:'waste',createdAt:t(6)},...r.movements];
  const row=reconcileInventory(f).rows[0];assert.equal(row.expectedQuantity,5);assert.equal(row.difference,-1);assert.equal(row.findings.includes('LEDGER_COUNT_EXPECTED_MISMATCH'),false);
});
test('matching direct postings and repeated audit records never synthesize another sale or return',()=>{
  const r=buildInventorySourceEvidence({movements:[{id:'posting',sourceId:'self',sourceType:'POS_SALE',productId:'p',quantity:-1}],sales:[sale],windows:[window],actions:[{id:'a',saleId:'self',actionType:'SELF_CONSUMPTION'},{id:'b',saleId:'self',actionType:'SELF_CONSUMPTION'}]});
  assert.equal(r.movements.length,1);assert.equal(r.evidence.transactions[0].postingIds[0],'posting');assert.deepEqual(r.sourceFindings,{});
});
test('only audited restored products generate return quantities, original and reversal remain separate',()=>{
  const reverse={...sale,saleId:'reverse',source:'POS_REVERSAL',originalSaleId:'original',reversalKind:'RETURN',quantity:'-2'};
  const action={id:'audit',saleId:'reverse',actionType:'RETURN',details:{stockRestoredProductIds:['p']}};
  const r=buildInventorySourceEvidence({movements:[],sales:[reverse],windows:[window],actions:[action]});assert.equal(r.movements[0].quantity,2);assert.equal(r.evidence.transactions[0].originalSaleId,'original');
  action.details.stockRestoredProductIds=[];const excluded=buildInventorySourceEvidence({movements:[],sales:[reverse],windows:[window],actions:[action]});assert.equal(excluded.movements.length,0);assert.equal(excluded.evidence.transactions[0].disposition,'EXPLICIT_NON_STOCK_LINE');
  const unknown=buildInventorySourceEvidence({movements:[],sales:[reverse],windows:[window]});assert.equal(unknown.movements.length,0);assert.ok(unknown.sourceFindings.p.includes('TRANSACTION_WITHOUT_VERIFIED_STOCK_EFFECT'));
});
test('a backdated transaction crossing a count boundary is uncertain, not an invented shortage',()=>{
  const r=buildInventorySourceEvidence({movements:[],sales:[{...sale,occurredAt:t(1)}],windows:[window]});assert.ok(r.sourceFindings.p.includes('TRANSACTION_CROSSES_COUNT_TIME'));
  const f=fixture();const report=reconcileInventory({...f,movements:[...f.movements,...r.movements],sourceFindings:r.sourceFindings});assert.equal(report.rows[0].difference,null);assert.equal(report.summary.shortageValue,null);assert.equal(report.rows[0].recordedExpectedQuantity,79);
});
test('boxes, gifts, value credits and same-identity duplicate invoices are evidence, never synthetic receipts',()=>{
  const line={documentId:'invoice',lineId:'line',productId:'p',quantity:'2',unit:'PACKAGE',unitsPerPackage:'12',unitCost:'0',netAmount:'0',supplierId:'supplier',documentNumber:'N1',documentType:'INVOICE',documentDate:t(6),createdAt:t(7),status:'APPROVED'};
  const inputs={movements:[{id:'posting',sourceId:'invoice',sourceType:'PURCHASE_DOCUMENT',productId:'p',quantity:24,createdAt:t(7)}],invoiceLines:[line,{...line,documentId:'duplicate',lineId:'line2'},{...line,documentId:'credit',lineId:'line3',documentNumber:'C1',documentType:'CREDIT_NOTE',quantity:'0',unit:'PIECE',netAmount:'-20'}],windows:[window]};
  const r=buildInventorySourceEvidence(inputs);assert.equal(r.movements.length,1);const invoice=r.evidence.invoices.find(x=>x.id==='invoice');assert.equal(invoice.lines[0].baseQuantity,24);assert.ok(invoice.lines[0].findings.includes('GIFT_OR_FREE_LINE'));assert.ok(invoice.findings.includes('POSSIBLE_DUPLICATE_INVOICE_IDENTITY'));assert.ok(r.evidence.invoices.find(x=>x.id==='credit').findings.includes('VALUE_CREDIT_NO_MERCHANDISE_QUANTITY'));
  inputs.invoiceLines=[{...line,unitsPerPackage:'0'}];assert.ok(buildInventorySourceEvidence(inputs).sourceFindings.p.includes('INVOICE_QUANTITY_CHECK_UNRESOLVED'));
});
test('cart removal, price and barcode audit never add physical quantities or expose arbitrary details',()=>{
  const r=buildInventorySourceEvidence({movements:[],windows:[window],operatorEvents:[{id:'cart',eventType:'CART_ITEM_REMOVE',createdAt:t(7),details:{productId:'p',quantity:244,customerSecret:'do not export'}},{id:'price',eventType:'PRICE_CHANGE',details:{productId:'p',oldPrice:2,newPrice:3}},{id:'barcode',eventType:'BARCODE_CHANGE',details:{productId:'p',oldBarcode:'001',newBarcode:'002'}}]});
  assert.equal(r.movements.length,0);assert.equal(r.evidence.systemEvents.length,3);assert.ok(r.evidence.systemEvents.every(x=>x.stockImpact==='NONE'));assert.equal(JSON.stringify(r).includes('customerSecret'),false);assert.equal(r.evidence.systemEvents.find(x=>x.id==='barcode').changes.newBarcode,'002');
});
test('an unfinished transaction with an empty quantity remains context and cannot invalidate physical inventory',()=>{
  const r=buildInventorySourceEvidence({movements:[],windows:[window],sales:[{...sale,status:'DRAFT',quantity:null}]});assert.equal(r.movements.length,0);assert.deepEqual(r.sourceFindings,{});assert.equal(r.evidence.transactions[0].disposition,'CONTEXT_ONLY');
  const inconsistent=buildInventorySourceEvidence({movements:[{id:'invalid-posting',productId:'p',sourceId:'self',sourceType:'POS_SALE',quantity:-1,createdAt:t(7)}],windows:[window],sales:[{...sale,status:'DRAFT'}]});assert.ok(inconsistent.sourceFindings.p.includes('STOCK_POSTING_FOR_INCOMPLETE_TRANSACTION'));assert.equal(reconcileInventory({...fixture(),movements:inconsistent.movements,sourceFindings:inconsistent.sourceFindings}).rows[0].difference,null);
});
