import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
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

test("camera preview attaches and plays the acquired stream before capture",()=>{
  assert.match(client,/useEffect\(\(\)=>\{if\(!cameraOpen\|\|!stream\|\|!videoRef\.current\)return/);
  assert.match(client,/video\.srcObject=stream/);
  assert.match(client,/video\.play\(\)\.catch/);
  assert.match(client,/facingMode:\{ideal:"environment"\}/);
  assert.match(client,/Η προεπισκόπηση κάμερας δεν είναι ακόμη έτοιμη/);
});

test("multipage OCR sends all ordered pages through one invoice analysis",()=>{
  const background=client.slice(client.indexOf("async function backgroundV244"),client.indexOf("export default function"));
  assert.match(background,/for\(const \[pageIndex,page\] of pages\.entries\(\)\)/);
  assert.match(background,/ai-recheck.*additionalPageJobIds:pageJobs\.slice\(1\)/s);
  assert.match(background,/const combinedLines=finalizeV244ProductLines/);
  assert.match(background,/productLines:combinedLines/);
  assert.match(background,/additionalPageJobIds:pageJobs\.slice\(1\)/);
  assert.match(aiRecheck,/const fileParts=pageJobs\.map/);
  assert.match(aiRecheck,/content:\[\{type:"input_text",text:prompt\},\.\.\.fileParts\]/);
  assert.match(aiRecheck,/πρώτα από τη σελίδα 1, μετά από τη σελίδα 2/);
  assert.match(azure,/additionalPageJobIds.*return next\(\)/s);
});

test("a multipage invoice is blocked rather than saved empty when no product lines are found",()=>{
  const background=client.slice(client.indexOf("async function backgroundV244"),client.indexOf("export default function"));
  assert.match(background,/if\(!combinedLines\.length\)throw new Error/);
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
  assert.match(client,/created\?\.reconciliationRequired/);
  assert.match(client,/Η πληρωμή έχει ήδη επαναχρησιμοποιηθεί/);
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
});


test("empty initial invoice extraction triggers the table recovery pass",()=>{
  assert.match(aiRecheck,/const needsTablePass=parsed\.productLines\.length===0\|\|allNumericMissing\|\|partialNumericMissing\|\|totalMismatch/);
  assert.match(aiRecheck,/if\(needsTablePass\)/);
  assert.match(aiRecheck,/const recovered=Array\.isArray\(tableParsed\.productLines\)/);
});


test("multipage invoice recovery also uses Azure to fill missing VAT",()=>{
  assert.match(aiRecheck,/import \{callAzure,normalizeAzure\} from ".\/commerce-azure-invoice-reader\.js"/);
  assert.match(aiRecheck,/const hasSafeLine=parsed\.productLines\.some/);
  assert.match(aiRecheck,/needsAzureFields=!hasSafeLine\|\|parsed\.productLines\.some\(line=>Number\(line\?\.vatRate\|\|0\)<=0\)/);
  assert.match(aiRecheck,/if\(needsAzureFields&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_KEY\)/);
  assert.match(aiRecheck,/for\(const page of pageJobs\)/);
  assert.match(aiRecheck,/azureRecovered\.push\(\.\.\.\(Array\.isArray\(azure\?\.productLines\)/);
  assert.match(aiRecheck,/parsed\.productLines=mergeRecoveredLines\(parsed\.productLines,azureRecovered\)/);
});

test("Azure-derived net unit cost does not hide invoice discounts",async()=>{
  const verifier=await readFile(new URL("../src/lib/invoice-discount-verifier.js",import.meta.url),"utf8");
  assert.match(azure,/azureUnitCostDerivedFromNet=true/);
  assert.match(azure,/azureUnitCostDerivedFromNet,azureSequence/);
  assert.match(verifier,/Number\(line\.unitCost\|\|0\)>0&&!line\.azureUnitCostDerivedFromNet/);
  assert.match(verifier,/originalUnitPrice/);
  assert.match(verifier,/validationLine=originalUnitPrice>0/);
  assert.match(verifier,/line\.unitCost=originalUnitPrice/);
});

test("main AI extraction carries original prices, discount pairs, and verifies line arithmetic",async()=>{
  const verifier=await readFile(new URL("../src/lib/invoice-discount-verifier.js",import.meta.url),"utf8");
  assert.match(aiRecheck,/discount1Amount:\{type:"number"/);
  assert.match(aiRecheck,/Τιμή ΤΜΧ ΠΡΙΝ ΑΠΟ ΕΚΠΤΩΣΕΙΣ=unitCost/);
  assert.match(aiRecheck,/import \{verifyInvoiceDiscounts\}/);
  assert.match(aiRecheck,/Math\.abs\(q\*u-net\)>Math\.max\(0\.05,net\*0\.02\)/);
  assert.match(verifier,/qty × original price - discounts reproduces net/);
  assert.match(verifier,/line\.discount1Amount=0/);
  assert.match(verifier,/applyValidatedPairs\(line,validated\)/);
  assert.match(v244Client,/structuredVerified=String\(line\?\.discountSource/);
});
