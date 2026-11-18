import test from 'node:test';
import assert from 'node:assert/strict';
import {observeInvoicePayments} from '../src/lib/invoice-payment-observation.js';

const mime='application/vnd.myworkstation.purchase-document';
const document=(patch={})=>({id:'d',companyId:'c',storeId:'s',supplierId:'supplier',documentType:'INVOICE',documentNumber:'015 19687',issueDay:'2026-11-18',totalGross:'60.48',status:'DRAFT',paymentTransactionId:'p',...patch});
const invoice=(patch={})=>({id:'doc:d',documentType:'INVOICE',totalCents:6048,status:'UNPOSTED',categories:['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW'],reasons:[],sources:[{kind:'DOCUMENT',id:'d',status:'DRAFT'}],...patch});
const transaction=(patch={})=>({id:'p',companyId:'c',storeId:'s',supplierId:'supplier',type:'SUPPLIER_PAYMENT',invoiceDocumentNumber:'015-19687',amount:'60.4800',reversedAt:null,settlementConfirmed:true,attachmentMimeType:'application/pdf',attachmentFilename:'source.pdf',...patch});
const run=(documents=[document()],transactions=[transaction()],items=[invoice()],options={available:true})=>observeInvoicePayments(items,{documents},transactions,options);

test('paid draft keeps independent unposted workflow and input unchanged',()=>{
 const docs=[document()],payments=[transaction()],items=[invoice()];const before=JSON.stringify({docs,payments,items});
 const actual=run(docs,payments,items);
 assert.equal(actual.items[0].payment.status,'PAID');assert.equal(actual.items[0].payment.paidCents,6048);assert.equal(actual.items[0].payment.remainingCents,0);
 assert.equal(actual.items[0].status,'UNPOSTED');assert.deepEqual(actual.items[0].categories,items[0].categories);
 assert.deepEqual(actual.summary,{paid:1,financialPending:0,reviewRequired:0,notLinked:0,notApplicable:0});
 assert.equal(JSON.stringify({docs,payments,items}),before);
});

test('same transaction referenced by two sources in one logical invoice counts once',()=>{
 const docs=[document(),document({id:'d2'})],row=invoice({sources:[{kind:'DOCUMENT',id:'d',status:'DRAFT'},{kind:'DOCUMENT',id:'d2',status:'DRAFT'}]});
 const actual=run(docs,[transaction()],[row]);assert.equal(actual.items[0].payment.status,'PAID');assert.equal(actual.items[0].payment.paymentCount,1);assert.deepEqual(actual.items[0].payment.transactionIds,['p']);
});

test('distinct installment identities retain equal payment amounts and exact document attachment links',()=>{
 const docs=[document({paymentTransactionId:null})];
 const payments=['p1','p2'].map(id=>transaction({id,amount:'30.24',attachmentMimeType:mime,attachmentFilename:'d'}));
 const result=run(docs,payments).items[0].payment;assert.equal(result.status,'PAID');assert.equal(result.paymentCount,2);assert.equal(result.paidCents,6048);
});

test('known partial payment remains an actual financial pending with exact remainder',()=>{
 const result=run(undefined,[transaction({amount:'20.00'})]);assert.equal(result.items[0].payment.status,'PARTIALLY_PAID');assert.equal(result.items[0].payment.remainingCents,4048);assert.equal(result.summary.financialPending,1);
});

test('overpayment is distinct and never treated as paid or a negative payable',()=>{
 const result=run(undefined,[transaction({amount:'61.00'})]);assert.equal(result.items[0].payment.status,'OVERPAID');assert.equal(result.items[0].payment.remainingCents,0);assert.equal(result.items[0].payment.overpaymentCents,52);assert.equal(result.summary.paid,0);
});

test('reversed only payment leaves full amount pending, with independent reversal state',()=>{
 const result=run(undefined,[transaction({reversedAt:'2026-11-18T14:00:00Z'})]).items[0].payment;assert.equal(result.status,'REVERSED');assert.equal(result.paidCents,0);assert.equal(result.remainingCents,6048);
});

