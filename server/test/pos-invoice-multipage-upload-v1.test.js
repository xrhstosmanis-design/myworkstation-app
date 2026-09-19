import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {verifyInvoiceDiscounts} from "../src/lib/invoice-discount-verifier.js";
import {finalizeV244ProductLines} from "../../client/src/lib/invoice-v244-core.js";
import {mergeFastInvoiceHeaders} from "../../client/src/lib/invoice-fast-header-merge.js";
import {recoverVatSummaryInvoiceTotal} from "../src/lib/invoice-total-reading.js";

const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
const backofficeIntake=await readFile(new URL("../../client/src/purchase-order-invoice-intake-bootstrap.js",import.meta.url),"utf8");
const intake=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
const wrapper=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const jobs=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const azure=await readFile(new URL("../src/routes/commerce-azure-invoice-reader.js",import.meta.url),"utf8");
const aiRecheck=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
const discountVerifier=await readFile(new URL("../src/lib/invoice-discount-verifier.js",import.meta.url),"utf8");
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
  const fastPath=aiRecheck.indexOf("if((preferCentralStefanidis||preferCentralMantzilas)&&process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
  const unified=aiRecheck.indexOf('fetch("https://api.openai.com/v1/responses"');
  assert.ok(fastPath>0&&fastPath<unified);
  assert.match(aiRecheck,/readAzurePagesSequentially\(pageJobs\)/);
  assert.match(aiRecheck,/for\(const page of pageJobs\)pages\.push/);
  assert.match(aiRecheck,/preferCentralStefanidis=supplierTaxId===STEFANIDIS_TAX_ID/);
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

test("MANTZILAS FAST total uses the balanced VAT summary and ignores the account balance",()=>{
  const printed=`ΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ Φ.Π.Α.
  24 204,31 49,03 253,34
  13 41,87 5,44 47,31
  0 18,09 0,00 18,09
  ΣΥΝΟΛΑ 264,27 54,47 318,74
  ΣΥΝΟΛΟ 300,65 ΕΓΓΥΟΔΟΣΙΑ 18,09 ΠΡΟΗΓΟΥΜΕΝΟ ΥΠΟΛΟΙΠΟ 4.212,27 ΝΕΟ ΥΠΟΛΟΙΠΟ 4.531,01`;
  assert.equal(recoverVatSummaryInvoiceTotal(printed),318.74);
  assert.equal(recoverVatSummaryInvoiceTotal("ΝΕΟ ΥΠΟΛΟΙΠΟ 4.531,01"),0,"an account balance alone is never an invoice total proof");
  assert.equal(recoverVatSummaryInvoiceTotal("ΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ ΣΥΝΟΛΑ 264,27 54,47 319,74"),0,"an unbalanced summary is rejected");
  assert.match(wrapper,/verifiedVatSummaryTotal=mantzilasInvoice\?recoverVatSummaryInvoiceTotal\(azureRawText\):0/);
  assert.match(wrapper,/ΠΟΤΕ μην επιλέξεις ΠΡΟΗΓΟΥΜΕΝΟ ΥΠΟΛΟΙΠΟ, ΝΕΟ ΥΠΟΛΟΙΠΟ/);
});

test("MANTZILAS rechecks Azure candidate rows against the corrected total and recovers its existing draft first",()=>{
  assert.match(wrapper,/azureCandidateProductLines=Array\.isArray\(parsed\.productLines\)\?parsed\.productLines:\[\]/);
  assert.match(wrapper,/providerLines=Array\.isArray\(parsed\.productLines\)&&parsed\.productLines\.length\?parsed\.productLines:azureCandidateProductLines/);
  assert.match(wrapper,/productLines=reconciledFastProductLines\(providerLines,totalGross\)/);
  assert.match(aiRecheck,/preferCentralMantzilas=supplierTaxId===MANTZILAS_TAX_ID/);
  assert.match(aiRecheck,/\(preferCentralStefanidis\|\|preferCentralMantzilas\)&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/);
  assert.match(aiRecheck,/if\(preferCentralMantzilas\)parsed\.mantzilasCentralFastPath=true/);
  assert.match(aiRecheck,/const mantzilasRequiresCompleteReverification=mantzilasInvoice/);
  assert.match(aiRecheck,/Math\.abs\(lineGrossTotal\(parsed\.productLines\)-invoiceTotal\)>TOTAL_TOLERANCE/);
  assert.match(aiRecheck,/if\(mantzilasInvoice\)return currentPage&&\(mantzilasRequiresCompleteReverification\|\|!line\.sourceColumnsVerified\)/);
  const fullVerificationIndex=aiRecheck.indexOf("mantzilasRequiresCompleteReverification=mantzilasInvoice");
  assert.ok(fullVerificationIndex>=0);
  assert.ok(aiRecheck.indexOf("for(const [pageIndex,page] of pageJobs.entries())",fullVerificationIndex)>fullVerificationIndex);
});

test("MANTZILAS uses one complete verifier instead of stacking redundant provider passes",()=>{
  assert.match(aiRecheck,/const mantzilasSingleVerifierPath=preferCentralMantzilas&&parsed\.mantzilasCentralFastPath===true/);
  assert.match(aiRecheck,/const needsTablePass=!mantzilasSingleVerifierPath&&!parsed\.azureUnifiedFallback/);
  assert.match(aiRecheck,/if\(needsTablePass\|\|\(!mantzilasSingleVerifierPath&&inconsistentRows\)\)/);
  assert.match(aiRecheck,/if\(!mantzilasSingleVerifierPath&&!parsed\.azureUnifiedFallback&&needsAzureFields/);
  assert.match(aiRecheck,/reverifyAll:mantzilasInvoice,expectedGrossTotal:mantzilasInvoice&&pageJobs\.length===1\?invoiceTotal:0/);
  assert.match(discountVerifier,/export function buildCompletePrintedTableCandidate/);
  assert.match(discountVerifier,/const complete=buildCompletePrintedTableCandidate\(candidates,expectedGrossTotal,diagnostics\.vatSummary\)/);
  assert.match(discountVerifier,/ΥΠΟΧΡΕΩΤΙΚΟΣ ΕΛΕΓΧΟΣ ΠΛΗΡΟΤΗΤΑΣ/);
  assert.match(discountVerifier,/Ο προσωρινός οδηγός αθροίζει \$\{guideGross\.toFixed\(2\)\}/);
  assert.match(discountVerifier,/Το άθροισμα πρέπει να συμφωνεί με \$\{reconciliationAnchor\.toFixed\(2\)\} € εντός 0,05 €/);
  assert.match(discountVerifier,/reasoning:\{effort:'minimal'\}/);
});

test("MANTZILAS exact-total rejection records bounded diagnostics without publishing candidate rows",()=>{
  assert.match(aiRecheck,/const reconciliationDiagnostic=\{/);
  assert.match(aiRecheck,/lineCount:parsed\.productLines\.length/);
  assert.match(aiRecheck,/calculatedGross:parsed\.productLinesGrossAfterRecovery/);
  assert.match(aiRecheck,/expectedGross:invoiceTotal/);
  assert.match(aiRecheck,/discountProviderFailures:Number\(discountDiagnostics\.providerFailures\|\|0\)/);
  assert.match(aiRecheck,/failureStage=`invoice-total-reconciliation;lines=\$\{reconciliationDiagnostic\.lineCount\}/);
  assert.match(aiRecheck,/posAiDiagnostics:\{\.\.\.reconciliationDiagnostic,recordedAt:new Date\(\)\.toISOString\(\)\}/);
  assert.doesNotMatch(aiRecheck,/posAiDiagnostics:\{[^}]*productLines/);
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

test("operator-facing FAST fallback reads only payment header fields and leaves products to the background",()=>{
  const start=wrapper.indexOf('const fastHeaderSchema=');
  const end=wrapper.indexOf('const reconciledFastProductLines=',start);
  const schema=wrapper.slice(start,end);
  const promptStart=wrapper.indexOf('const prompt=`Είσαι FAST');
  const promptEnd=wrapper.indexOf('`;\n    let parsed;',promptStart);
  const prompt=wrapper.slice(promptStart,promptEnd);
  assert.match(schema,/required:\["confidence","supplierName","supplierTaxId","documentNumber","documentDate","totalGross"\]/);
  assert.doesNotMatch(schema,/productLines|fastProductLineProperties/);
  assert.doesNotMatch(prompt,/στο productLines|ΟΛΕΣ τις πραγματικές γραμμές/);
  assert.match(wrapper,/if\(!sourceLines\)\{operationStage="ai-recheck"/);
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
  assert.match(background,/const verifiedProductLines=verifiedPrintedTableForPersistence/);
  assert.match(background,/const productLines=verifiedProductLines\|\|finalizeV244ProductLines/);
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
  assert.match(aiRecheck,/FULL_OCR_PROVIDER_TIMEOUT_MS=70000/);
  assert.match(aiRecheck,/signal:AbortSignal\.timeout\(FULL_OCR_PROVIDER_TIMEOUT_MS\)/);
  assert.match(aiRecheck,/CENTRAL_AZURE_PAGE_TIMEOUT_MS=25000/);
  assert.match(aiRecheck,/callAzure\(\{contentData:page\.contentData,mimeType:page\.mimeType,timeoutMs:CENTRAL_AZURE_PAGE_TIMEOUT_MS\}\)/);
  assert.match(wrapper,/aborted due to timeout\|TimeoutError/);
  assert.match(aiRecheck,/verifyInvoiceDiscounts\(\{contentData:page\.contentData,[^}]*timeoutMs:FULL_OCR_PROVIDER_TIMEOUT_MS/s);
  assert.match(aiRecheck,/reverifyAll:mantzilasInvoice,expectedGrossTotal:mantzilasInvoice&&pageJobs\.length===1\?invoiceTotal:0/);
  assert.match(aiRecheck,/"AI_PRINTED_ROW_FULL_MATH_VERIFIED","SIBLING_PRICE_DISCOUNT_SCALE_VERIFIED"/);
  assert.match(aiRecheck,/includes\(line\.quantitySource\)\?line:recoverMantzilasEconomics\(line\)/);
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
  assert.match(client,/δημιουργήθηκε πρόχειρο με \$\{lineCount\} γραμμές, αλλά ο οικονομικός έλεγχος έχει διαφορά/);
  assert.match(client,/Δεν θεωρείται ολοκληρωμένο/);
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
  assert.match(aiRecheck,/const needsTablePass=!mantzilasSingleVerifierPath&&!parsed\.azureUnifiedFallback&&\(parsed\.productLines\.length===0\|\|allNumericMissing\|\|partialNumericMissing\|\|totalMismatch\)/);
  assert.match(aiRecheck,/if\(needsTablePass\|\|\(!mantzilasSingleVerifierPath&&inconsistentRows\)\)/);
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
  assert.match(aiRecheck,/if\(!mantzilasSingleVerifierPath&&!parsed\.azureUnifiedFallback&&needsAzureFields/);
  assert.match(aiRecheck,/catch\{discountDiagnostics\.providerFailures=/);
});

test("multipage invoice recovery also uses Azure to fill missing VAT",()=>{
  assert.match(aiRecheck,/import \{callAzure,normalizeAzure\} from ".\/commerce-azure-invoice-reader\.js"/);
  assert.match(aiRecheck,/const hasSafeLine=parsed\.productLines\.some/);
  assert.match(aiRecheck,/needsAzureFields=!hasSafeLine\|\|totalMismatch\|\|inconsistentRows\|\|parsed\.productLines\.some\(line=>Number\(line\?\.vatRate\|\|0\)<=0\)/);
  assert.match(aiRecheck,/if\(!mantzilasSingleVerifierPath&&!parsed\.azureUnifiedFallback&&needsAzureFields&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_KEY\)/);
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
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[{index:1,supplierCode:"00009",printedQuantity:1,printedUnit:"KIB",originalUnitPrice:19.55,initialAmount:19.55,discountPercent1:31,discountAmount1:6.06,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:13.49,exciseTotal:0,taxableAmount:13.49,vatRate:13,vatAmount:1.75,grossAmount:15.24,confidence:99,evidence:"1 × 19,55 - 6,06 = 13,49"}],vatSummary:[{rate:24,taxable:145.2,vat:34.85,gross:180.05},{rate:13,taxable:220.55,vat:28.67,gross:249.22}]})})});
  try{
    const productLines=[{code:"00009",description:"COCA COLA ZERO 0,33LT x24pack ΚΟΥΤΙ",rawText:"00009 COCA COLA ZERO",quantity:2,invoiceQuantity:2,unit:"PACKAGE",invoiceUnit:"PACKAGE",unitCost:19.55,netAmount:13.49,discount1:65.5,discount1Amount:25.61,discount2:0,discount2Amount:0,discount3:0,discount3Amount:0}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true});
    assert.equal(productLines[0].quantity,1);assert.equal(productLines[0].invoiceQuantity,1);assert.equal(productLines[0].unitCost,19.55);
    assert.equal(productLines[0].discount1,31);assert.equal(productLines[0].discount1Amount,6.06);assert.equal(productLines[0].netAmount,13.49);
    assert.equal(productLines[0].vatRate,13);assert.equal(productLines[0].grossAmount,15.24);assert.equal(productLines[0].sourceColumnsVerified,true);
    assert.deepEqual(result.vatSummary,[{rate:24,taxable:145.2,vat:34.85,gross:180.05},{rate:13,taxable:220.55,vat:28.67,gross:249.22}]);
  }finally{global.fetch=originalFetch}
});

test("MANTZILAS focused reread preserves a printed zero-discount row and rejects an incomplete invented discount",async()=>{
  const originalFetch=global.fetch;
  let call=0;
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[call++===0
    ?{index:1,supplierCode:"11",printedQuantity:48,printedUnit:"TEM",originalUnitPrice:.95,initialAmount:45.6,discountPercent1:0,discountAmount1:0,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:45.6,exciseTotal:0,taxableAmount:45.6,vatRate:13,vatAmount:5.93,grossAmount:51.53,confidence:99,evidence:"48 × 0,95 = 45,60"}
    :{index:1,supplierCode:"11",printedQuantity:48,printedUnit:"TEM",originalUnitPrice:.95,initialAmount:45.6,discountPercent1:45.6,discountAmount1:0,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:11.03,exciseTotal:0,taxableAmount:11.03,vatRate:24,vatAmount:2.65,grossAmount:13.68,confidence:99,evidence:"invented"}],vatSummary:[]})})});
  try{
    const valid=[{code:"11",description:"RED BULL 0,25LT ΚΟΥΤΙ",quantity:48,unitCost:1,netAmount:11.03,discount1:45.6,discount1Amount:36.97}];
    await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines:valid,apiKey:"test",model:"test",reverifyAll:true});
    assert.equal(valid[0].quantity,48);assert.equal(valid[0].unitCost,.95);assert.equal(valid[0].discount1,0);assert.equal(valid[0].netAmount,45.6);assert.equal(valid[0].vatRate,13);
    const invalid=[{code:"11",description:"RED BULL 0,25LT ΚΟΥΤΙ",quantity:48,unitCost:.95,netAmount:45.6,discount1:0,discount1Amount:0}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines:invalid,apiKey:"test",model:"test",reverifyAll:true});
    assert.equal(invalid[0].netAmount,45.6);assert.equal(invalid[0].discount1,0);assert.equal(result.rejectedMath,1);
  }finally{global.fetch=originalFetch}
});

