import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceNumericSuffix,findCompetingPosDraftReview,findExistingInvoicePaymentReview} from '../src/lib/pos-invoice-duplicate-review.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {lockInvoiceStore} from '../src/lib/invoice-common-draft.js';

const native={skip:!isolatedInvoiceDb()};
const identity={companyId:'c',storeId:'s',supplierId:'sup',supplierTaxId:'099999999',documentNumber:'21-NT 0006836',documentDate:'2026-10-12',documentType:'INVOICE',totalGross:3.39};
async function allState(f){
 const state={moneyStock:await f.snapshot()};
 for(const name of ['PurchaseDocument','PurchaseOrder','PurchaseOrderLine','PurchaseDocumentLine','AiReaderJob','DocumentAttachment'])state[name]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${name}" t ORDER BY row_to_json(t)::text`);
 return JSON.stringify(state);
}

test('strict trailing invoice suffix distinguishes missing digits from a genuine zero and retains large numbers exactly',()=>{
 for(const [value,want] of [['SER 0006836','6836'],['21-NT 6836','6836'],['0000','0'],['0','0'],['SER 000','0'],['SER 123456789012345678901','123456789012345678901'],['text',''],['SER 6836X',''],['6836.',''],['',''],[null,'']])assert.equal(invoiceNumericSuffix(value),want,String(value));
});

test('review helpers refuse incomplete scope, nonpositive amounts and invalid types before querying',async()=>{
 const db={$queryRaw:()=>{throw Error('Unexpected query')}};
 for(const patch of [{companyId:''},{storeId:''},{supplierId:'',supplierTaxId:''},{documentNumber:'text'},{totalGross:0},{totalGross:-3.39},{totalGross:NaN},{documentType:'UNKNOWN'}]){
  assert.equal(await findCompetingPosDraftReview(db,{...identity,...patch}),null);
  assert.equal(await findExistingInvoicePaymentReview(db,{...identity,...patch}),null);
 }
 assert.equal(await findCompetingPosDraftReview(db,{...identity,documentDate:'invalid'}),null);
 assert.equal(await findExistingInvoicePaymentReview(db,{...identity,documentType:'CREDIT_NOTE'}),null);
});

test('native draft review covers uncertain series/padding, missing day and verified VAT aliases without altering any original',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false,posLines:1});
  await f.db.$executeRawUnsafe(`INSERT INTO "Supplier"("id","companyId","taxId","name") VALUES('same-vat','c','099999999','Same VAT alias')`);
  const before=await allState(f);
  for(const patch of [{},{documentDate:null},{documentDate:undefined},{supplierId:'same-vat'}]){
   const result=await findCompetingPosDraftReview(f.db,{...identity,...patch});assert.equal(result.id,'d-pos');assert.equal(result.reviewRequired,true);
  }
  assert.equal(await findCompetingPosDraftReview(f.db,identity,{excludeDocumentId:'d-pos'}),null);
  for(const patch of [{companyId:'foreign'},{storeId:'control'},{supplierId:'different',supplierTaxId:'011111111'},{supplierId:'different',supplierTaxId:''},{documentDate:'2026-10-13'},{documentType:'CREDIT_NOTE'},{totalGross:3.45},{documentNumber:'SER 7777'}])assert.equal(await findCompetingPosDraftReview(f.db,{...identity,...patch}),null,JSON.stringify(patch));
  assert.equal(await allState(f),before);
 }finally{await f.close()}
});

