# Checkpoint — DELTA 28897 POS economics and durable Learning draft

## Evidence

- **LAB FAIL:** Purchase draft `28897` preserved gross `53,91 €` but displayed quantities multiplied by 1000, discount 1 as `99,9`, and VAT as zero.
- Printed invoice truth: 11 rows; quantities `2,1,3,6,3,3,3,2,4,3,1`; discounts `10%` on rows 1–9 and `15%` on rows 10–11; VAT `13%`; net `47,71 €`; VAT `6,20 €`; gross `53,91 €`.
- **LAB FAIL:** the Invoice Learning «Αποθήκευση Προχείρου» action did not provide a durable confirmed save.

## Root cause and bounded changes

- POS persistence treated generic `unitsPerPackage` metadata as an explicit stock conversion even for printed piece units. Product capacities such as `1LT` therefore became 1000 pieces.
- Complete-table provenance was trusted without one final arithmetic validation, and a failed verified result could still reach a legacy finalizer outside the supplier-profile-specific branch.
- Learning draft save wrote synchronously to browser storage while central persistence was only a delayed background side effect, with success text outside the user's viewport and no actionable failure.
- Plain piece units now remain multiplier 1 unless an explicit verified package conversion exists. Complete printed rows must prove quantity × unit price × discounts = net and net + VAT = gross immediately before persistence. Any claimed-but-corrupt complete table fails closed.
- A stale learned supplier pack can no longer override a current-image, verified printed `ΤΜΧ/TEM` unit.
- Draft save now awaits `/api/platform/invoice-learning/workspace`, shows an in-button progress/success state, and alerts on failure.

## Automated evidence

- Exact `28897` regression: quantities, discounts, VAT and `53,91 €` preserved; litre/ml descriptions do not multiply pieces; `99,9`/VAT-zero corruption is rejected.
- Existing MANTZILAS package conversion and cent-rounding regression remains green.
- Draft-save regression proves durable central request, awaited success, and visible failure.
- Targeted tests and client production build: PASS.
- Full server suite: required again on final branch before PR.

## Safety boundaries

- No production data was changed.
- No draft was deleted or resurrected by code.
- No payment, stock movement, approval, finalization, fiscal, accounting or myDATA action was executed.

## LAB acceptance after exact deployment

1. In Invoice Learning, save a draft and reload the page; the same draft must remain visible.
2. The user may delete the known erroneous diagnostic draft manually.
3. Submit `28897` once, freshly, from POS.
4. Exactly one BackOffice draft must contain the 11 printed quantities, `10%/15%` discounts, `13%` VAT and `53,91 €` total.
5. Do not approve or finalize during this acceptance check.
