# TALOS POS learned invoice mismatch — 2026-09-23

## Evidence and state

- **LAB FAIL:** POS invoice `01T00125909` created 44 order rows with gross `825,82 €` against the entered and printed `252,06 €` (difference `573,76 €`). Several distinct rows repeat net `13,00 €` and gross `14,69 €`.
- Production health reports revision `d426f2df`; current main is `d8abc2cf`, including later TALOS learning work at `880e2b9a`. Do not equate main or CI with a deployed LAB pass.
- The POS exact-learning resolver already checks supplier, invoice number, each row's arithmetic and total. If it rejects a matching learned document, the old flow proceeds to generic AI and can publish a review draft with a very large difference. The screenshot proves the resulting order is unsafe for approval.
- Read-only production Learning view: TALOS VAT `800802293` has 44 learned rows under numeric invoice `00125909`, net `223,05 €`, VAT `29,00 €`, gross `252,05 €`. The POS header says `01T00125909` and `252,06 €`. The printed series `01T` was lost from the learned identity, preventing exact replay. The one-cent total gap remains within the existing `0,05 €` acceptance tolerance; row arithmetic still must pass.

## Bounded change

- For TALOS VAT `800802293`, if a centrally learned document matches this supplier and invoice number but its exact economics fail validation, stop the AI reread and final POS persistence with `POS_LEARNED_INVOICE_MISMATCH`. Keep the existing draft unchanged.
- If the exact learned invoice validates, the existing exact replay remains available. Other suppliers and invoices keep their existing behavior.
- For trusted TALOS VAT only, match `01T` plus the complete learned numeric invoice number; never use a suffix-only or cross-supplier match. This lets exact learned rows replay for the same physical invoice when their arithmetic and gross pass independently.
- For all stores using a centrally learned complete-table supplier rule, the POS background worker now refuses to save an order whose rows differ from the operator-entered invoice total. A valid table with a different header remains for Learning correction, not an inflated POS order.
- The trusted POS supplier VAT also enforces complete-table reconciliation for every future TALOS invoice, even when an older central profile lacks the flag.
- Learning confirms centrally only after the rows reconcile to the displayed invoice total and the profile synchronization succeeds. The UI reports success after the server response, so newly verified rules are shared across stores rather than silently pending in the browser.
- This gate does not fabricate `252,06 €` rows or repair the already incorrect order automatically.

## Protected behavior and verification

- Same tenant/supplier/invoice identity, payment idempotency and existing draft preservation remain mandatory. No duplicate upload, payment, approval, stock, fiscal, accounting or myDATA operation.
- Targeted exact-learning, profile-sync and POS line-contract tests `16/16` PASS. Full server suite `1420/1420` PASS, client production build PASS, syntax and `git diff --check` PASS. An initial run before workspace dependencies were available failed on missing `express`/`vite`; the complete rerun passed with dependencies supplied from the existing checkout.
- **AWAITING CI / DEPLOY / LAB:** after green CI and exact Render revision check, inspect the central learned document's 44 row economics. Reconcile net `223,05 €`, VAT `29,01 €`, gross `252,06 €`, then validate one genuinely new POS submission creates one correct draft automatically. Refresh or rerun of the current draft is diagnostic only.
