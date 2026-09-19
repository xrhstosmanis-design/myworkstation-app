# Fresh Snack safe stored replay verification — 2026-09-19

## Purpose

Verify the already uploaded Fresh Snack invoice `36-ΤΔΑ 005401` using its durable source, rather than deleting or uploading it a second time.

## Scope

- Only recent `POS_FAILED` jobs with a `FRESH_SNACK_COMPLETE_PRINTED_TABLE` or `FRESH_DELICACIES_COMPLETE_PRINTED_TABLE` profile, the precise pre-fix unverified-printed-lines error, an existing POS OCR draft and no prior V16 replay attempt are eligible.
- The worker reuses the same job, attachment, handoff and draft with `replaceExistingDraft: true`.
- Replacing lines remains fail-closed on complete printed-table verification. No approval, payment, stock, fiscal, accounting, myDATA or credit mutation is allowed.

## Expected Fresh Snack evidence

For `36-ΤΔΑ 005401`, the re-read must produce five physical rows and reconcile to `47.67 EUR` net, `6.20 EUR` VAT and `53.87 EUR` gross before it can be treated as a successful draft.
