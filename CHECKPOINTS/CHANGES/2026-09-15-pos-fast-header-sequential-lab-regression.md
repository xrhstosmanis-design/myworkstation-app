# POS two-page FAST header sequential recovery — 2026-09-15

## Reconciled evidence before change

- **LAB PASS:** invoice `2612188` returned the correct four basic fields when page 1 was read first and page 2 was added afterward: supplier `ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ`, document `2612188`, date `02/09/2026`, total `2.369,99 €`.
- **LAB FAIL:** selecting the same two pages together made both concurrent FAST requests fail and left all four fields blank.
- **LAB PASS protected:** Coffee Union invoice `ΔΑ0011467` had 7 lines and the correct financial total at 10:16 on 15/09. Product quantities, supplier rules and full line OCR are outside this change.
- **NOT TESTED:** the bounded full background reader merged later has not received a valid post-deploy LAB run because the latest attempt stopped at FAST header reading.
- The older checkpoint describing concurrent FAST reads is superseded by the later LAB failure. Independent error handling is retained, but provider calls are no longer concurrent.

## Single bounded change

- Read the selected FAST header candidate pages sequentially.
- Preserve every successful page result and continue when another page fails.
- Keep the order-independent Stefanidis header merge and the existing 75-second per-request safety bound.

## Safety boundary

- Pre-payment header reading only.
- No payment or credit write, no stock movement, no draft recovery/deletion, no approval, finalization or fiscal action.
- Existing payment and deliberately deleted drafts remain untouched.

## Required validation

- Automated test must prove there is no `Promise.all`/`Promise.allSettled` in the FAST candidate read and that a rejected page does not discard a successful page.
- Local targeted tests: 33/33 PASS.
- Client and server builds: PASS.
- `git diff --check`: PASS.
- CI PASS is not LAB PASS.
- After exact deploy verification, LAB must select both pages together (including reversed filename/order) and verify only the four displayed fields before any submit action.
