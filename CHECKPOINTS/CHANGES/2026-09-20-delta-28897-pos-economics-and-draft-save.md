# Checkpoint — DELTA 28897 POS economics and durable Learning draft

## Evidence

- **LAB FAIL:** Purchase draft `28897` preserved gross `53,91 €` but displayed quantities multiplied by 1000, discount 1 as `99,9`, and VAT as zero.
- Printed invoice truth: 11 rows; quantities `2,1,3,6,3,3,3,2,4,3,1`; discounts `10%` on rows 1–9 and `15%` on rows 10–11; VAT `13%`; net `47,71 €`; VAT `6,20 €`; gross `53,91 €`.
- **LAB FAIL:** the Invoice Learning «Αποθήκευση Προχείρου» action did not provide a durable confirmed save.
- **POST-DEPLOY LAB FAIL:** the fresh 10:49 PM order proved that raw `stockUnitsPerInvoiceUnit=1000` still survived as if it were an explicit package rule, while corrupt `99,9`/VAT-zero display fields survived beside intact net/gross totals.

## Root cause and bounded changes

- POS persistence treated generic `unitsPerPackage` metadata as an explicit stock conversion even for printed piece units. Product capacities such as `1LT` therefore became 1000 pieces.
- Complete-table provenance was trusted without one final arithmetic validation, and a failed verified result could still reach a legacy finalizer outside the supplier-profile-specific branch.
- Learning draft save wrote synchronously to browser storage while central persistence was only a delayed background side effect, with success text outside the user's viewport and no actionable failure.
- Plain piece units now remain multiplier 1 unless an explicit verified package conversion exists. Complete printed rows must prove quantity × unit price × discounts = net and net + VAT = gross immediately before persistence. Any claimed-but-corrupt complete table fails closed.
- A stale learned supplier pack can no longer override a current-image, verified printed `ΤΜΧ/TEM` unit.
- Draft save now awaits `/api/platform/invoice-learning/workspace`, shows an in-button progress/success state, and alerts on failure.
- Plain piece rows now ignore a raw OCR multiplier even when the field is already populated; only an explicit package unit or user-confirmed conversion can multiply stock.
- Before insertion, corrupt discount/VAT display fields are recovered only when the intact row equation uniquely proves a canonical printed percentage.
- Existing unfinalized POS OCR drafts receive the same bounded repair when their detail is reopened; no payment, stock, approval or finalization occurs.

## Automated evidence

- Exact `28897` regression: quantities, discounts, VAT and `53,91 €` preserved; litre/ml descriptions do not multiply pieces; `99,9`/VAT-zero corruption is rejected.
- Existing MANTZILAS package conversion and cent-rounding regression remains green.
- Draft-save regression proves durable central request, awaited success, and visible failure.
- Targeted tests and client production build: PASS.
- Full server suite: `1373/1373` PASS on the post-deploy repair branch.

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

## 2026-09-21 — Exact learned-document handoff

- A fresh 09:27 POS run still failed with zero lines because the background
  recheck did not consume the centrally learned physical invoice.
- The Learning confirmation action now performs and awaits the central save;
  all non-rejected lines are explicitly confirmed before `LEARNED` status.
- POS resolves an exact learned document before invoking Azure/OpenAI. Reuse is
  limited to the same supplier, invoice number and gross amount, and only after
  every row's quantity, unit price, sequential discounts, net, VAT and gross
  independently balance. Partial or mismatched documents fail closed.
- The photographed `28897` fixture proves all 11 quantities, `10%/15%`
  discounts, `13%` VAT and the accepted cent-level total reconciliation.
- Client production build PASS; full server suite `1377/1377` PASS.
- Local implementation is ready for an explicitly authorized push; no remote
  mutation was performed at this checkpoint.