test("MANTZILAS focused reread rolls back a fully consistent batch that misses the printed invoice total",async()=>{
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[{index:1,supplierCode:"00009",printedQuantity:2,printedUnit:"KIB",originalUnitPrice:19.55,initialAmount:39.1,discountPercent1:65.5,discountAmount1:25.61,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:13.49,exciseTotal:0,taxableAmount:13.49,vatRate:13,vatAmount:1.75,grossAmount:15.24,confidence:99,evidence:"self-consistent but wrong"}],vatSummary:[]})})});
  try{
    const productLines=[{code:"00009",description:"COCA COLA ZERO",quantity:1,unitCost:19.55,netAmount:13.49,grossAmount:15.24,discount1:31,discount1Amount:6.06}];
    const before=JSON.parse(JSON.stringify(productLines));
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true,expectedGrossTotal:429.27});
    for(const key of ["quantity","unitCost","netAmount","grossAmount","discount1","discount1Amount"]){assert.equal(productLines[0][key],before[0][key])}
    assert.equal(result.status,"FAILED");assert.equal(result.reason,"PRINTED_ROWS_TOTAL_MISMATCH");
  }finally{global.fetch=originalFetch}
});

test("MANTZILAS focused reread rejects a candidate assigned to the wrong supplier code",async()=>{
  const originalFetch=global.fetch;
  const candidate=(index,supplierCode,gross)=>({index,supplierCode,printedQuantity:1,printedUnit:"TEM",originalUnitPrice:gross/1.13,initialAmount:gross/1.13,discountPercent1:0,discountAmount1:0,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:gross/1.13,exciseTotal:0,taxableAmount:gross/1.13,vatRate:13,vatAmount:gross-gross/1.13,grossAmount:gross,confidence:99,evidence:"row"});
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[candidate(1,"B",11.3),candidate(2,"B",22.6)],vatSummary:[]})})});
  try{
    const productLines=[{code:"A",quantity:1,unitCost:10,netAmount:10,grossAmount:11.3},{code:"B",quantity:1,unitCost:20,netAmount:20,grossAmount:22.6}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true,expectedGrossTotal:33.9});
    assert.equal(result.status,"FAILED");assert.equal(result.reason,"PRINTED_ROWS_INCOMPLETE");assert.equal(result.aiAccepted,0);
    assert.equal(productLines[0].code,"A");assert.equal(productLines[1].code,"B");
  }finally{global.fetch=originalFetch}
});