test('reversed earlier payment does not reduce valid replacement payment',()=>{
 const payments=[transaction({reversedAt:'2026-11-18T14:00:00Z'}),transaction({id:'p2',attachmentMimeType:mime,attachmentFilename:'d'})];
 const result=run(undefined,payments).items[0].payment;assert.equal(result.status,'PAID');assert.equal(result.paymentCount,1);assert.equal(result.paidCents,6048);
});

test('unconfirmed or unknown settlement blocks paid conclusion',()=>{
 for(const settlementConfirmed of [false,null,undefined]){
  const result=run(undefined,[transaction({settlementConfirmed})]).items[0].payment;assert.equal(result.status,'UNCONFIRMED');assert.equal(result.paidCents,null);assert.equal(result.remainingCents,null);
 }
});

test('missing source capability is unknown rather than zero pending',()=>{
 const result=run(undefined,undefined,undefined,{available:false});assert.equal(result.items[0].payment.status,'UNAVAILABLE');assert.equal(result.items[0].payment.remainingCents,null);assert.equal(result.summary.reviewRequired,1);
});

test('no explicit linkage cannot be inferred from equal amount, supplier and number',()=>{
 const result=run([document({paymentTransactionId:null})]);assert.equal(result.items[0].payment.status,'NOT_LINKED');assert.equal(result.items[0].payment.paidCents,null);assert.equal(result.summary.notLinked,1);
});

test('dangling direct reference remains review, never asserted unpaid',()=>{
 const result=run(undefined,[]).items[0].payment;assert.equal(result.status,'REVIEW_REQUIRED');assert.equal(result.remainingCents,null);
});

test('same transaction claimed by two logical invoices is ambiguous for both',()=>{
 const docs=[document(),document({id:'other'})],items=[invoice(),invoice({id:'doc:other',sources:[{kind:'DOCUMENT',id:'other',status:'DRAFT'}]})];
 const result=run(docs,[transaction()],items);assert.deepEqual(result.items.map(row=>row.payment.status),['REVIEW_REQUIRED','REVIEW_REQUIRED']);assert.equal(result.summary.reviewRequired,2);
});

test('conflicting supplier, scope, number, transaction type and attachment reference fail closed',()=>{
 for(const patch of [{supplierId:'foreign'},{companyId:'foreign'},{storeId:'foreign'},{invoiceDocumentNumber:'016 19687'},{type:'OTHER_EXPENSE'},{attachmentMimeType:mime,attachmentFilename:'other-document'}]){
  const result=run(undefined,[transaction(patch)]).items[0].payment;assert.equal(result.status,'REVIEW_REQUIRED',JSON.stringify(patch));assert.equal(result.paidCents,null);
 }
});

test('invalid cents and unsafe amounts do not produce a financial observation',()=>{
 for(const amount of ['60.481','NaN','Infinity','-60.48','','9007199254740992.00',60.48]){
  assert.equal(run(undefined,[transaction({amount})]).items[0].payment.status,'REVIEW_REQUIRED',String(amount));
 }
 assert.equal(run([document({totalGross:'60.481'})]).items[0].payment.status,'REVIEW_REQUIRED');
});

test('zero-value, credit-note, duplicate source and unresolved identity cases stay separate',()=>{
 assert.equal(run([document({totalGross:'0'})]).items[0].payment.status,'REVIEW_REQUIRED');
 assert.equal(run(undefined,undefined,[invoice({documentType:'CREDIT_NOTE'})]).items[0].payment.status,'NOT_APPLICABLE');
 assert.equal(run([document(),document()]).items[0].payment.status,'REVIEW_REQUIRED');
 assert.equal(run(undefined,[transaction(),transaction()]).items[0].payment.status,'REVIEW_REQUIRED');
 assert.equal(run(undefined,undefined,[invoice({categories:['IDENTITY_OR_LINK_REVIEW']})]).items[0].payment.status,'REVIEW_REQUIRED');
});

