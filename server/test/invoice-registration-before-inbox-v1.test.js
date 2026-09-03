import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
const intake=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
const review=await readFile(new URL("../src/routes/commerce-invoice-draft-approval.js",import.meta.url),"utf8");

test("POS recognizes and registers the invoice before archiving it",()=>{
  const background=client.slice(client.indexOf("async function backgroundV244"),client.indexOf("export default function"));
  assert.doesNotMatch(background,/documents\/inbox/);
  assert.ok(background.indexOf("/ai-reader/jobs")<background.indexOf("/pos-intake"));
  assert.match(background,/Καταχώριση τιμολογίου στο BackOffice και κατόπιν αρχειοθέτηση/);

  const documentWrite=intake.indexOf('INSERT INTO "PurchaseDocument"');
  const orderWrite=intake.indexOf('INSERT INTO "PurchaseOrder"');
  const inboxWrite=intake.indexOf('INSERT INTO "DocumentInbox"');
  assert.ok(documentWrite>=0&&orderWrite>documentWrite&&inboxWrite>orderWrite,"archive must be written only after invoice and purchase order");
});

test("archive reuses the AI attachment and records invoice-payment linkage",()=>{
  assert.match(intake,/"attachmentId"/);
  assert.match(intake,/"attachmentId"=\$\{job\.attachmentId\}/);
  assert.match(intake,/Πληρωμή \$\{paymentTransactionId\}/);
  assert.match(intake,/inboxId:result\.inboxId,archived:Boolean\(result\.inboxId\)/);
  assert.doesNotMatch(intake,/archive-after-registration[\s\S]{0,1800}INSERT INTO "DocumentAttachment"/);
});

test("manual AI confirmation follows the same post-registration archive order",()=>{
  const documentWrite=review.indexOf('INSERT INTO "PurchaseDocument"',review.indexOf('router.post("/ai-reader/jobs/:jobId/confirm"'));
  const inboxWrite=review.indexOf('INSERT INTO "DocumentInbox"',documentWrite);
  assert.ok(documentWrite>=0&&inboxWrite>documentWrite);
  assert.match(review,/existingInbox[\s\S]*UPDATE "DocumentInbox"[\s\S]*else await tx\.\$executeRaw`INSERT INTO "DocumentInbox"/);
});