test("MANTZILAS focused reread replaces a wrong first-pass row when code, math and invoice total agree",async()=>{
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[{index:1,supplierCode:"0168",printedQuantity:3,printedUnit:"4PK",originalUnitPrice:3.2,initialAmount:9.6,discountPercent1:0,discountAmount1:0,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:9.6,exciseTotal:0,taxableAmount:9.6,vatRate:24,vatAmount:2.3,grossAmount:11.9,confidence:99,evidence:"3 × 3,20 = 9,60"}],vatSummary:[]})})});
  try{
    const productLines=[{code:"0168",quantity:1,unitCost:3.2,netAmount:3.2,taxableAmount:3.2,vatRate:24,vatAmount:.77,grossAmount:3.97,sourceColumnsVerified:true}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true,expectedGrossTotal:11.9});
    assert.equal(result.status,"OK");assert.equal(result.aiAccepted,1);
    assert.equal(productLines[0].quantity,3);assert.equal(productLines[0].netAmount,9.6);assert.equal(productLines[0].grossAmount,11.9);
  }finally{global.fetch=originalFetch}
});

test("MANTZILAS row identity accepts omitted display-leading zeroes without weakening index matching",async()=>{
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[{index:1,supplierCode:"168",printedQuantity:3,printedUnit:"4PK",originalUnitPrice:3.2,initialAmount:9.6,discountPercent1:0,discountAmount1:0,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:9.6,exciseTotal:0,taxableAmount:9.6,vatRate:24,vatAmount:2.3,grossAmount:11.9,confidence:99,evidence:"0168 printed row"}],vatSummary:[]})})});
  try{
    const productLines=[{code:"0168",quantity:1,unitCost:3.2,netAmount:3.2,grossAmount:3.97}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true,expectedGrossTotal:11.9});
    assert.equal(result.status,"OK");assert.equal(result.aiAccepted,1);assert.equal(productLines[0].quantity,3);assert.equal(productLines[0].netAmount,9.6);
  }finally{global.fetch=originalFetch}
});

