import assert from "node:assert/strict";
import test from "node:test";
import {collapseCrossProviderDuplicateOverage,collapseExactDuplicateInvoiceOverage,invoiceReadingCompleteness,mergeProviderInvoiceDrafts} from "../src/routes/platform-invoice-learning-ai.js";

test("Invoice Learning rejects a one-line partial result against the printed total",()=>{
  const result=invoiceReadingCompleteness({
    totalGross:1380.44,
    productLines:[{grossAmount:82.72}],
  });
  assert.equal(result.complete,false);
  assert.equal(result.reason,"PARTIAL_PRODUCT_LINES");
  assert.equal(result.lineGross,82.72);
  assert.equal(result.totalGross,1380.44);
});

test("Invoice Learning accepts reconciled lines within the invoice tolerance",()=>{
  const result=invoiceReadingCompleteness({
    totalGross:1380.44,
    productLines:[
      {grossAmount:82.72},
      {grossAmount:1297.70},
    ],
  });
  assert.equal(result.complete,true);
  assert.equal(result.reason,"RECONCILED");
});

test("Invoice Learning can retain lines when the provider exposes no printed total",()=>{
  const result=invoiceReadingCompleteness({
    totalGross:0,
    productLines:[{netAmount:100,vatRate:24}],
  });
  assert.equal(result.complete,true);
  assert.equal(result.reason,"TOTAL_NOT_AVAILABLE");
  assert.equal(result.lineGross,124);
});

test("Invoice Learning accepts all net lines when the printed net, VAT and gross footer reconcile",()=>{
  const result=invoiceReadingCompleteness({
    totalNet:47.48,
    totalVat:6.43,
    totalGross:53.91,
    productLines:[
      {netAmount:20.12,vatRate:0},
      {netAmount:27.36,vatRate:0},
    ],
  });
  assert.equal(result.complete,true);
  assert.equal(result.reason,"RECONCILED_BY_HEADER_VAT");
  assert.equal(result.requiresLineVatReview,true);
  assert.equal(result.lineNet,47.48);
});

test("Invoice Learning still rejects missing rows when only the footer itself reconciles",()=>{
  const result=invoiceReadingCompleteness({
    totalNet:47.48,
    totalVat:6.43,
    totalGross:53.91,
    productLines:[{netAmount:20.12,vatRate:0}],
  });
  assert.equal(result.complete,false);
  assert.equal(result.reason,"PARTIAL_PRODUCT_LINES");
});

test("Invoice Learning keeps Azure when SubTotal is absent but TotalTax derives the complete net",()=>{
  const result=invoiceReadingCompleteness({
    totalNet:0,
    totalVat:6.43,
    totalGross:53.91,
    productLines:[
      {netAmount:20.12,vatRate:0,grossAmount:20.12},
      {netAmount:27.36,vatRate:0,grossAmount:27.36},
    ],
  });
  assert.equal(result.complete,true);
  assert.equal(result.reason,"RECONCILED_BY_DERIVED_HEADER_VAT");
  assert.equal(result.derivedTotalNet,47.48);
  assert.equal(result.requiresLineVatReview,true);
});

test("Invoice Learning does not derive footer net when line-level VAT is already present",()=>{
  const result=invoiceReadingCompleteness({
    totalNet:0,
    totalVat:6.43,
    totalGross:53.91,
    productLines:[
      {netAmount:20.12,vatRate:13,grossAmount:22.7356},
      {netAmount:24.7444,vatRate:13,grossAmount:27.9568},
    ],
  });
  assert.equal(result.complete,false);
  assert.equal(result.reason,"PARTIAL_PRODUCT_LINES");
});

test("Invoice Learning safely combines complementary Azure and OpenAI rows",()=>{
  const hybrid=mergeProviderInvoiceDrafts(
    {model:"azure",totalNet:47.48,totalVat:6.43,totalGross:53.91,productLines:[
      {supplierItemCode:"A",description:"FIRST",netAmount:20.12,grossAmount:20.12,vatRate:0},
    ]},
    {model:"openai",totalNet:47.48,totalVat:6.43,totalGross:53.91,productLines:[
      {supplierItemCode:"B",description:"SECOND",netAmount:27.36,grossAmount:27.36,vatRate:0},
    ]},
  );
  assert.equal(hybrid.productLines.length,2);
  assert.equal(hybrid.hybridRecovery,true);
  assert.equal(invoiceReadingCompleteness(hybrid).complete,true);
  assert.equal(invoiceReadingCompleteness(hybrid).reason,"RECONCILED_BY_HEADER_VAT");
});

