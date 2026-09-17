# POS background durable-claim race — 2026-09-17

## LAB evidence

- Status: **LAB FAIL**.
- Exact production revision: `d7b471da2ff5ca1d9429a563b8dfb60ea8468646`.
- Fresh MANTZILAS invoice `12674` was submitted exactly once from the POS front. The payment/credit and empty draft were preserved.
- The operator-facing job failed with `POS_BACKGROUND_AI_RECHECK: Η εσωτερική εργασία POS δεν είναι πλέον ενεργή.`
- This failure occurred before a product table could be accepted. It is a background lifecycle failure, not proof that the printed rows, discounts or `12 TMX` conversion are correct.

## Root cause and bounded change

- The server worker first claims the durable row as `POS_PROCESSING`, then calls the scoped internal AI endpoint.
- POS status/recovery polling can concurrently observe and schedule the same valid handoff while its durable row is still `POS_QUEUED` or `POS_DRAFT_READY`.
- The signed background middleware previously accepted only `POS_PROCESSING`, `POS_REPROCESSING` and `AI_COMPLETE`, so it could reject its own exact bound job during that transition.
- Accept `POS_QUEUED` and `POS_DRAFT_READY` as active phases only after the existing signed capability has matched the exact tenant, store, job, route, method, request body and bound handoff.
- Keep terminal `POS_FAILED`, `AWAITING_APPROVAL` and `CONFIRMED` states rejected. No general browser or external authentication rule changes.

## Protected behavior

- Preserve the one existing settlement, attachment and draft. Do not resubmit invoice `12674` merely to recover this failed attempt.
- Do not approve, finalize, post stock, or change fiscal/accounting state during diagnosis or LAB verification.
- Preserve MANTZILAS complete-row reconciliation, printed discount/economics checks, code `00009`, CORONA `02410` and explicit `12 TMX` packaging behavior.
- BackOffice refresh is not acceptance. CI PASS is not LAB PASS.

## Local verification

- Focused POS background regression: `32/32` PASS.
- Full server suite: `1303/1303` PASS.
- Client production build: PASS.
- Server/Prisma build: PASS.
- `git diff --check`: PASS.

## Required acceptance

- Green GitHub CI, merge and verification of the exact deployed Render revision.
- One fresh MANTZILAS invoice submitted once from the POS front after deploy, without BackOffice refresh.
- The job must pass the internal background lifecycle, produce all physical rows, reconcile printed discounts/economics and the confirmed invoice total, and leave the draft unapproved with no stock posting.
