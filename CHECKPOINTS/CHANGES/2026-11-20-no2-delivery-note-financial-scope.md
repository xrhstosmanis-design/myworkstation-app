# Νο02 — Standalone zero-value delivery-note financial scope / IMPLEMENTED — AWAITING EXACT CI AND INSTALLATION

20/11/2026 Europe/Athens. Same retained No02 owner /root, branch fix/no2-delivery-note-financial-scope-20261120. This follows the owner's existing requirement that monthly pending indicators represent real obligations. Provider acquisition, No04 reader/core and #4048 bulk/scheduler retain their separate scope. Overall No02 remains OPEN.

## Confirmed read-only classification gap

An existing myDATA source with invoice type 9.3 and zero gross value is a delivery note. The current monthly inbound type mapping leaves it unclassified, and the payment observer classifies a non-INVOICE source as REVIEW_REQUIRED. This can inflate payment-review and all-clear indicators even though no financial amount is due. The observed problem is a payment-review classification, not a proven increment of the financialPending amount counter. Private source identifiers and original documents remain outside this public claim.

## Bounded source scope after claim merge

Read the current monthly source grouping, payment observation and UI paths first. Add an explicit financial NOT_APPLICABLE classification only for a positively recognized standalone myDATA 9.3 delivery note with exactly zero gross value and no invoice/payment linkage or conflicting evidence. Display the corresponding delivery-note/nonfinancial label in the monthly UI. Preserve unknown document types, zero-valued invoice records, positive-value delivery-note records and any conflicting invoice/payment link as review cases. Existing credit-note, payment proof, partial/overpayment, grouping and store/company rules remain authoritative.

Limit implementation to the monthly read-only classification/projection and its UI labels with focused regressions. No source record correction, original rewriting, invoice/payment/stock/fiscal/finalization writer, automatic payment, source recovery or No04 ownership transfer. No changes to already merged provider source #4076/#4078 or the running normal CI/deployment gates.

## Current evidence and acceptance

Current status is read-only classification finding confirmed; source correction NOT STARTED / NOT TESTED. Require this documentation claim to pass CI and merge before edits. Tests must cover exact 9.3 zero/standalone exclusion from financial/payment-review indicators, unknown type and zero INVOICE review, positive value and conflicting invoice/payment links retained in review, unchanged credits/payments, correct selected-store label and source immutability. Require focused regressions/build, full exact source/main CI and normal guarded deployment. The grouped final hosted monthly acceptance remains OPEN and reuses existing authorized records without creating financial transactions.


## Coherent ordinary monthly implementation — 20/11/2026

Before-source claim #4080 merged as 4621924396eab5e53d75490fb2f81184fcd2833f after documentation CI44696981189 passed three applicable checks, with two runtime jobs skipped by documentation classification.

The ordinary monthly projection recognizes only a strictly proven standalone myDATA 9.3 zero-value delivery note as financially NOT_APPLICABLE. Metadata must positively verify currency and source-link absence; absent, duplicate, malformed or conflicting evidence remains review. The exemption uses a neutral NON_FINANCIAL purchase basis so the same row does not inflate payment review, unposted purchase or purchase-link review counts. Only the exact obsolete unknown-type reason is removed for eligible notes; unrelated identity reasons remain visible. The detail endpoint, grouped totals and selected-store UI use the same resulting classification. The UI labels the row as a nonfinancial delivery note and opens its read-only preview without order callbacks or writes.

Unknown document types, zero INVOICE records, positive-value notes, credits and any invoice/payment/job linkage retain their existing review/proof rules. Default/D1 observation behavior is unchanged. No provider, reader/core, bulk/scheduler, invoice/payment/stock/fiscal/finalization writer or automatic payment path changes.

Root reviewed nine source/test files. Targeted backend checks passed 91 tests. The final broader local regression selection passed **135 tests / 135 PASS / 0 FAIL**, with **one explicitly excluded local Chromium case**. The first broader invocation reported 135 PASS and one Chromium failure (ECONNRESET) because a negative name filter had not excluded that local child. The corrected positive exact-name selection is the final reported local result; no local Chromium PASS is claimed. The separate native PostgreSQL attempt skipped once because no eligible local isolated database was available. Its new native case is mandatory in CI and exercises actual SQL metadata including NULL originalJobId and before/after read-only source digests. The new mounted UI test uses the actual scoped preview DTO and verifies opening/closing without purchase-order callbacks.

Production client/server build passed. Its generated server index change was restored. The two already merged provider source/test files are unchanged and excluded from this PR. Require exact source full CI including actual native PostgreSQL and Chromium, expected-head merge, exact main full CI and normal guarded deployment. Hosted application monthly acceptance remains grouped and NOT TESTED for this correction. Overall No02/#4019 remains OPEN for that acceptance and the separate external provider, bulk and reader-owner OCR residuals.