test("Invoice Learning hybrid merge does not duplicate the same provider row",()=>{
  const hybrid=mergeProviderInvoiceDrafts(
    {productLines:[{supplierItemCode:"A-1",description:"PRODUCT",netAmount:10}]},
    {productLines:[{supplierItemCode:"A-1",description:"PRODUCT",netAmount:10,confidence:90}]},
  );
  assert.equal(hybrid.productLines.length,1);
  assert.equal(hybrid.productLines[0].hybridMatched,true);
});

test("Invoice Learning drops one exact duplicate only when it is the unique footer overage",()=>{
  const duplicate={supplierItemCode:"C",description:"DUPLICATE",quantity:1,unitPrice:1.74,netAmount:1.74,grossAmount:1.74,vatRate:0};
  const repaired=collapseExactDuplicateInvoiceOverage([
    {supplierItemCode:"A",description:"FIRST",quantity:1,netAmount:20.12,grossAmount:20.12,vatRate:0},
    duplicate,
    {supplierItemCode:"B",description:"SECOND",quantity:1,netAmount:32.05,grossAmount:32.05,vatRate:0},
    {...duplicate},
  ],53.91);
  assert.equal(repaired.collapsed,true);
  assert.equal(repaired.removed,1);
  assert.equal(repaired.overage,1.74);
  assert.equal(invoiceReadingCompleteness({totalGross:53.91,productLines:repaired.lines}).complete,true);
});

test("Invoice Learning retains real or ambiguous repeated rows",()=>{
  const duplicate={supplierItemCode:"C",description:"DUPLICATE",quantity:1,netAmount:1.74,grossAmount:1.74,vatRate:0};
  const realRepeat=collapseExactDuplicateInvoiceOverage([duplicate,{...duplicate}],3.48);
  assert.equal(realRepeat.collapsed,false);
  const another={...duplicate,supplierItemCode:"D",description:"ANOTHER"};
  const ambiguous=collapseExactDuplicateInvoiceOverage([duplicate,{...duplicate},another,{...another}],5.22);
  assert.equal(ambiguous.collapsed,false);
});

test("Invoice Learning collapses one cross-provider description variant proven by the footer",()=>{
  const lines=[
    {providerOrigin:"AZURE",supplierItemCode:"",description:"COFFEE CAPPUCCINO",quantity:1,unitPrice:2.68,netAmount:2.68,grossAmount:2.68,vatRate:0,confidence:80},
    {providerOrigin:"OPENAI",supplierItemCode:"C-1",description:"CAPPUCCINO COFFEE 250ML",quantity:1,unitPrice:2.68,netAmount:2.68,grossAmount:2.68,vatRate:0,confidence:95},
    {providerOrigin:"OPENAI",supplierItemCode:"B",description:"OTHER",quantity:1,unitPrice:51.23,netAmount:51.23,grossAmount:51.23,vatRate:0},
  ];
  const repaired=collapseCrossProviderDuplicateOverage(lines,53.91);
  assert.equal(repaired.collapsed,true);
  assert.equal(repaired.removed,1);
  assert.equal(repaired.overage,2.68);
  assert.equal(repaired.lines.length,2);
  assert.equal(repaired.lines[0].providerOrigin,"AZURE+OPENAI");
});

test("Invoice Learning does not collapse real or ambiguous cross-provider rows",()=>{
  const azure={providerOrigin:"AZURE",description:"COFFEE",quantity:1,unitPrice:2.68,netAmount:2.68,grossAmount:2.68,vatRate:0};
  const openai={...azure,providerOrigin:"OPENAI",description:"COFFEE 250ML"};
  assert.equal(collapseCrossProviderDuplicateOverage([azure,openai],5.36).collapsed,false);
  const secondAzure={...azure,description:"HERBAL TEA",grossAmount:2.68};
  const secondOpenAi={...openai,description:"HERBAL TEA 250ML"};
  assert.equal(collapseCrossProviderDuplicateOverage([azure,openai,secondAzure,secondOpenAi],8.04).collapsed,false);
});
