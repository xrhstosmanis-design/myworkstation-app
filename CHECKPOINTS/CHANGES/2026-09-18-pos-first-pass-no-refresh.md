# POS invoice first-pass, no-refresh invariant — 2026-09-18

## LAB evidence

- Status: **LAB FAIL** on production `ce88c2a6e0a263f66288d3bbef42edc96f0ca286`.
- Invoice `12674` still displays `12` rows, `380.79 EUR` net and `430.29 EUR`
  gross against the printed `366.47 EUR` total.
- The latest complete verifier candidate also returned `12` rows and was safely
  rejected with a `10.15 EUR` difference. The older draft was preserved.
- `POS_PROCESSING / POS_BACKGROUND` remains visible. A refresh or startup reread
  is not acceptance and must not be requested as the solution.

## Root cause and bounded correction

- The single complete visual verifier received `expectedGrossTotal` in server
  code, but its visual prompt did not disclose that total, the current guide
  total or their difference.
- The provider could therefore return individually balanced rows while still
  omitting or shifting a physical row. The server correctly rejected the table,
  but it could not guide the same one visual pass toward completeness.
- Keep one provider call. Add the independently confirmed invoice total, current
  guide gross and exact gap to that verifier. Require a final physical-row count,
  gross reconciliation within `0.05 EUR` and VAT-footer reconciliation before
  the structured response is returned.
- Bound reasoning to `minimal` so the one complete pass does not recreate the
  earlier multi-minute retry amplification.

## Protected behavior

- Keep the exact-total fail-closed server validation authoritative; prompt text
  alone never permits a candidate to persist.
- Reuse the same attachment, settlement identity, AI job and single draft.
- No refresh-triggered recovery, second upload, duplicate payment/credit/draft,
  approval, finalization, stock, fiscal, accounting or myDATA mutation.
- Preserve other suppliers and the verified MANTZILAS `12665` behavior.

## Acceptance

- Focused POS/MANTZILAS tests `90/90`, complete server suite `1311/1311`,
  production build, syntax and diff checks: **PASS**.
- CI and deployment do not constitute LAB PASS.
- LAB PASS requires one genuinely new invoice submitted once from the POS and a
  correct single BackOffice draft created automatically, without POS refresh,
  BackOffice refresh, reopening, status polling or a second upload.
- Verify every printed row, discounts, VAT groups and the invoice total before
  approval. Do not approve, finalize or post stock during the test.
