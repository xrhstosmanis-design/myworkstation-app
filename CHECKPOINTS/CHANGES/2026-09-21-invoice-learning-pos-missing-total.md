# Invoice Learning POS replay with missing draft total — 2026-09-21

## Evidence

- The central Learning Lab still contains `ΜΑΝΤΖΑΒΑΣ ΣΠΥΡΙΔΩΝ ΗΛΙΑΣ` invoice `38001` as `LEARNED`.
- POS created a safe draft with zero lines and zero value after the background recheck failed; no payment or finalization occurred.

## Fix

- Exact central Learning replay still requires the same legal supplier and invoice number.
- When a failed POS retry has lost only the temporary header total, the resolver uses the independently calculated gross from the same learned lines.
- Existing POS totals remain authoritative whenever present and must reconcile within the existing tolerance.
- No quantities, prices or discounts are copied from DELTA or another supplier; commercial-family rules remain layout-only.

## Verification

- Targeted exact handoff tests: `8/8` PASS.
- JavaScript syntax checks: PASS.
- `git diff --check`: PASS.

## Next LAB step

- After green CI/deploy, retry the existing safe `38001` draft once. Do not pay or finalize until all lines and totals appear correctly.
