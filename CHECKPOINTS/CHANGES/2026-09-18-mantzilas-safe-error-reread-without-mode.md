# Recover a safe inferior reread without legacy mode metadata — 2026-09-18

## LAB evidence

- Status: **LAB FAIL** after exact production `c9621df47114909e1f64964cbd363c1a9cc7c53d`.
- After the required refresh/wait/refresh, invoice `12674` still showed update time `18/09/2026 08:18`, 13 rows, net `331.09 EUR`, gross `374.12 EUR` and the old `POS_FAILED / POS_BACKGROUND_FAILED` safe-rejection message.
- No new OCR result was produced; the unchanged purchase timestamp proves the V12 strategy claim did not run.
- Production source contains the intended PR #947 predicate, so the remaining blocker is the predicate's assumption that this older failed job stored the newer `posReprocess.mode` field.

## Bounded correction

- The exact stored error `POS_BACKGROUND_AI_RECHECK: Η νέα πλήρης ανάγνωση δεν βελτίωσε με ασφάλεια το πρόχειρο` can only be produced by the same-draft inferior-reread guard.
- Remove the redundant `reprocess.mode === RECONCILIATION_REREAD` requirement so the legacy job can advance even when that newer metadata field is absent.
- Continue to require all other independent boundaries: status `POS_FAILED`, a linked existing purchase draft, strategy different from current V12 and the exact safe-inferior-reread error.
- On claim, stamp the V12 strategy marker before scheduling; a later V12 failure therefore cannot loop on refresh.

## Protected behavior

- Preserve the exact source image, supplier, invoice identity, AI job, purchase document, unapproved draft and settlement identity.
- Preserve verified-table total reconciliation, same-draft atomic replacement and inferior-result rejection.
- All unrelated or non-retryable failed jobs remain excluded.
- No new upload, duplicate payment, duplicate credit, duplicate draft, approval, finalization, stock posting, fiscal, accounting or myDATA mutation.

## Verification and acceptance

- Focused recovery, persistence, reconciliation, multipage and column regressions: `114/114 PASS`.
- Syntax and diff checks: PASS.
- Full server suite: `1306/1306 PASS`.
- Production client/server/Prisma build: PASS.
- Require green CI, merge and exact deployed revision before another LAB refresh.
- LAB acceptance remains: the same single unapproved `12674` draft; 13 physical rows; Red Bull `00206` and `11` at 24 pieces; `12798` and `12718` at 12 stock pieces; printed discounts on the correct rows; net `324.31 EUR`, VAT `42.16 EUR`, gross `366.47 EUR`; no stock posting or finalization.