test('merged inactive source cannot create a new candidate or revive cancelled draft',()=>{
 const merged=invoice({sources:[{kind:'DOCUMENT',id:'d',status:'MERGED'}]});assert.equal(run(undefined,undefined,[merged]).items[0].payment.status,'NOT_LINKED');
 assert.equal(run([document({status:'CANCELLED'})]).items[0].payment.status,'NOT_LINKED');
});

test('settled invoice and independent genuine partial control remain distinct in totals',()=>{
 const docs=[document(),document({id:'d2',documentNumber:'015 19688',paymentTransactionId:'p2'})];
 const items=[invoice(),invoice({id:'doc:d2',sources:[{kind:'DOCUMENT',id:'d2',status:'DRAFT'}]})];
 const payments=[transaction(),transaction({id:'p2',invoiceDocumentNumber:'015 19688',amount:'10.00'})];
 const result=run(docs,payments,items);assert.deepEqual(result.items.map(item=>item.payment.status),['PAID','PARTIALLY_PAID']);
 assert.deepEqual(result.summary,{paid:1,financialPending:1,reviewRequired:0,notLinked:0,notApplicable:0});assert.equal(result.items[1].payment.remainingCents,5048);
});

test('one thousand independent invoices retain all direct and attachment payment identities with bounded source visits',()=>{
 const size=1000,docs=[],items=[],payments=[];let attachmentReads=0;
 for(let index=0;index<size;index++){
  const id='d'+index,paymentId='p'+index,number='A '+(index+1),byAttachment=index%2===0;
  docs.push(document({id,documentNumber:number,paymentTransactionId:byAttachment?null:paymentId}));
  items.push(invoice({id:'doc:'+id,sources:[{kind:'DOCUMENT',id,status:'DRAFT'}]}));
  const row=transaction({id:paymentId,invoiceDocumentNumber:number,attachmentMimeType:byAttachment?mime:'application/pdf'});
  Object.defineProperty(row,'attachmentFilename',{get(){attachmentReads++;return byAttachment?id:'source.pdf'},enumerable:true});
  payments.push(row);
 }
 const observed=run(docs,payments,items);assert.equal(observed.items.length,size);assert.equal(observed.summary.paid,size);
 assert.equal(observed.summary.reviewRequired,0);assert.equal(observed.summary.financialPending,0);
 for(let index=0;index<size;index++){
  assert.deepEqual(observed.items[index].payment.transactionIds,['p'+index]);assert.equal(observed.items[index].payment.paidCents,6048);
 }
 // Deterministic source-visit budget catches a quadratic candidate scan,
 // without depending on CPU speed or a flaky wall-clock threshold.
 assert.ok(attachmentReads<size*8,'source references must be visited linearly');
});

test('unknown document type remains review and cannot imply zero financial uncertainty',()=>{
 for(const documentType of [null,undefined,'UNKNOWN','RECEIPT']){
  const observed=run(undefined,undefined,[invoice({documentType})]);
  assert.equal(observed.items[0].payment.status,'REVIEW_REQUIRED');assert.equal(observed.items[0].payment.paidCents,null);
  assert.equal(observed.summary.reviewRequired,1);assert.equal(observed.summary.notApplicable,0);assert.equal(observed.summary.paid,0);
 }
});

test('payment claimed by active invoice outside selected month is ambiguous',()=>{
 const docs=[document(),document({id:'prior',documentNumber:'015 19000',issueDay:'2026-10-18'})];
 const observed=run(docs,[transaction()],[invoice()]);
 assert.equal(observed.items[0].payment.status,'REVIEW_REQUIRED');assert.equal(observed.items[0].payment.paidCents,null);
 assert.equal(observed.summary.paid,0);assert.equal(observed.summary.reviewRequired,1);
});

test('outside-month inactive merged alias does not invalidate unique active invoice payment',()=>{
 const docs=[document(),document({id:'prior-alias',status:'MERGED',issueDay:'2026-10-18'})];
 const observed=run(docs,[transaction()],[invoice()]);assert.equal(observed.items[0].payment.status,'PAID');assert.equal(observed.summary.paid,1);
});

