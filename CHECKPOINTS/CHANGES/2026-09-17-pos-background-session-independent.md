# POS background independent of operator-session lifetime — 2026-09-17

## LAB evidence

- Status: **LAB FAIL**.
- Exact production revision: `a2e6fb581809cbdc16402d5a1f18e4ccb31ab797`.
- A fresh MANTZILAS invoice `12674` was submitted exactly once from the POS front.
- The durable draft contains 12 rows totaling `308.60 EUR` net / `348.72 EUR` gross, while the POS-confirmed printed invoice gross is `366.47 EUR`; difference `17.75 EUR`.
- The detailed LAB review also proves supplier code `01880` (LIPTON peach tea 500 ml) is a `12 TMX` package. The current draft incorrectly shows `1 piece x 9.37 EUR`; the stock presentation must be `12 pieces x 0.780833 EUR`, preserving line net `9.37 EUR` and gross `10.59 EUR`.
- The operator additionally confirms that the displayed discounts are wrong. The current 12-row table is therefore not acceptable even where an individual net amount happens to look plausible. The corrective reread must source original price, discounts 1/2/3 and their amounts, net, excise and VAT from each current physical row and accept the batch only when the complete invoice reconciles to `366.47 EUR`.
- The aggregate mismatch correctly entered the full-table corrective reread introduced by PR `#937`, then ended at `POS_FAILED / POS_BACKGROUND_FAILED` with `POS_BACKGROUND_AI_RECHECK: Η συνεδρία έληξε.`.
- This is not operator error. The server accepted the durable handoff, but a later internal background request reused the browser authorization after that operator session was no longer valid.

## Bounded causal change

- Once the authenticated POS request has durably bound the job to its company, store, pages, draft and settlement identity, the server-owned background continuation must not depend on the lifetime of the browser session.
- Internal continuation authority must be narrow and verifiable: exact tenant/store/job scope and only the existing AI recheck, product-line persistence and POS intake steps for that handoff.
- Browser and external requests must continue through the normal authentication, role, company, store and permission checks. No general authentication bypass is allowed.

## Protected behavior

- Preserve the final POS-front LAB PASS for MANTZILAS invoice `12665`, including both `00009 = 24 pieces / 31%` and CORONA `02410 = 24 pieces x 0.98 EUR` simultaneously.
- Preserve the corrected MANTZILAS header total logic and full-table aggregate mismatch verification.
- Do not preserve or learn the wrong discount percentages from the failed `12674` draft; current-image row arithmetic remains authoritative.
- Preserve one payment/credit and one draft only. Do not create a new settlement, upload, source attachment or draft during retry/recovery.
- Do not approve, finalize, post stock, change fiscal/accounting behavior or resurrect a deliberately deleted draft.
- CI PASS is not LAB PASS.

## Required verification

- Focused regression proving the background continuation succeeds even when the original browser authorization is expired, and that the internal authority cannot cross company, store or job boundaries.
- Full server suite, client production build, server/Prisma build and diff checks.
- Green GitHub CI, merge and verification of the exact deployed revision.
- Then one fresh MANTZILAS invoice submitted once from the POS front. It must complete automatically with printed rows and total, without BackOffice refresh, a second upload or another settlement action.

## Local verification

- Focused POS/background, invoice and authentication regressions: **124/124 PASS** (`108` invoice/POS + `16` session/module checks).
- Full server suite: **1301/1301 PASS**. An initial concurrent run had one isolated `module-access-matrix` runner failure; the isolated test passed `3/3`, and the full suite repeat passed cleanly.
- Client production build: **PASS**.
- Server/Prisma build: **PASS**.
- `git diff --check`: **PASS**.

Status: **LAB FAIL / local implementation verified; awaiting CI, merge, exact deploy and fresh POS-front LAB**.
