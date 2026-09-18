# Preserve POS-confirmed supplier during full OCR — 2026-09-18

## LAB evidence

- Invoice `12674` was submitted once from the POS with MANTZILAS already
  confirmed, then the background full read produced incomplete or incorrect
  tables instead of a correct automatic draft.
- The durable handoff retained the correct supplier id, while a full-page OCR
  provider could omit or garble the supplier header in its replacement result.
- A missing provider supplier field made the MANTZILAS-specific complete-table
  verifier and exact-total fail-closed rule unreachable.

## Root cause and bounded correction

- Reload the trusted active tenant supplier referenced by
  `posHandoff.supplierId`, including its name and VAT id.
- After the provider result is parsed and before supplier profiling or
  reconciliation, overwrite only the supplier identity with that trusted
  handoff value.
- This keeps provider-read line data available while guaranteeing that the
  confirmed supplier's learned layout, complete-table verifier and fail-closed
  total/VAT checks are always applied.

## Safety boundaries

- The supplier is accepted only from the existing authenticated tenant handoff
  and an active supplier row belonging to the same company.
- Reuse the same attachment, settlement identity, AI job and unapproved draft.
- No duplicate upload, payment/credit/draft, approval, finalization, stock
  movement, fiscal command, accounting entry or myDATA mutation.

## Acceptance

- Regression test verifies the trusted supplier is applied before the supplier
  profile and that the MANTZILAS exact-total fail-closed gate remains present.
- Complete server suite `1312/1312` and production build: **PASS locally**.
- Require green CI, squash merge and exact deployed Render revision.
- CI and deployment do not constitute LAB PASS. Final acceptance requires one
  genuinely new invoice submitted once from the POS and completed correctly
  without POS refresh, BackOffice refresh, reopening or a second upload.