test("MANTZILAS resolves doubled-quantity equivalent-discount ambiguity from same-price sibling",async()=>{
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[
    {index:1,supplierCode:"00160",printedQuantity:48,printedUnit:"ΤΜΧ",originalUnitPrice:.814583,initialAmount:39.10,discountPercent1:31,discountAmount1:12.12,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:26.98,exciseTotal:0,taxableAmount:26.98,vatRate:13,vatAmount:3.51,grossAmount:30.49,confidence:99,evidence:"printed row"},
    {index:2,supplierCode:"00009",printedQuantity:48,printedUnit:"ΤΜΧ",originalUnitPrice:.814583,initialAmount:39.10,discountPercent1:65.5,discountAmount1:25.61,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:13.49,exciseTotal:0,taxableAmount:13.49,vatRate:13,vatAmount:1.75,grossAmount:15.24,confidence:99,evidence:"ambiguous printed row"}
  ],vatSummary:[]})})});
  try{
    const productLines=[{code:"00160",description:"COCA COLA",grossAmount:30.49},{code:"00009",description:"COCA COLA ZERO",grossAmount:15.24}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true,expectedGrossTotal:45.73});
    assert.equal(result.status,"OK");
    assert.equal(result.scaledQuantityAmbiguitiesRepaired,1);
    assert.equal(productLines[1].quantity,24);
    assert.equal(productLines[1].discount1,31);
    assert.equal(productLines[1].netAmount,13.49);
    assert.equal(productLines[1].grossAmount,15.24);
  }finally{global.fetch=originalFetch}
});

