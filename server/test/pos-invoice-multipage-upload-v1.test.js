import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {verifyInvoiceDiscounts} from "../src/lib/invoice-discount-verifier.js";
import {finalizeV244ProductLines} from "../../client/src/lib/invoice-v244-core.js";
import {mergeFastInvoiceHeaders} from "../../client/src/lib/invoice-fast-header-merge.js";

const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
const backofficeIntake=await readFile(new URL("../../client/src/purchase-order-invoice-intake-bootstrap.js",import.meta.url),"utf8");
const intake=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
const wrapper=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const jobs=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const azure=await readFile(new URL("../src/routes/commerce-azure-invoice-reader.js",import.meta.url),"utf8");
const aiRecheck=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
const v244Client=await readFile(new URL("../../client/src/lib/invoice-v244-core.js",import.meta.url),"utf8");

test("POS accepts and visibly orders up to five pages for one invoice",()=>{
  assert.match(client,/type="file" multiple accept="image\/\*,application\/pdf"/);
  assert.match(client,/incoming\.length>5-pages\.length/);
  assert.match(client,/Σελίδα \{index\+1\}/);
  assert.match(client,/movePage\(index,-1\)/);
  assert.match(client,/movePage\(index,1\)/);
});

test("STEFANIDIS FAST header is independent of reversed page selection",()=>{
  const pageTwo={supplierId:"supplier",supplierName:"ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ",supplierTaxId:"998878583",documentNumber:"2 2612188",documentDate:"2026-09-02",totalGross:2369.99,confidence:91};
  const pageOne={supplierName:"ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ",supplierTaxId:"998878583",documentNumber:"2612188",documentDate:"2026-09-02",totalGross:1492.20,confidence:93};
  for(const headers of [[pageTwo,pageOne],[pageOne,pageTwo]]){
    const merged=mergeFastInvoiceHeaders(headers);
    assert.equal(merged.documentHeader.documentNumber,"2612188");
    assert.equal(merged.totalHeader.totalGross,2369.99);
    assert.equal(merged.supplierHeader.supplierTaxId,"998878583");
  }
});

