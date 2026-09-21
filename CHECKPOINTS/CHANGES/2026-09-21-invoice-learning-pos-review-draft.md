# 2026-09-21 — POS reviewable draft on header-total difference

## Request

Allow a valid OCR table to appear in the POS/Orders draft when the invoice header total differs, because the operator can correct one or two product codes manually.

## Implementation

- A complete printed table is checked against its own row arithmetic separately from the invoice header total.
- If the rows are internally valid but the header differs, the rows are retained and passed to the existing reconciliation-aware draft intake.
- The existing reconciliation note/difference remains visible for BackOffice review; no approval, stock update, or finalization is introduced by the background handoff.
- Corrupted row arithmetic and empty product tables remain blocked.

## Verification

- Targeted server tests: `45/45` PASS.
- Pending: GitHub CI, merge, Render deploy, and the real MANTZAVAS `38001` retest.
