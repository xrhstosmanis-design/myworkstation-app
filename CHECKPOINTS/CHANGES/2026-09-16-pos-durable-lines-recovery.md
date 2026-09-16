# POS durable line recovery — 2026-09-16

## LAB evidence

- A new run from the POS front for invoice `43243` reused the existing payment and created one draft, but remained at zero lines.
- The durable job moved through `POS_QUEUED / POS_RECOVERING` and failed at `POS_BACKGROUND_AI_RECHECK` because OpenAI timed out and Azure returned the known F0 quota `403`.
- This is `LAB FAIL`. No stock, approval or finalization action was performed.

## Root cause and bounded change

- The reused failed job still contained its sixteen cached product lines, but the new browser handoff supplied only the four FAST header fields and therefore persisted `resumeStoredProductLines=false`.
- The background worker ignored the durable table and unnecessarily called the unavailable providers.
- The worker now detects product lines already stored on its exact tenant-scoped durable job. A handoff without the resume flag may reuse them only when their gross total matches the operator-confirmed invoice total within `0.05 EUR`.
- Every reused durable table runs through the deterministic no-provider discount verifier before V2.4.4 finalization.

## Protected behavior and acceptance

- The existing `76.58 EUR` payment is reused and never created, changed or reversed by this flow.
- No deleted draft is resurrected; only the exact durable job's product-line result may be reused to fill the newly created draft.
- No stock posting, approval, finalization, fiscal or real payment action is added.
- CI acceptance: focused recovery/discount tests, full server suite and server build pass.
- LAB acceptance remains: one POS-front draft, no new payment, sixteen lines, no provider call/failure, and row `340061124` shows quantity `2`, original unit price `1.420`, discount `15% / 0.43`, net `2.41`.
