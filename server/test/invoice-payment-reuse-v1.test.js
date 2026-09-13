import test from "node:test";
import assert from "node:assert/strict";
import {assertReusableInvoicePayment,paymentInvoiceNumber,findInvoicePayment} from "../src/lib/invoice-payment-reuse.js";

const invoice={storeId:"a",supplierId:"supplier",documentNumber:"2612188",totalGross:2369.99};
const payment={id:"original",storeId:"a",supplierId:"supplier",type:"SUPPLIER_PAYMENT",amount:2369.99,invoiceDocumentNumber:"2612188",actorId:"old-operator",sessionId:"closed-shift",reversedAt:null,subtractFromShift:false};
test("reread preserves payment identity regardless of current operator or closed shift",()=>{
  const before=structuredClone(payment);
  assert.equal(assertReusableInvoicePayment(payment,{...invoice,actorId:"different",sessionId:"new-shift"}),payment);
  assert.deepEqual(payment,before);
});
test("reuse rejects a different invoice, store, supplier, amount, reversal and missing identity",()=>{
  for(const change of [{invoiceDocumentNumber:"12612188"},{invoiceDocumentNumber:"26121889"},{storeId:"b"},{supplierId:"other"},{amount:2360},{reversedAt:"2026-09-13"},{type:"OTHER_EXPENSE"},{invoiceDocumentNumber:null,description:"2369.99 2612188"}]){
    assert.throws(()=>assertReusableInvoicePayment({...payment,...change},invoice),{status:409});
  }
  assert.throws(()=>assertReusableInvoicePayment(payment,{...invoice,totalGross:undefined}),{status:409});
});
test("legacy invoice descriptions require a full number rather than substring matching",()=>{
  const legacy={...payment,invoiceDocumentNumber:null,description:"Τιμολόγιο TAA-XV2-00758 — Γρήγορη καταχώριση POS"};
  assert.equal(paymentInvoiceNumber(legacy),"TAA-XV2-00758");
  assert.equal(assertReusableInvoicePayment(legacy,{...invoice,documentNumber:"taa xv2 00758"}),legacy);
  assert.throws(()=>assertReusableInvoicePayment(legacy,{...invoice,documentNumber:"00758"}),{status:409});
});
test("payment lookup is company scoped, finds the oldest payment and retains regex escapes",async()=>{
  const tx={$queryRaw:async(strings,...values)=>{
    const sql=strings.join("?");
    assert.match(sql,/t\."companyId"=\?/);assert.ok(values.includes("company"));
    assert.match(sql,/t\."occurredAt" ASC/);
    assert.ok(sql.includes('CASE WHEN t."invoicePaymentKey"='));
    assert.ok(sql.includes("\\s+"));assert.ok(sql.includes("\\D"));
    return [payment];
  }};
  assert.equal(await findInvoicePayment(tx,{...invoice,companyId:"company",supplierTaxId:"998878583"}),payment);
});

test("same-company supplier aliases use verified VAT while tenant/store/amount stay strict",()=>{
  const alias={...payment,companyId:"company",supplierId:"legacy-supplier",supplierTaxId:"998878583"};
  const target={...invoice,companyId:"company",supplierTaxId:"998 878 583"};
  assert.equal(assertReusableInvoicePayment(alias,target),alias);
  for(const change of [{companyId:"other"},{storeId:"other"},{supplierTaxId:"111111111"},{amount:NaN},{amount:Infinity},{amount:-2369.99}]){
    assert.throws(()=>assertReusableInvoicePayment({...alias,...change},target),{status:409});
  }
  assert.throws(()=>assertReusableInvoicePayment(payment,{...invoice,totalGross:0}),/ποσό.*δεν εστάλη/);
});
