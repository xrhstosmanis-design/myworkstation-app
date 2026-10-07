Owner14:43 states this step was already done and requests no repetition. No repeat supplier/reopen test requested; treat owner confirmation as evidence of completed sequence, without inventing supplier identity or independent DB proof. Continue next distinct09 residual.

## 07/10/2026 14:39 Athens - HARIBO505-16966 application: scoped USER PASS

ASSIGNED codex/mydata-completion-20261006 retained; tracker09/original grouped No4 remains OPEN. Screenshot14:33 (file_0000000078e08210b823e5b535b2d938) shows13 complete rows,0 requiring review,55 preview pieces/net56.20/VAT7.30/gross63.50. Screenshot14:39 (file_0000000090dc81f49afe41cf75e9a53a), after the requested one Apply, shows the same existing NEW50516966/MARK400015564403749 with13 items/net56.20/gross63.50. This closes the13:47 blocked-Apply residual only. Difference0.01 from original63.51 is within owner's0.05 rule. Visible saved rows1-7 and partial8; all13 saved row values/total saved quantity55 and close/reopen durability are not independently confirmed. Supplier still Χωρίς: review existing ΠΗΓΑΣΟΣ ΑΕ AFM094211509 separately. No repeat Apply/upload/payment/finalization. Independent DB identities/counts/concurrency/cash/stock effects remain NOT TESTED. Previous PEPSICO/ALFA and agreed Gate3 PASS protected; other owners unchanged.

Implementation PR1819 fullCI4561/run37612078069 PASS1875/0/0; mainCI4562/run37612453042 and deploy2078/run37612713256 SUCCESS. Exact public health b0acab108fb01836664c3dd807267e7bfde83579 and published frontend verified before this user test. Checkpoint CHECKPOINTS/CHANGES/2026-10-07-mydata-haribo-unit-apply.md. Historical awaiting/FAIL entries below are superseded for application only.

# HARIBO505-16966 — printed unit and Apply regression

## 07/10/2026 — HARIBO505-16966 unit/Apply regression — AWAITING CI / DEPLOY / USER

ASSIGNED `codex/mydata-completion-20261006` retained (claimPR1794); bounded implementation branch `codex/mydata-haribo-unit-20261007`, tracker09/original groupedNo4 overall OPEN. Owner13:42–13:47 screenshots show13 selected physical rows/55pieces/net56.20/VAT7.30/gross63.50 versus original63.51, but Apply refuses line1 and rows report missing description/unit despite populated descriptions and visible «τεμ.». New scoped USER FAIL; accepted ±0.05 rounding remains unchanged. Exact HARIBO raw preview JSON/unit and browser runtime were not captured.

Production helper reproduces this failure for known printed piece aliases such as ΤΕΜ. and ΤΕΜΑΧΙΑ: they remain noncanonical internally while HTML select defaults visually to PIECE. Narrow fix recognizes known piece aliases/trailing periods before existing validation; unknown units visibly require selection. ΣΕΤ/SET remain PACKAGE with an explicit positive integer factor, never default pieces. No change to economics, printed quantity, page/quantity confirmation, permissions, API writes, learning, payment, finalization, stock or fiscal/myDATA posting. Local focused5/5 PASS, including hand-transcribed13-row fixture/55/56.20/63.50 and preserved package2×3=6. Fixtures are not OCR replay or actual application PASS. FullCI/merge/exactdeploy and same-existing-draft USER acceptance pending. Checkpoint `CHECKPOINTS/CHANGES/2026-10-07-mydata-haribo-unit-apply.md`. Prior PEPSICO/ΑΛΦΑ8114 and agreed Gate3 PASS protected; other owners unchanged. Next after exactdeploy: one application of checked rows in same NEW505-16966/MARK400015564403749, then readback13rows/55pieces/net56.20/gross within0.05 of63.51, without recreation/payment/finalization.

## Evidence and causal limit

Original uploaded ΗΑΡΙΜΠΟ.pdf: ΠΗΓΑΣΟΣ ΑΕ, AFM094211509, recipient Διαδόχου/802387132, issue07Oct2026, MARK400015564403749, one page,13 rows/55 printed pieces, net56.20/VAT7.31/gross63.51. Discount amounts are explicit; equivalent percentages are calculated, not printed. Original row13 VAT0.95 versus per-row calculation0.94 explains preview0.01 difference. Owner explicitly accepts up to0.05. Screenshot13:39 existing NEW draft zero rows/net/gross and no supplier; latest13:47 file_00000000076481f4bb18a06dfea82bc1 shows selected rows, filled descriptions, visible units, factor1 and refusal. No successful application observed. The exact raw unit is unknown; code reproduces the symptom for known aliases, so final real acceptance remains required.

Read AGENTS, active list, relevant integration/acceptance/TWINS/current myDATA checkpoints, invoice manual and tracker; inspected main since79908d72 through f5852e99. Active source itself contains a literal historical “1830 tokens truncated” marker; retained without inventing missing history. Recent manual/owner observations supersede historical Gate3 OPEN and wrong SET→PIECE plans. Existing published09 owner authorizes this continuation; no reassignment.

## Protected behavior and verification

- Printed pieces remain quantity×1; descriptions mentioning pack contents do not imply a multiplier (TWINS regression).
- Confirmed packages/SET retain their factor; blank/invalid factors and unknown units remain reviewable and cannot apply.
- Net/gross tolerance0.05, actual missing descriptions, page completeness and explicit quantity confirmation retain their guards.
- PEPSICO selected unchanged message, same-draft persistence, ALFA effective discounts and supplier association are not rewritten.
- No production DB script, new upload, repeated payment, approval, stock or fiscal action.

| Evidence | Before | After this change |
| --- | --- | --- |
| HARIBO actual Apply | USER FAIL13:47 | NOT TESTED / AWAITING USER |
| Known piece aliases / native select | Reproduced validation/display mismatch | Isolated DOM/unit tests PASS |
| Package/SET conversion | Protected confirmed2×3=6 | Regression PASS; no new LAB transaction |
|13-row HARIBO transcribed fixture |13/55/56.20/63.50 | Regression PASS; not OCR replay |
| PEPSICO / ALFA / agreed Gate3 | Existing scoped USER/LAB PASS | Protected, no repeat |
| Independent cash/stock/DB effects | NOT TESTED | NOT TESTED |

## Required actual acceptance

After full greenCI, merge and exact public health revision: refresh once and open the same existing draft505-16966, check original/13 physical rows, select checked rows and Apply once. Verify13 saved rows/55 printed pieces/net56.20 and gross63.50 or63.51 within0.05, then close/reopen same draft. If any failure remains, obtain exact visible reason/raw preview unit rather than bypass guards. Supplier AFM identity is a separate review before future finalization. No upload/payment/approval/posting is requested. Owner retains scope until named handoff; overall09 remains OPEN.

## Local verification before publication

Node20.20.2: focused5/5 PASS; frontend build PASS; server preparation/Prisma client generation PASS (no DB connection/migration). Initial full suite could not import an ungenerated PrismaClient; after required generation, server suite1864PASS/0FAIL/4SKIP. Database-dependent local skips are not acceptance; full isolated CI is required. Server preparation also regenerated an unrelated audit allowlist; that generated change was restored/excluded. Only the bounded client/unit tests and shared evidence documents/PDFs are published. PDF changed pages visually checked.
