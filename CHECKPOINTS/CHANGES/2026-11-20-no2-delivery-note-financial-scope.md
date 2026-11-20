# Νο02 — Standalone zero-value delivery-note financial scope / BEFORE SOURCE

20/11/2026 Europe/Athens. Same retained No02 owner /root, branch fix/no2-delivery-note-financial-scope-20261120. This follows the owner's existing requirement that monthly pending indicators represent real obligations. Provider acquisition, No04 reader/core and #4048 bulk/scheduler retain their separate scope. Overall No02 remains OPEN.

## Confirmed read-only classification gap

An existing myDATA source with invoice type 9.3 and zero gross value is a delivery note. The current monthly inbound type mapping leaves it unclassified, and the payment observer classifies a non-INVOICE source as REVIEW_REQUIRED. This can inflate payment-review and all-clear indicators even though no financial amount is due. The observed problem is a payment-review classification, not a proven increment of the financialPending amount counter. Private source identifiers and original documents remain outside this public claim.

## Bounded source scope after claim merge

Read the current monthly source grouping, payment observation and UI paths first. Add an explicit financial NOT_APPLICABLE classification only for a positively recognized standalone myDATA 9.3 delivery note with exactly zero gross value and no invoice/payment linkage or conflicting evidence. Display the corresponding delivery-note/nonfinancial label in the monthly UI. Preserve unknown document types, zero-valued invoice records, positive-value delivery-note records and any conflicting invoice/payment link as review cases. Existing credit-note, payment proof, partial/overpayment, grouping and store/company rules remain authoritative.

Limit implementation to the monthly read-only classification/projection and its UI labels with focused regressions. No source record correction, original rewriting, invoice/payment/stock/fiscal/finalization writer, automatic payment, source recovery or No04 ownership transfer. No changes to already merged provider source #4076/#4078 or the running normal CI/deployment gates.

## Current evidence and acceptance

Current status is read-only classification finding confirmed; source correction NOT STARTED / NOT TESTED. Require this documentation claim to pass CI and merge before edits. Tests must cover exact 9.3 zero/standalone exclusion from financial/payment-review indicators, unknown type and zero INVOICE review, positive value and conflicting invoice/payment links retained in review, unchanged credits/payments, correct selected-store label and source immutability. Require focused regressions/build, full exact source/main CI and normal guarded deployment. The grouped final hosted monthly acceptance remains OPEN and reuses existing authorized records without creating financial transactions.