test('attachment-bound payment with another active direct claimant outside month is ambiguous',()=>{
 const docs=[document({paymentTransactionId:null}),document({id:'prior',documentNumber:'015 19000',issueDay:'2026-10-18'})];
 const observed=run(docs,[transaction({attachmentMimeType:mime,attachmentFilename:'d'})],[invoice()]);
 assert.equal(observed.items[0].payment.status,'REVIEW_REQUIRED');assert.equal(observed.items[0].payment.remainingCents,null);
});

test('malformed or foreign settlement metadata cannot certify payment',()=>{
 for(const patch of [{settlementScopeValid:false},{settlementScopeValid:null},{settlementCount:2},{settlementCount:-1},{settlementCount:'1'}]){
  assert.equal(run(undefined,[transaction(patch)]).items[0].payment.status,'REVIEW_REQUIRED');
 }
 assert.equal(run(undefined,[transaction({settlementScopeValid:true,settlementCount:1})]).items[0].payment.status,'PAID');
});

const allocation=(documentId,amount,patch={})=>({id:'a-'+documentId,transactionId:'p',documentId,amount,companyId:'c',storeId:'s',supplierId:'supplier',allocationCompanyId:'c',settlementStatus:'CONFIRMED',...patch});
const splitFixture=()=>({
 documents:[document({id:'d40',documentNumber:'A 40',totalGross:'40.00'}),document({id:'d60',documentNumber:'A 60',totalGross:'60.00'})],
 items:[invoice({id:'doc:d40',totalCents:4000,sources:[{kind:'DOCUMENT',id:'d40',status:'DRAFT'}]}),invoice({id:'doc:d60',totalCents:6000,sources:[{kind:'DOCUMENT',id:'d60',status:'DRAFT'}]})],
 transactions:[transaction({amount:'100.00',invoiceDocumentNumber:'Πολλά παραστατικά',hasSettlement:true,settlementScopeValid:true,settlementCount:1})],
 allocations:[allocation('d40','40.00'),allocation('d60','60.00')]
});
const allocatedRun=(f,options={available:true,allocationsAvailable:true})=>observeInvoicePayments(f.items,{documents:f.documents,paymentAllocations:f.allocations},f.transactions,options);

const postingOnlyReason='Η καταχώριση αγοράς δεν διαθέτει επιβεβαιωμένο εγκεκριμένο παραστατικό και σύνδεση αποθήκης.';
const postingReview=(patch={})=>invoice({categories:['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW','IDENTITY_OR_LINK_REVIEW'],reasons:[postingOnlyReason],...patch});

test('sole stock-posting warning retains workflow while independently bound payment is observed',()=>{
 for(const [amount,status,remaining,extra]of [['60.48','PAID',0,0],['20.00','PARTIALLY_PAID',4048,0],['61.00','OVERPAID',0,52]]){
  const items=[postingReview()],before=JSON.stringify(items),actual=run(undefined,[transaction({amount})],items);
  assert.equal(actual.items[0].payment.status,status);assert.equal(actual.items[0].payment.remainingCents,remaining);assert.equal(actual.items[0].payment.overpaymentCents,extra);
  assert.deepEqual({...actual.items[0],payment:undefined},{...items[0],payment:undefined});assert.equal(JSON.stringify(items),before);
 }
});

test('identity review with missing, malformed, unknown or mixed reasons remains blocked',()=>{
 for(const reasons of [undefined,null,[],postingOnlyReason,{},[null],['Unknown identity conflict'],[postingOnlyReason,'Supplier identity conflict'],[postingOnlyReason,postingOnlyReason]]){
  const actual=run(undefined,undefined,[postingReview({reasons})]);
  assert.equal(actual.items[0].payment.status,'REVIEW_REQUIRED',JSON.stringify(reasons));assert.equal(actual.items[0].payment.paidCents,null);assert.equal(actual.summary.reviewRequired,1);
 }
});

