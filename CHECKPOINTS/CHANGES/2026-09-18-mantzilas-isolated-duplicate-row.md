# MANTZILAS isolated duplicate-row reconciliation — 2026-09-18

## LAB evidence

- Status: **LAB FAIL**.
- Exact deployed revision: `67216bce30d4abdadec4c5eaa8c5cb155c166384` (PR `#942`).
- The durable Phase 1 worker now claims invoice `12674` and reaches the bounded reconciliation result without another POS submission.
- The current-image reread returned `13` rows and gross `372.63 EUR` against the independently confirmed printed gross `366.47 EUR`: one exact overage of `6.16 EUR`.
- The draft remains at zero published lines because the fail-closed MANTZILAS total guard correctly rejected the candidate table.

## Bounded causal correction

- Keep the existing whole-table replay guard unchanged.
- Add a separate single-page MANTZILAS guard for one isolated duplicate created while supplemental provider rows are merged.
- A row may be removed only when exactly one pair has the same supplier code, normalized description, quantity, unit cost, net, VAT, gross and all three discounts; that row's gross must equal the entire invoice-total overage; and removing one occurrence must reconcile the independent total within `0.05 EUR`.
- If more than one duplicate pair qualifies, if the tuple differs, or if the total does not reconcile exactly, publish nothing and retain the existing failure path.
- The subsequent full-image verifier still rereads every physical row and may replace the guide only with a complete, contiguous, mathematically balanced table and matching VAT footer.

## Protected behavior

- Preserve the existing settlement, source attachment, AI job and draft for invoice `12674`; do not resubmit or create another credit.
- Preserve the final invoice `12665` LAB PASS rows, MANTZILAS `00009`, CORONA `02410`, explicit `12 TMX`, printed discounts/economics and cent-level invoice-total guard.
- No approval, finalization, stock posting, fiscal, accounting, myDATA or supplier-history inference is introduced.

## Verification

- Route syntax: PASS.
- Focused route and reconciliation regressions: `69/69 PASS`.
- Full server suite: `1304/1304 PASS`.
- Production client/server/Prisma build and `git diff --check`: PASS.
- Negative controls preserve a legitimate duplicate when the printed total includes it and preserve all rows when two duplicate pairs are ambiguous.
- Remaining: green CI, merge, exact deployed revision and automatic recovery of the same `12674` job.
- Final LAB PASS requires all printed rows and gross `366.47 EUR`, with the draft left unapproved and without stock posting.
