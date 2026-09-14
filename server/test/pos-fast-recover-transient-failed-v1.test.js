import test from "node:test";
import assert from "node:assert/strict";
import {patchTransientPosFailedRecovery} from "../src/patch-gate3-transient-pos-failed-recovery.js";

const fixture=`
const isRetryableBackgroundError=error=>/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(String(error?.message||error));
const rows=await prisma.$queryRaw\`
  SELECT "id","storeId","status","resultJson"
  FROM "AiReaderJob"
  WHERE "companyId"=\${req.user.companyId}
    AND ("status" IN ('POS_QUEUED','POS_DRAFT_READY') OR ("status"='POS_PROCESSING' AND "updatedAt"<\${staleBefore}))
  ORDER BY "updatedAt" ASC LIMIT 3\`;
for(const job of rows){
  const handoff=job.resultJson?.posHandoff&&typeof job.resultJson.posHandoff==="object"?job.resultJson.posHandoff:null;
  if(!handoff||!Array.isArray(handoff.pageJobIds)||!handoff.pageJobIds.length)continue;
  await prisma.$executeRaw\`UPDATE "AiReaderJob" SET "stage"='POS_RECOVERING',"status"='POS_QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=\${job.id} AND "companyId"=\${req.user.companyId} AND "status" IN ('POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING')\`;
}
`;

test("transient POS_FAILED jobs become eligible for durable recovery",()=>{
  const patched=patchTransientPosFailedRecovery(fixture);
  assert.match(patched,/"status" IN \('POS_QUEUED','POS_DRAFT_READY','POS_FAILED'\)/);
  assert.match(patched,/storedBackgroundError=String\(job\.resultJson\?\.posBackground\?\.error\|\|""\)/);
  assert.match(patched,/job\.status==="POS_FAILED"&&!isRetryableBackgroundError\(storedBackgroundError\)/);
  assert.match(patched,/"status" IN \('POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED'\)/);
});

test("recovery patch is idempotent",()=>{
  const once=patchTransientPosFailedRecovery(fixture);
  assert.equal(patchTransientPosFailedRecovery(once),once);
});

test("non-transient failed jobs remain excluded by the generated guard",()=>{
  const patched=patchTransientPosFailedRecovery(fixture);
  const isRetryableBackgroundError=error=>/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(String(error?.message||error));
  assert.equal(isRetryableBackgroundError("fetch failed"),true);
  assert.equal(isRetryableBackgroundError("ECONNRESET while reading invoice"),true);
  assert.equal(isRetryableBackgroundError("Δεν βρέθηκαν ασφαλείς γραμμές προϊόντων στο τιμολόγιο."),false);
  assert.equal(isRetryableBackgroundError("Δεν βρέθηκε ενεργή πληρωμή που συμφωνεί με το τιμολόγιο."),false);
  assert.match(patched,/if\(job\.status==="POS_FAILED"&&!isRetryableBackgroundError\(storedBackgroundError\)\)continue/);
});