test('stock-posting warning exemption retains all payment proof boundaries',()=>{
 for(const patch of [{supplierId:'foreign'},{storeId:'foreign'},{invoiceDocumentNumber:'016 19687'},{amount:'60.481'},{settlementScopeValid:false}]){
  assert.equal(run(undefined,[transaction(patch)],[postingReview()]).items[0].payment.status,'REVIEW_REQUIRED',JSON.stringify(patch));
 }
 assert.equal(run(undefined,[transaction({settlementConfirmed:false})],[postingReview()]).items[0].payment.status,'UNCONFIRMED');
 assert.equal(run(undefined,[transaction({reversedAt:'2026-11-18T14:00:00Z'})],[postingReview()]).items[0].payment.status,'REVERSED');
 assert.equal(run(undefined,[],[postingReview()]).items[0].payment.status,'REVIEW_REQUIRED');
});

test('stock-posting warning does not duplicate split allocations or hide an invalid other target',()=>{
 const f=splitFixture();f.items=f.items.map(item=>({...item,categories:['IDENTITY_OR_LINK_REVIEW'],reasons:[postingOnlyReason]}));
 const before=JSON.stringify(f),actual=allocatedRun(f);
 assert.deepEqual(actual.items.map(item=>item.payment.status),['PAID','PAID']);assert.deepEqual(actual.items.map(item=>item.payment.paidCents),[4000,6000]);assert.equal(JSON.stringify(f),before);
 f.allocations[1].supplierId='foreign';assert.ok(allocatedRun(f).items.every(item=>item.payment.status==='REVIEW_REQUIRED'));
});

test('one explicitly allocated payment splits into two paid invoices without whole-transaction duplication',()=>{
 const f=splitFixture(),before=JSON.stringify(f),observed=allocatedRun(f);
 assert.deepEqual(observed.items.map(item=>item.payment.status),['PAID','PAID']);assert.deepEqual(observed.items.map(item=>item.payment.paidCents),[4000,6000]);
 assert.deepEqual(observed.items.map(item=>item.payment.paymentCount),[1,1]);assert.equal(observed.summary.paid,2);assert.equal(JSON.stringify(f),before);
});

test('partial allocation reports only allocated portion and exact invoice remainder',()=>{
 const f=splitFixture();f.allocations[1].amount='35.00';const observed=allocatedRun(f);
 assert.equal(observed.items[0].payment.status,'PAID');assert.equal(observed.items[1].payment.status,'PARTIALLY_PAID');
 assert.equal(observed.items[1].payment.paidCents,3500);assert.equal(observed.items[1].payment.remainingCents,2500);
});

test('direct pointer does not claim whole payment allocated only to another invoice',()=>{
 const f=splitFixture();f.allocations=[allocation('d60','60.00')];f.items=[f.items[0]];
 const observed=allocatedRun(f);assert.equal(observed.items[0].payment.status,'REVIEW_REQUIRED');assert.equal(observed.items[0].payment.paidCents,null);
});

test('explicit pointer and allocation for same invoice count once',()=>{
 const f=splitFixture();f.documents=[f.documents[0]];f.items=[f.items[0]];f.transactions[0].amount='40.00';f.allocations=[f.allocations[0]];
 const observed=allocatedRun(f).items[0].payment;assert.equal(observed.status,'PAID');assert.equal(observed.paidCents,4000);assert.equal(observed.paymentCount,1);
});

test('unconfirmed allocation anywhere prevents settled conclusion for the transaction',()=>{
 const f=splitFixture();f.allocations[1].settlementStatus='PENDING';const observed=allocatedRun(f);
 assert.deepEqual(observed.items.map(item=>item.payment.status),['UNCONFIRMED','UNCONFIRMED']);assert.ok(observed.items.every(item=>item.payment.paidCents===null));
});

test('reversed allocated payment contributes zero to each invoice',()=>{
 const f=splitFixture();f.transactions[0].reversedAt='2026-11-18T14:00:00Z';const observed=allocatedRun(f);
 assert.deepEqual(observed.items.map(item=>item.payment.status),['REVERSED','REVERSED']);assert.deepEqual(observed.items.map(item=>item.payment.remainingCents),[4000,6000]);
 assert.ok(observed.items.every(item=>item.payment.paidCents===0));
});

