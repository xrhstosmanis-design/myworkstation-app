import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const retryable=error=>/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|AZURE_TIMEOUT|aborted due to timeout|TimeoutError|Η ενιαία ανάγνωση απέτυχε και δεν ανακτήθηκαν με ασφάλεια όλες οι σελίδες/i.test(String(error?.message||error));

test("transient POS_FAILED jobs become eligible for durable recovery",()=>{
  assert.match(source,/"status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_FAILED','AI_COMPLETE'\)/);
  assert.match(source,/job\.status==="POS_FAILED"&&!needsFailedRereadAdvance&&!needsCompleteTableReplayRecovery&&!isRetryableBackgroundError\(storedBackgroundError\)/);
  assert.doesNotMatch(source,/"resultJson"->'posBackground'->>'error'.*~\*/);
  assert.match(source,/if\(recovered\.length>=3\)break/);
  assert.match(source,/"status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED','AI_COMPLETE'\)/);
});

test("fast-status reclaims only retryable POS_FAILED jobs",()=>{
  assert.match(source,/retryableFailed=job\.status==="POS_FAILED"&&isRetryableBackgroundError\(storedBackgroundError\)/);
  assert.match(source,/hasRecoverableHandoff&&retryableFailed/);
  assert.match(source,/"status"='POS_FAILED'/);
  assert.match(source,/retryClaimed=Boolean\(reclaimed\);shouldSchedule=retryClaimed/);
  assert.match(source,/failed:job\.status==="POS_FAILED"&&!retryClaimed/);
});

test("non-transient failed jobs remain excluded",()=>{
  assert.equal(retryable("fetch failed"),true);
  assert.equal(retryable("ECONNRESET while reading invoice"),true);
  assert.equal(retryable("The operation was aborted due to timeout"),true);
  assert.equal(retryable("TimeoutError"),true);
  assert.equal(retryable("AZURE_TIMEOUT"),true);
  assert.equal(retryable("Η ενιαία ανάγνωση απέτυχε και δεν ανακτήθηκαν με ασφάλεια όλες οι σελίδες του τιμολογίου."),true);
  assert.equal(retryable("Δεν βρέθηκαν ασφαλείς γραμμές προϊόντων στο τιμολόγιο."),false);
  assert.equal(retryable("Δεν βρέθηκε ενεργή πληρωμή που συμφωνεί με το τιμολόγιο."),false);
});
