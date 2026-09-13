# Gate 3 — paid reread confirmation and legacy identity recovery

- CI #2081 caught a legacy-description lookup failure in the real HTTP test. The SQL extractor now strips the dash-delimited note before extracting the full invoice number; assertions remain unchanged.
User retest after PR #800: FAIL. Invoice 2612188 and its photos are no longer visible in Purchases/Inbox, but both PAID and CREDIT input are rejected. Latest screenshot reports INVOICE_PAYMENT_MISMATCH; prior screenshot reported DUPLICATE_INVOICE_FILE. Supplier ledger still shows two historical payments of EUR 2,369.99. Screenshots do not identify which validation field differs; no direct production database inspection has been performed.

Changes:
- Align payment validation with the existing company-scoped VAT lookup. Supplier aliases with the same database-verified VAT may reuse their payment; company, store, exact invoice and finite positive matching amount remain mandatory.
- Prefer the payment already owning the unique invoice key, then the oldest payment. Historical duplicates remain untouched; linking the oldest unkeyed row must not collide with the already-keyed row.
- Report the exact mismatching field, including payment/invoice totals, instead of a generic four-field error. A missing total is explicitly reported, not silently inferred.
- Ask the operator to confirm invoice-only reread before handoff. Cancel performs no writes. Both PAID and CREDIT use the same existing payment; no cash drawer event; form closes after durable acceptance.
- Source-file checks inspect the actual linked document. Handoff protects active source documents/orders and creates a fresh job for a deleted document's completed extraction.
- Draft deletion resolves both order→document and document→order links and preserves the payment through a same-company VAT alias. Finalized/posted/multiple-linked records still block deletion.

Validation:
- Local server/client builds and 1180 server tests PASS (local Node 24; required Node 20 and real Postgres HTTP E2E are enforced in CI).
- Added executed submit-handler tests: cancel without writes; confirm PAID and CREDIT both reuse payment and release POS.
- Extended isolated HTTP E2E: reverse-link-only draft deletion, legacy description, supplier VAT alias, historical duplicate, canonical payment-key selection, completed job after source deletion, durable handoff, second-user review/intake and unchanged payment facts/stock.
- PR #802 head `bb7450a0eab538478ed866e6b4bf6197e43a0542`: CI #2083 / run 34768546317 PASS, 1181 tests and real Postgres HTTP E2E PASS. Merged as `d3346a79a794e73655297675b8b5062a3ba78510`; main CI #2086 / run 34768664177 PASS.
- A subsequent independent Super Admin commit includes #802: `c5fb20c3834847a0dda9fc5844ce768e53c19f60` (ancestry verified), CI #2087 PASS. Superseded deployment #1108 was cancelled; deployment #1110 / run 34768835097 / job 103755027669 PASS. At 16:34:54 UTC the application health returned exactly this revision with `ok:true`.
- Ready for user LAB retest after Ctrl+F5. The confirmation must explain that the invoice is already paid and that only the invoice will be reread. Cancel makes no writes; confirm accepts the source and releases POS for sales. Test both PAID and CREDIT choices without another financial movement.
- Gate 3 remains open pending live source-reading accuracy. A successful code/deployment check does not certify 38 correctly read rows from the user's photographs.

No production financial corrections/reversals are included. Historical double payment requires a separate audited correction. Source-reading acceptance remains 38 lines / 608 units / EUR 2,369.99 with correct retail, purchase cost and quantity.

Checkpoint merge recovery: a concurrent main update 3ad9817e replaced large sections of the central active list with literal truncated-output markers. Restored the complete c5fb20c3 history, retained the new COMPLETE/Audit notes, and applied this verified delivery record. No concurrent application code was changed.

## POS durable recovery and printed-column correction

- LAB showed that a durable POS job could remain unavailable until sign-out/sign-in, and that invoice 2612188 could retain 38 rows while shifting retail into quantity (`2,363.28 €` vs `2,369.99 €`).
- Orders & Purchases refresh now reclaims only queued or stale processing POS jobs for the current tenant/store. Recovery schedules the existing job and never creates, reverses, or changes a payment.
- Before reconciliation, the reader applies the existing source-verified printed-column recovery to the current document rows. It derives quantity, purchase and retail only when the printed row balances; it never imports prior invoice economics.
- Targeted tests pass locally. CI/Render/LAB reread remain pending. The current wrong draft must not be approved.
- Headerless OCR hotfix: the second LAB reread retained physical rows but omitted the header. Recovery now runs only for `retail=0`, parsed quantity equal to printed retail, an inconsistent parsed row equation, and a balanced current source row. Regression coverage added; no payment, stock, or approval behavior changed.


- POS handoff correction: normal Invoice intake confirmed the source rows were correct, while the POS V2.4.4 finalizer could reselect a non-verified duplicate and overwrite them. It now prefers `sourceColumnsVerified`, rejects an overwrite when quantity × unit cost (after discounts) does not agree with the row net amount, and carries the verified retail price into BackOffice. The quick POS flow, payment reuse, approval and stock behavior are unchanged.


- POS handoff follow-up: verified source rows now win even when OCR duplicates share source coordinates; payment, stock, approval and quick POS flow unchanged.
