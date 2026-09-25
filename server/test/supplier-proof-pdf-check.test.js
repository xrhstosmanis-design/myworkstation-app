import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {parseSupplierProofText,readBankDepositProofPdf,readSupplierProofPdf,supplierProofMismatch} from '../src/routes/supplier-proof-pdf-check.js';

const fixture=async name=>readFile(new URL(`./fixtures/${name}`,import.meta.url));

test('P08 PDF explicitly says bank transfer and rejects a cash shift before payment posting',async()=>{
  const proof=await readSupplierProofPdf(await fixture('g5-p08-bank-transfer.pdf'));
  assert.deepEqual(proof,{amount:46.92,method:'BANK_TRANSFER',invoiceReference:'BB6529'});
  assert.match(supplierProofMismatch(proof,{amount:46.92,method:'CASH_SHIFT'}),/τρόπος πληρωμής/);
  assert.match(supplierProofMismatch(proof,{amount:46.93,method:'BANK_TRANSFER'}),/ποσό/);
});

test('P09 matching synthetic PDF passes explicit amount, method and invoice checks',async()=>{
  const proof=await readSupplierProofPdf(await fixture('g5-p09-bank-transfer.pdf'));
  assert.equal(proof.amount,46.92);
  assert.equal(proof.method,'BANK_TRANSFER');
  assert.equal(supplierProofMismatch(proof,{amount:46.92,method:'BANK_TRANSFER',documentNumbers:['ΒΒ 6529']}),null);
  assert.match(supplierProofMismatch(proof,{amount:46.92,method:'BANK_TRANSFER',documentNumbers:['ΑΛΛΟ 1']}),/παραστατικό/);
});

test('unreadable PDF remains unverified for human review',async()=>{
  assert.equal(await readSupplierProofPdf(Buffer.from('%PDF- unreadable')),null);
  assert.equal(supplierProofMismatch(null,{amount:1,method:'BANK_TRANSFER'}),null);
});

test('ambiguous printed payment fields are not used to reject a payment',()=>{
  const ambiguous='Ποσό πληρωμής: 1,00 €\nΠοσό πληρωμής: 2,00 €\nΤρόπος πληρωμής: Μετρητά';
  assert.equal(parseSupplierProofText(ambiguous),null);
  assert.equal(parseSupplierProofText('Αναφορά 1,00 € χωρίς σαφή στοιχεία').amount,null);
});

test('P05 deposit PDF yields the printed amount, never a prefilled form amount',async()=>{
  assert.equal(await readBankDepositProofPdf(await fixture('g5-p05-bank-deposit.pdf')),0.10);
  assert.equal(await readBankDepositProofPdf(Buffer.from('%PDF- unreadable')),null);
  assert.equal(await readBankDepositProofPdf(await fixture('g5-p09-bank-transfer.pdf')),null);
});
