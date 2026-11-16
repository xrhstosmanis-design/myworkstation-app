# BackOffice staff invoice stock exclusions

- LAB observed `STAFF_ACCESS_DENIED` on the mixed selection for `LAB-POS-3892-20261116-B`; it remained pending and SKU balances stayed 3 and 11. See [prior evidence](2026-11-15-backoffice-invoice-stock-selection.md) and PR #3937.
- The existing `invoices.approve` request field check accepts `excludeStockLineIds` only for `INVOICED`. The route capability, company/store ownership, active grant and transactional posting handler remain the authority. The posting handler continues to validate deferred posting and the identity of every excluded line.
- The HTTP regression covers authorized posting, rejection on FINAL, disallowed override fields and cross-store rejection. Hosted result remains AWAITING LAB. Retest the same pending LAB invoice once, selecting the first SKU only, with fresh before/after balances and independent Audit verification.
