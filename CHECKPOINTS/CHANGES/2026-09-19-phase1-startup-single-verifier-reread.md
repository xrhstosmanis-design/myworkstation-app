# Phase 1 startup single-verifier reread — 2026-09-19

## LAB evidence

- Invoice `12674` finished on the previous production revision only after more than six minutes.
- It produced `12` rows and `430.29 EUR` instead of the printed `366.47 EUR`, a `63.82 EUR` mismatch.
- The draft remains unapproved, but its AI job is terminal `AWAITING_APPROVAL`; POS polling stopped after completion.

## Bounded correction

- Advance the MANTZILAS reread strategy to `MANTZILAS_SINGLE_COMPLETE_VERIFIER_V13`.
- During server startup, select at most three jobs that are all of the following: updated in the last 48 hours, MANTZILAS, completed with `reconciliationRequired=true`, linked to an unapproved `POS_OCR_DRAFT`, and not already attempted under V13.
- Atomically mark each selected job `POS_REPROCESSING`, preserve its durable handoff with stored-line reuse disabled, and queue the existing durable task.
- The deployed single-verifier route then rereads the original image once and replaces only the same draft lines if the result is safely better.

## Safety boundaries

- No operator refresh or second POS submission is required.
- Reuse the original attachment, supplier, invoice identity, payment/credit identity, AI job, purchase document and purchase order.
- No duplicate payment, credit, job or draft; no approval, finalization, stock movement, fiscal command, accounting entry or myDATA mutation.
- Approved, non-POS, non-MANTZILAS, old, already-V13 and reconciled drafts are excluded.

## Acceptance

- Focused startup/reread regressions `20/20`, complete server suite `1310/1310`, production build, syntax and diff checks: **PASS**.
- Require green CI, merge and exact deployed revision.
- Automatic recovery of existing `12674` is diagnostic only.
- Phase 1 remains **AWAITING LAB** until a future new invoice succeeds correctly from one POS-front submission.