test('native ledger review is independent of optional invoice relations and preserves positive active-payment boundaries',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false});
  await f.db.$executeRawUnsafe(`INSERT INTO "Supplier"("id","companyId","taxId","name") VALUES('same-vat','c','099999999','Same VAT alias')`);
  const before=await allState(f);
  for(const patch of [{},{documentDate:null},{documentDate:'2026-11-20'},{supplierId:'same-vat'}]){
   const result=await findExistingInvoicePaymentReview(f.db,{...identity,...patch});assert.equal(result.id,'payment');assert.equal(result.reviewRequired,true);
  }
  assert.equal(await findExistingInvoicePaymentReview(f.db,identity,{excludePaymentId:'payment'}),null);
  for(const patch of [{companyId:'foreign'},{storeId:'control'},{supplierId:'different',supplierTaxId:'011111111'},{supplierId:'different',supplierTaxId:''},{totalGross:3.45},{documentNumber:'SER 7777'},{documentType:'CREDIT_NOTE'}])assert.equal(await findExistingInvoicePaymentReview(f.db,{...identity,...patch}),null,JSON.stringify(patch));
  assert.equal(await allState(f),before);
  for(const statement of ['DROP TABLE "PurchaseOrder"','DROP TABLE "PurchaseDocument"','DROP TABLE "MyDataInboundDocument"','DROP TABLE "AiReaderJob"','DROP TABLE "DocumentInbox"','DROP TABLE "DocumentAttachment"'])await f.db.$executeRawUnsafe(statement);
  const ledgerBefore=await f.snapshot();assert.equal((await findExistingInvoicePaymentReview(f.db,identity)).id,'payment');assert.equal(await f.snapshot(),ledgerBefore);
  for(const change of [`"reversedAt"=NOW()`,`"reversedAt"=NULL,"amount"=-3.39`,`"amount"=0`,`"amount"=3.39,"type"='OTHER_EXPENSE'`]){
   await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET ${change} WHERE "id"='payment'`);
   const immutable=await f.snapshot();assert.equal(await findExistingInvoicePaymentReview(f.db,identity),null);assert.equal(await f.snapshot(),immutable);
  }
 }finally{await f.close()}
});

test('native first unpaid myDATA draft is not an existing payment; a padded ledger-only number or legacy note remains review evidence',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({pos:false,mydata:true,payment:false});const before=await allState(f);
  assert.equal(await findExistingInvoicePaymentReview(f.db,identity),null);assert.equal(await allState(f),before);
  await f.db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber","description") VALUES('legacy','c','s','sup','SUPPLIER_PAYMENT',3.39,NULL,'Τιμολόγιο 21-TDA 006836 — Synthetic note 2026')`);
  assert.equal((await findExistingInvoicePaymentReview(f.db,identity)).id,'legacy');
  await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "description"='invoice 21-TDA 006836 - Synthetic note 2026' WHERE "id"='legacy'`);
  assert.equal((await findExistingInvoicePaymentReview(f.db,identity)).id,'legacy');
  await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "invoiceDocumentNumber"='SER 7777' WHERE "id"='legacy'`);
  assert.equal(await findExistingInvoicePaymentReview(f.db,identity),null,'a contradictory explicit number is never replaced with note evidence');
 }finally{await f.close()}
});

test('native zero invoice suffix never matches a numberless draft or payment',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false});
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentNumber"='NUMBERLESS'`);
  await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "invoiceDocumentNumber"='NUMBERLESS',"description"='No invoice number'`);
  const zero={...identity,documentNumber:'SER 000'};
  assert.equal(await findCompetingPosDraftReview(f.db,zero),null);assert.equal(await findExistingInvoicePaymentReview(f.db,zero),null);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentNumber"='SER 0000'`);
  await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "invoiceDocumentNumber"='SER 0'`);
  assert.equal((await findCompetingPosDraftReview(f.db,zero)).id,'d-pos');assert.equal((await findExistingInvoicePaymentReview(f.db,zero)).id,'payment');
 }finally{await f.close()}
});

test('native store-locked competing numeric spellings admit only one synthetic ledger insert',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({pos:false,mydata:false,payment:false});const before=JSON.parse(await f.snapshot());
  const results=await Promise.all(['21-NT 006836','21-ΤΔΑ 6836'].map((documentNumber,index)=>f.db.$transaction(async tx=>{
   await lockInvoiceStore(tx,'c','s');
   const candidate=await findExistingInvoicePaymentReview(tx,{...identity,documentNumber});if(candidate)return {inserted:false,id:candidate.id};
   const id='synthetic-'+index;await tx.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES(${id},'c','s','sup','SUPPLIER_PAYMENT',3.39,${documentNumber})`;
   return {inserted:true,id};
  })));
  assert.equal(results.filter(r=>r.inserted).length,1);assert.equal(results[0].id,results[1].id);
  const after=JSON.parse(await f.snapshot());assert.equal(after.StoreTransaction.length,1);assert.deepEqual(after.StoreProduct,before.StoreProduct);assert.deepEqual(after.StockMovement,before.StockMovement);
 }finally{await f.close()}
});