test("POS reads multipage FAST headers sequentially without losing a successful page",()=>{
  const start=client.indexOf("const processedPages=[...nextPages]");
  const end=client.indexOf("setPages(processedPages)",start);
  const headerRead=client.slice(start,end);
  assert.match(headerRead,/for\(const sourcePage of headerPages\)/);
  assert.match(headerRead,/await api\("\/api\/commerce\/ai-reader\/fast-header"/);
  assert.match(headerRead,/catch\(error\)\{headerErrors\.push\(error\)\}/);
  assert.doesNotMatch(headerRead,/Promise\.all|Promise\.allSettled/);
});

test("POS background reads central STEFANIDIS Azure pages in order before unified AI",()=>{
  const fastPath=aiRecheck.indexOf("if(preferCentralStefanidis&&process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
  const unified=aiRecheck.indexOf('fetch("https://api.openai.com/v1/responses"');
  assert.ok(fastPath>0&&fastPath<unified);
  assert.match(aiRecheck,/readAzurePagesSequentially\(pageJobs\)/);
  assert.match(aiRecheck,/for\(const page of pageJobs\)pages\.push/);
  assert.match(aiRecheck,/preferCentralStefanidis=cleanTaxId\(supplierRows\[0\]\?\.taxId\)===STEFANIDIS_TAX_ID/);
  assert.match(aiRecheck,/parsed\.totalGross=money2\(posHandoff\.totalGross\|\|parsed\.totalGross\)/);
  assert.match(aiRecheck,/parsed\.stefanidisCentralFastPath=true/);
});

test("fast header falls back from Azure without blocking payment",()=>{
  assert.match(wrapper,/FAST Azure header failed; trying configured fallback/);
  assert.match(wrapper,/if\(!process\.env\.OPENAI_API_KEY\)\{const wrapped=new Error/);
  assert.match(wrapper,/Η πληρωμή δεν έγινε/);
});

test("fast header also falls back when Azure succeeds with an empty header",()=>{
  assert.match(wrapper,/const azureHeader=/);
  assert.match(wrapper,/const azureHasUsefulHeader=Boolean/);
  assert.match(wrapper,/if\(azureHasUsefulHeader&&azureProductLines\.length\)return res\.json\(azureHeader\)/);
  assert.match(wrapper,/if\(azureHasUsefulHeader\)azureHeaderFallback=azureHeader/);
  assert.match(wrapper,/FAST Azure header incomplete; trying configured fallback/);
  assert.match(wrapper,/δεν επέστρεψε ασφαλή βασικά στοιχεία/);
});

test("fast header preserves a readable fallback inside its dedicated POS request budget",async()=>{
  const operator=await readFile(new URL("../../client/src/components/store/StoreOperatorApp.jsx",import.meta.url),"utf8");
  assert.match(wrapper,/FAST_AZURE_HEADER_TIMEOUT_MS=20000/);
  assert.match(wrapper,/FAST_OPENAI_HEADER_TOTAL_TIMEOUT_MS=70000/);
  assert.match(wrapper,/callAzure\(\{contentData:dataUrl,mimeType,timeoutMs:FAST_AZURE_HEADER_TIMEOUT_MS\}\)/);
  assert.match(wrapper,/const remainingMs=deadline-Date\.now\(\)/);
  assert.match(wrapper,/signal:AbortSignal\.timeout\(remainingMs\)/);
  assert.match(wrapper,/detail:"high"/);
  assert.match(azure,/deadline=Number\(timeoutMs\)>0/);
  assert.match(azure,/signal:requestSignal\(\)/);
  assert.match(client,/fast-header.*timeoutMs:100000/);
  assert.match(operator,/timeoutMs=Math\.max\(1000,Number\(options\.timeoutMs\|\|30000\)\)/);
});

test("BackOffice purchase intake keeps every selected invoice page",()=>{
  assert.match(backofficeIntake,/data-image-file type="file"[^>]*multiple/);
  assert.match(backofficeIntake,/data-pdf-file type="file"[^>]*multiple/);
  assert.match(backofficeIntake,/for\(const \[pageIndex,file\] of files\.entries\(\)\)/);
  assert.match(backofficeIntake,/additionalPageJobIds:pageJobs\.slice\(1\)\.map\(page=>page\.id\)/);
  assert.match(backofficeIntake,/Η πολυσέλιδη ανάγνωση σταμάτησε με ασφάλεια/);
  assert.match(backofficeIntake,/headerIndexes=files\.length>1\?\[0,files\.length-1\]:\[0\]/);
});

test("camera preview attaches and plays the acquired stream before capture",()=>{
  assert.match(client,/useEffect\(\(\)=>\{if\(!cameraOpen\|\|!stream\|\|!videoRef\.current\)return/);
  assert.match(client,/video\.srcObject=stream/);
  assert.match(client,/video\.play\(\)\.catch/);
  assert.match(client,/facingMode:\{ideal:"environment"\}/);
  assert.match(client,/Η προεπισκόπηση κάμερας δεν είναι ακόμη έτοιμη/);
});

test("multipage OCR sends all ordered pages through one invoice analysis",()=>{
  const background=wrapper.slice(wrapper.indexOf("function scheduleFastBackground"),wrapper.indexOf("async function ensureFastHandoffSchema"));
  assert.match(wrapper,/const pageJobIds=jobs\.map\(job=>job\.id\)/);
  assert.match(background,/ai-recheck.*additionalPageJobIds/s);
  assert.match(background,/const productLines=finalizeV244ProductLines/);
  assert.match(background,/productLines/);
  assert.match(background,/additionalPageJobIds/);
  assert.match(aiRecheck,/const fileParts=pageJobs\.map/);
  assert.match(aiRecheck,/content:\[\{type:"input_text",text:prompt\},\.\.\.fileParts\]/);
  assert.match(aiRecheck,/πρώτα από τη σελίδα 1, μετά από τη σελίδα 2/);
  assert.match(aiRecheck,/«Σε μεταφορά» ή «Από μεταφορά».*ΔΕΝ προστίθεται δεύτερη φορά/s);
  assert.match(aiRecheck,/totalGross.*τελικό πληρωτέο ποσό της τελευταίας σελίδας/s);
  assert.match(azure,/additionalPageJobIds.*return next\(\)/s);
});

test("full OCR provider calls are bounded so durable recovery cannot remain POS_PROCESSING forever",()=>{
  const verifierCall=/verifyInvoiceDiscounts\(\{contentData:page\.contentData,[^}]*timeoutMs:FULL_OCR_PROVIDER_TIMEOUT_MS,[^}]*reverifyAll:mantzilasInvoice\}\)/;
  assert.match(aiRecheck,/FULL_OCR_PROVIDER_TIMEOUT_MS=70000/);
  assert.match(aiRecheck,/signal:AbortSignal\.timeout\(FULL_OCR_PROVIDER_TIMEOUT_MS\)/);
  assert.match(aiRecheck,/CENTRAL_AZURE_PAGE_TIMEOUT_MS=25000/);
  assert.match(aiRecheck,/callAzure\(\{contentData:page\.contentData,mimeType:page\.mimeType,timeoutMs:CENTRAL_AZURE_PAGE_TIMEOUT_MS\}\)/);
  assert.match(wrapper,/aborted due to timeout\|TimeoutError/);
  assert.match(aiRecheck,verifierCall);
});

test("OpenAI full-table fallback outlives an exhausted Azure F0 request",()=>{
  assert.match(aiRecheck,/FULL_OCR_PROVIDER_TIMEOUT_MS=70000/);
  assert.match(wrapper,/INTERNAL_COMMERCE_REQUEST_TIMEOUT_MS=180000/);
  assert.match(aiRecheck,/if\(!parsed\)try\{/);
  assert.match(aiRecheck,/OPENAI=.*providerErrorText\(unifiedAiFailure\)/);
  assert.ok(wrapper.indexOf("INTERNAL_COMMERCE_REQUEST_TIMEOUT_MS=180000")<wrapper.indexOf("function internalCommerceRequest"));
});

test("full-table OCR uses the bounded vision model instead of the general reasoning model",()=>{
  assert.match(aiRecheck,/const FULL_OCR_MODEL=process\.env\.OPENAI_INVOICE_FULL_MODEL\|\|process\.env\.OPENAI_INVOICE_FAST_MODEL\|\|"gpt-5-mini"/);
  assert.match(aiRecheck,/model:FULL_OCR_MODEL,reasoning:\{effort:"minimal"\},input:/);
  assert.match(aiRecheck,/verifyInvoiceDiscounts\(\{[^}]*model:FULL_OCR_MODEL/s);
  assert.doesNotMatch(aiRecheck,/model:process\.env\.OPENAI_INVOICE_MODEL\|\|"gpt-5"/);
});

test("full-table OCR returns one compact structured table and rebuilds audit text locally",()=>{
  assert.match(aiRecheck,/const invoiceSchema=.*totalGross.*productLines/s);
  assert.doesNotMatch(aiRecheck,/const invoiceSchema=.*rawText:\{type:"string"\}.*productLines/s);
  assert.doesNotMatch(aiRecheck,/const invoiceSchema=.*lines:\{type:"array".*productLines/s);
  assert.match(aiRecheck,/Μην επαναλάβεις όλο το παραστατικό ως ξεχωριστό rawText ή lines/);
  assert.match(aiRecheck,/if\(!String\(parsed\.rawText\|\|""\)\.trim\(\)\)parsed\.rawText=parsed\.productLines\.map/);
  assert.match(aiRecheck,/parsed\.lines=auditLines/);
});

test("full-table OCR spends its bounded provider window on extraction instead of reasoning",()=>{
  const requests=[...aiRecheck.matchAll(/model:FULL_OCR_MODEL,reasoning:\{effort:"minimal"\},input:/g)];
  assert.equal(requests.length,2);
  assert.match(aiRecheck,/name:"invoice_extract",strict:true,schema:invoiceSchema/);
  assert.match(aiRecheck,/name:"invoice_product_table_extract",strict:true,schema:productTableSchema/);
  assert.match(aiRecheck,/FULL_OCR_PROVIDER_TIMEOUT_MS=70000/);
});

test("full OCR preserves the failing provider and page instead of hiding the root error",()=>{
  assert.match(aiRecheck,/const providerErrorText=error=>/);
  assert.match(aiRecheck,/timeout\?"AZURE_TIMEOUT":"FULL_OCR_PROVIDER_FAILURE"/);
  assert.match(aiRecheck,/AZURE_PAGE_\$\{failedPageIndex\+1\}=\$\{providerErrorText\(failure\)\}/);
  assert.match(aiRecheck,/wrapped\.status=timeout\?503:502/);
  assert.doesNotMatch(aiRecheck,/const wrapped=new Error\("Η ενιαία ανάγνωση απέτυχε και δεν ανακτήθηκαν με ασφάλεια όλες οι σελίδες του τιμολογίου\."\)/);
});

test("a multipage invoice is blocked rather than saved empty when no product lines are found",()=>{
  const background=wrapper.slice(wrapper.indexOf("function scheduleFastBackground"),wrapper.indexOf("async function ensureFastHandoffSchema"));
  assert.match(background,/if\(!productLines\.length\)throw new Error/);
  assert.doesNotMatch(background,/allowEmptyLines/);
  assert.match(wrapper,/if\(!lines\.length\)return res\.status\(409\)/);
  assert.match(intake,/rawLines\.length===0\)return res\.status\(409\)/);
});

test("a total mismatch is created as a BackOffice draft without stock posting",()=>{
  assert.match(wrapper,/const reconciliationRequired=diff>POS_HANDOFF_TOLERANCE/);
  assert.doesNotMatch(wrapper,/if\(diff>POS_HANDOFF_TOLERANCE\)return res\.status\(409\)/);
  assert.match(wrapper,/ΕΛΕΓΧΟΣ BACKOFFICE/);
  assert.match(intake,/reconciliationRequired:z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(intake,/reconciliationDifference:z\.coerce\.number\(\)\.min\(0\)\.optional\(\)\.default\(0\)/);
  assert.match(intake,/reconciliationRequired:body\.reconciliationRequired/);
  assert.match(intake,/stockUpdated:false/);
  assert.match(client,/result\.reconciliationRequired/);
  assert.match(client,/καταχωρίστηκε ως ΠΡΟΧΕΙΡΟ και χρειάζεται έλεγχο BackOffice/);
});

test("all page attachments are archived only after the single purchase is created",()=>{
  assert.match(wrapper,/additionalPageJobIds:Array\.isArray\(source\.additionalPageJobIds\)/);
  assert.match(intake,/additionalPageJobIds:z\.array\(z\.string\(\)\.min\(1\)\)\.max\(4\)/);
  assert.match(intake,/const archiveJobs=\[job,/);
  assert.match(intake,/Σελίδα \$\{pageIndex\+1\}\/\$\{archiveJobs\.length\}/);
  assert.match(intake,/"status"='MERGED_PAGE'/);
  assert.match(jobs,/COALESCE\(j\."status",''\)<>'MERGED_PAGE'/);
  assert.ok(intake.indexOf('INSERT INTO "PurchaseOrder"')<intake.indexOf('const archiveJobs='));
});

test("additional page jobs are locked individually and internal intake errors identify their stage",()=>{
  assert.match(intake,/for\(const pageJobId of pageJobIds\)/);
  assert.match(intake,/"id"=\$\{pageJobId\} LIMIT 1 FOR UPDATE/);
  assert.doesNotMatch(intake,/ANY\(\$\{pageJobIds\}::text\[\]\)/);
  assert.match(intake,/Η καταχώριση τιμολογίου απέτυχε στο στάδιο \$\{stage\}/);
  assert.match(intake,/safeError\.code="V244_INTAKE_INTERNAL"/);
  assert.match(intake,/lockedReplacement&&pageJob\.purchaseDocumentId&&pageJob\.purchaseDocumentId!==skeletonDocumentId/);
});


test("empty initial invoice extraction triggers the table recovery pass",()=>{
  assert.match(aiRecheck,/const needsTablePass=!parsed\.azureUnifiedFallback&&\(parsed\.productLines\.length===0\|\|allNumericMissing\|\|partialNumericMissing\|\|totalMismatch\)/);
  assert.match(aiRecheck,/if\(needsTablePass\|\|inconsistentRows\)/);
  assert.match(aiRecheck,/const recovered=Array\.isArray\(tableParsed\.productLines\)/);
});


test("failed unified AI recovers every page through Azure without adding carry-forward totals",()=>{
  assert.match(aiRecheck,/function mergeAzureInvoicePages\(pages\)/);
  assert.match(aiRecheck,/if\(pageTotal>0\)\{totalGross=pageTotal;finalTotalPage=pageIndex\+1\}/);
  assert.doesNotMatch(aiRecheck,/totalGross\+=pageTotal/);
  assert.match(aiRecheck,/Promise\.allSettled\(pageJobs\.map\(page=>callAzure/);
  assert.match(aiRecheck,/FULL_OCR_PROVIDER_FAILURE/);
  assert.match(aiRecheck,/parsed\.openAiUnifiedFailed=true/);
  assert.match(aiRecheck,/parsed\.openAiUnifiedRecovery="AZURE_ALL_PAGES"/);
  assert.match(aiRecheck,/timeout=isProviderTimeout\(failure\)/);
  assert.match(aiRecheck,/AZURE_TIMEOUT\|TimeoutError\|aborted due to timeout/);
  assert.match(aiRecheck,/if\(!parsed\.azureUnifiedFallback&&needsAzureFields/);
  assert.match(aiRecheck,/catch\{discountDiagnostics\.providerFailures=/);
});

test("multipage invoice recovery also uses Azure to fill missing VAT",()=>{
  assert.match(aiRecheck,/import \{callAzure,normalizeAzure\} from ".\/commerce-azure-invoice-reader\.js"/);
  assert.match(aiRecheck,/const hasSafeLine=parsed\.productLines\.some/);
  assert.match(aiRecheck,/needsAzureFields=!hasSafeLine\|\|totalMismatch\|\|inconsistentRows\|\|parsed\.productLines\.some\(line=>Number\(line\?\.vatRate\|\|0\)<=0\)/);
  assert.match(aiRecheck,/if\(!parsed\.azureUnifiedFallback&&needsAzureFields&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_KEY\)/);
  assert.match(aiRecheck,/for\(const \[pageIndex,page\] of pageJobs\.entries\(\)\)/);
  assert.match(aiRecheck,/azureRecovered\.push\(\.\.\.\(Array\.isArray\(azure\?\.productLines\)/);
  assert.match(aiRecheck,/parsed\.productLines=mergeRecoveredLines\(parsed\.productLines,azureRecovered\)/);
  assert.match(aiRecheck,/const confirmedHandoffTotal=money2\(linkedDraft\[0\]\?\.totalGross\|\|posHandoff\?\.totalGross\|\|0\)/);
  assert.match(aiRecheck,/parsed\.totalGross=confirmedHandoffTotal/);
});

test("Azure-derived net unit cost does not hide invoice discounts",async()=>{
  const verifier=await readFile(new URL("../src/lib/invoice-discount-verifier.js",import.meta.url),"utf8");
  assert.match(verifier,/timeoutMs=0/);
  assert.match(verifier,/signal:AbortSignal\.timeout\(Number\(timeoutMs\)\)/);
  assert.match(azure,/azureUnitCostDerivedFromNet=true/);
  assert.match(azure,/azureUnitCostDerivedFromNet,azureSequence/);
  assert.match(verifier,/Number\(line\.unitCost\|\|0\)>0&&!line\.azureUnitCostDerivedFromNet/);
  assert.match(verifier,/originalUnitPrice/);
  assert.match(verifier,/printedQuantity=safeAmount\(candidate\.printedQuantity\)/);
  assert.match(verifier,/validationLine=\{\.\.\.line/);
  assert.match(verifier,/originalUnitPrice>0/);
  assert.match(verifier,/line\.unitCost=originalUnitPrice/);
});

test("main AI extraction carries original prices, discount pairs, and verifies line arithmetic",async()=>{
  const verifier=await readFile(new URL("../src/lib/invoice-discount-verifier.js",import.meta.url),"utf8");
  assert.match(aiRecheck,/discount1Amount:\{type:"number"/);
  assert.match(aiRecheck,/ΤΙΜΗ ΜΟΝΑΔΑΣ ΠΡΙΝ ΑΠΟ ΕΚΠΤΩΣΕΙΣ=unitCost/);
  assert.match(aiRecheck,/import \{verifyInvoiceDiscounts\}/);
  assert.match(aiRecheck,/Math\.abs\(q\*u-net\)>Math\.max\(0\.05,net\*0\.02\)/);
  assert.match(verifier,/qty × original price - discounts reproduces net/);
  assert.match(verifier,/line\.discount1Amount=0/);
  assert.match(verifier,/applyValidatedPairs\(line,validated\)/);
  assert.match(v244Client,/structuredVerified=String\(line\?\.discountSource/);
});

test("one complete 25 percent line repairs sibling lines only when every net value balances",async()=>{
  const productLines=[
    {quantity:10,unitCost:1.4,netAmount:10.5,discount1:0,discount1Amount:0},
    {quantity:10,unitCost:1.05,netAmount:7.88,discount1:0,discount1Amount:0},
    {quantity:12,unitCost:1.5,netAmount:13.5,discount1:25,discount1Amount:0}
  ];
  await verifyInvoiceDiscounts({productLines});
  assert.deepEqual(productLines.map(line=>line.discount1),[25,25,25]);
  assert.deepEqual(productLines.map(line=>line.discount1Amount),[3.5,2.625,4.5]);
  assert.ok(productLines.every(line=>String(line.discountSource||'').includes('VERIFIED')));
});

test("rounded net values snap an AI-derived 24.9524 percent back to the verified invoice 25 percent",async()=>{
  const productLines=[
    {quantity:10,unitCost:1.4,netAmount:10.5,discount1:25,discount1Amount:3.5},
    {quantity:10,unitCost:1.05,netAmount:7.88,discount1:24.9524,discount1Amount:2.62},
    {quantity:10,unitCost:1.05,netAmount:7.88,discount1:24.9524,discount1Amount:2.62},
    {quantity:12,unitCost:1.5,netAmount:13.5,discount1:25,discount1Amount:4.5}
  ];
  await verifyInvoiceDiscounts({productLines});
  assert.deepEqual(productLines.map(line=>line.discount1),[25,25,25,25]);
  assert.deepEqual(productLines.map(line=>line.discount1Amount),[3.5,2.625,2.625,4.5]);
});

test("printed original price restores a missing discount hidden inside net unit cost",async()=>{
  const productLines=[{
    code:"340061124",
    description:"LAYS PRAWN 120G (C20U)",
    rawText:"340061124 LAYS PRAWN 120G C20U ΤΕΜ 2 1,420 2,84 15,00 0,43 2,41 13",
    quantity:2,
    unitCost:1.205,
    netAmount:2.41,
    vatRate:13,
    grossAmount:2.72,
    discount1:0,
    discount1Amount:0,
  }];
  const result=await verifyInvoiceDiscounts({productLines});
  assert.equal(productLines[0].unitCost,1.42);
  assert.equal(productLines[0].discount1,15);
  assert.equal(productLines[0].discount1Amount,0.43);
  assert.equal(productLines[0].netAmount,2.41);
  assert.equal(result.rawEconomicsAccepted,1);
});

test("MANTZILAS focused reread replaces a self-consistent wrong quantity and returns printed VAT groups",async()=>{
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[{index:1,printedQuantity:1,printedUnit:"KIB",originalUnitPrice:19.55,discountPercent1:31,discountAmount1:6.06,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,confidence:99,evidence:"1 × 19,55 - 6,06 = 13,49"}],vatSummary:[{rate:24,taxable:145.2,vat:34.85,gross:180.05},{rate:13,taxable:220.55,vat:28.67,gross:249.22}]})})});
  try{
    const productLines=[{code:"00009",description:"COCA COLA ZERO 0,33LT x24pack ΚΟΥΤΙ",rawText:"00009 COCA COLA ZERO",quantity:2,invoiceQuantity:2,unit:"PACKAGE",invoiceUnit:"PACKAGE",unitCost:19.55,netAmount:13.49,discount1:65.5,discount1Amount:25.61,discount2:0,discount2Amount:0,discount3:0,discount3Amount:0}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true});
    assert.equal(productLines[0].quantity,1);assert.equal(productLines[0].invoiceQuantity,1);assert.equal(productLines[0].unitCost,19.55);
    assert.equal(productLines[0].discount1,31);assert.equal(productLines[0].discount1Amount,6.06);assert.equal(productLines[0].netAmount,13.49);
    assert.deepEqual(result.vatSummary,[{rate:24,taxable:145.2,vat:34.85,gross:180.05},{rate:13,taxable:220.55,vat:28.67,gross:249.22}]);
  }finally{global.fetch=originalFetch}
});

test("V2.4.4 does not accept net value as the initial value when quantity times price disagrees",()=>{
  const [line]=finalizeV244ProductLines([{description:'COOKIE',rawText:'COOKIE ΤΜΧ 10 1,40 10,50',quantity:10,unitCost:1.4,netAmount:10.5,vatRate:13}]);
  assert.equal(line.initialAmount,14);
  assert.equal(line.discount1,25);
  assert.equal(line.discount1Amount,3.5);
});

test("locked reread admits only an unclaimed or same-draft secondary page",()=>{
  assert.match(intake,/lockedReplacement&&pageJob\.purchaseDocumentId&&pageJob\.purchaseDocumentId!==skeletonDocumentId/);
});