test('foreign, missing, merged or credit allocation target invalidates entire payment proof',()=>{
 for(const variant of ['foreign-company','foreign-store','foreign-supplier','missing-fields','missing-document','merged','credit','allocation-company']){
  const f=splitFixture();
  if(variant==='foreign-company')f.allocations[1].companyId='foreign';
  if(variant==='foreign-store')f.allocations[1].storeId='foreign';
  if(variant==='foreign-supplier')f.allocations[1].supplierId='foreign';
  if(variant==='missing-fields')f.allocations[1].companyId=null;
  if(variant==='missing-document')f.documents.pop();
  if(variant==='merged')f.documents[1].status='MERGED';
  if(variant==='credit')f.documents[1].documentType='CREDIT_NOTE';
  if(variant==='allocation-company')f.allocations[1].allocationCompanyId='foreign';
  f.items=[f.items[0]];
  assert.equal(allocatedRun(f).items[0].payment.status,'REVIEW_REQUIRED',variant);
 }
});

test('overallocated, invalid-amount or duplicate allocation rows cannot certify payment',()=>{
 for(const variant of ['overallocated','fractional-cent','duplicate-id','duplicate-row']){
  const f=splitFixture();
  if(variant==='overallocated')f.allocations[1].amount='60.01';
  if(variant==='fractional-cent')f.allocations[1].amount='59.999';
  if(variant==='duplicate-id')f.allocations[1].id=f.allocations[0].id;
  if(variant==='duplicate-row')f.allocations.push({...f.allocations[0]});
  assert.ok(allocatedRun(f).items.every(item=>item.payment.status==='REVIEW_REQUIRED'),variant);
 }
});

test('settlement with unavailable allocation source stays review instead of whole-payment attribution',()=>{
 const f=splitFixture();f.allocations=[];
 const observed=allocatedRun(f,{available:true,allocationsAvailable:false});assert.ok(observed.items.every(item=>item.payment.status==='REVIEW_REQUIRED'));
 f.documents=[document()];f.items=[invoice()];f.transactions=[transaction({hasSettlement:true})];
 assert.equal(allocatedRun(f,{available:true,allocationsAvailable:false}).items[0].payment.status,'REVIEW_REQUIRED');
 assert.equal(allocatedRun(f,{available:true,allocationsAvailable:true}).items[0].payment.status,'PAID');
});

test('allocated transaction cannot hide unallocated active direct claimant outside selected month',()=>{
 const f=splitFixture();f.documents.push(document({id:'off-month',issueDay:'2026-10-18'}));
 assert.ok(allocatedRun(f).items.every(item=>item.payment.status==='REVIEW_REQUIRED'));
});

test('typed document pointer may name one explicit target of a split payment, not an unrelated document',()=>{
 const f=splitFixture();f.transactions[0].attachmentMimeType=mime;f.transactions[0].attachmentFilename='d40';
 assert.ok(allocatedRun(f).items.every(item=>item.payment.status==='PAID'));
 f.transactions[0].attachmentFilename='unrelated';assert.ok(allocatedRun(f).items.every(item=>item.payment.status==='REVIEW_REQUIRED'));
});

test('one thousand explicitly allocated invoices share one payment with exact per-invoice attribution',()=>{
 const count=1000,documents=[],items=[],allocations=[];
 for(let index=0;index<count;index++){
  const id='split'+index;
  documents.push(document({id,documentNumber:'B '+(index+1),totalGross:'1.00'}));
  items.push(invoice({id:'doc:'+id,totalCents:100,sources:[{kind:'DOCUMENT',id,status:'DRAFT'}]}));
  allocations.push(allocation(id,'1.00'));
 }
 const observed=allocatedRun({documents,items,allocations,transactions:[transaction({amount:'1000.00',invoiceDocumentNumber:'Πολλά παραστατικά',hasSettlement:true})]});
 assert.equal(observed.summary.paid,count);assert.equal(observed.summary.reviewRequired,0);
 assert.ok(observed.items.every(item=>item.payment.paidCents===100&&item.payment.paymentCount===1&&item.payment.transactionIds[0]==='p'));
});