test("MANTZILAS code 00009 resolves its x24 equivalent scale without a matching sibling",async()=>{
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[
    {index:1,supplierCode:"00009",printedQuantity:2,printedUnit:"KIB",originalUnitPrice:19.55,initialAmount:39.10,discountPercent1:65.5,discountAmount1:25.61,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:13.49,exciseTotal:0,taxableAmount:13.49,vatRate:13,vatAmount:1.75,grossAmount:15.24,confidence:99,evidence:"ambiguous printed row"}
  ],vatSummary:[]})})});
  try{
    const productLines=[{code:"00009",description:"COCA COLA ZERO 0,33LT x24pack",grossAmount:15.24}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true,expectedGrossTotal:15.24,supplierRule:"MANTZILAS"});
    assert.equal(result.status,"OK");
    assert.equal(result.mantzilasCode00009AmbiguitiesRepaired,1);
    assert.equal(productLines[0].quantity,1);
    assert.equal(productLines[0].invoiceQuantity,1);
    assert.equal(productLines[0].discount1,31);
    assert.equal(productLines[0].netAmount,13.49);
    assert.equal(productLines[0].grossAmount,15.24);
    assert.equal(productLines[0].quantitySource,"MANTZILAS_CODE_00009_PACK24_SCALE_VERIFIED");
  }finally{global.fetch=originalFetch}
});

