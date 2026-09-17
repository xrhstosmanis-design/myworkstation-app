# Invoice 12674 false total-only duplicate recovery — 2026-09-18

## LAB evidence

- Status: **LAB FAIL**.
- Exact deployed revision: `e64de7bc58c860c78570f0ef0706a1229a7160eb` (PR `#943`).
- Phase 1 lifecycle evidence is positive: the existing invoice completed automatically and reached the unapproved BackOffice draft without another POS submission.
- The economic/content result is not acceptable. The detail view reports `13` rows and `366.50 EUR` against invoice `366.47 EUR`, but the original image proves the apparent agreement is false.
- The printed table contains one code `59` row and a distinct final `01880` row. The draft contains code `59` twice, has shifted neighbouring values/VAT and shows zero discounts although the printed table contains `31%` and `19%` discounts.
- The user additionally confirmed codes `12798` and `12718` contain `12` stock pieces each; their displayed `24` pieces remain a separate packaging correction.

## Root cause and bounded correction

- `restorePrintedRepeatedLine` accepted a unique gross-value gap as sufficient evidence that an already extracted row was printed twice.
- For `12674`, another omitted/shifted row combination happened to leave a gap close to the gross of code `59`. The fallback synthesized a second `59`, brought the aggregate within three cents and prevented `mantzilasRequiresCompleteReverification` from running.
- A repeated physical row may now be restored only when current-document text independently contains the exact supplier code more times than the structured table.
- A matching total gap by itself is not row-identity evidence. It remains a mismatch so the existing complete printed-table verifier must reread every physical code, row arithmetic, discount, VAT and footer and may replace the draft only when all gates reconcile within `0.05 EUR`.
- Advance the persisted-draft reread strategy from V10 to V11 so the same unapproved `12674` draft is eligible for one correction attempt after deploy.

## Protected behavior

- Preserve the one source image, AI job, credit intent and draft. Do not create another upload, payment, credit or order.
- Preserve invoice `12665` LAB PASS normalizations, legitimate repeated printed rows with independent occurrence evidence, and the cent-level MANTZILAS total/VAT guards.
- No approval, finalization, stock posting, fiscal, accounting, myDATA or supplier-history economics mutation.

## Verification and acceptance

- Syntax and diff checks: PASS.
- Focused invoice/recovery regressions: `105/105 PASS`.
- Full server suite: `1304/1304 PASS`.
- Production client/server/Prisma build: PASS.
- Green CI, merge and exact deployed revision remain required.
- LAB acceptance requires rereading the existing draft from the archived original into the actual printed row identities, discounts and VAT footer. Matching the aggregate alone is insufficient.
- Codes `12798` and `12718` must subsequently be verified as `12` stock pieces each without changing their printed invoice economics.