test("code 00009 pack arithmetic is not changed outside the MANTZILAS supplier rule",async()=>{
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({discounts:[
    {index:1,supplierCode:"00009",printedQuantity:2,printedUnit:"KIB",originalUnitPrice:19.55,initialAmount:39.10,discountPercent1:65.5,discountAmount1:25.61,discountPercent2:0,discountAmount2:0,discountPercent3:0,discountAmount3:0,netAmount:13.49,exciseTotal:0,taxableAmount:13.49,vatRate:13,vatAmount:1.75,grossAmount:15.24,confidence:99,evidence:"another supplier"}
  ],vatSummary:[]})})});
  try{
    const productLines=[{code:"00009",description:"COCA COLA ZERO 0,33LT x24pack",grossAmount:15.24}];
    const result=await verifyInvoiceDiscounts({contentData:"data:image/jpeg;base64,AA==",mimeType:"image/jpeg",productLines,apiKey:"test",model:"test",reverifyAll:true,expectedGrossTotal:15.24});
    assert.equal(result.status,"OK");
    assert.equal(result.mantzilasCode00009AmbiguitiesRepaired,undefined);
    assert.equal(productLines[0].quantity,2);
    assert.equal(productLines[0].discount1,65.5);
  }finally{global.fetch=originalFetch}
});

test("MANTZILAS full reread cannot publish a table outside cent-level invoice tolerance",()=>{
  assert.match(aiRecheck,/mantzilasInvoice&&pageJobs\.length===1&&invoiceTotal>0&&Math\.abs\(parsed\.productLinesTotalDifference\)>0\.05/);
  assert.match(aiRecheck,/Οι λανθασμένες γραμμές δεν αποθηκεύτηκαν/);
  assert.ok(aiRecheck.indexOf("productLinesTotalDifference)>0.05")<aiRecheck.indexOf('failureStage="save-ai-result"'));
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
