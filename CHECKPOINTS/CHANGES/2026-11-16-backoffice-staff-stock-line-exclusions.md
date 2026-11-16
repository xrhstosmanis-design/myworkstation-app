# BackOffice staff invoice stock exclusions

- LAB observed `STAFF_ACCESS_DENIED` on the mixed selection for `LAB-POS-3892-20261116-B`; it remained pending and SKU balances stayed 3 and 11. See [prior evidence](2026-11-15-backoffice-invoice-stock-selection.md) and PR #3937.
- The existing `invoices.approve` request field check accepts `excludeStockLineIds` only for `INVOICED`. The route capability, company/store ownership, active grant and transactional posting handler remain the authority. The posting handler continues to validate deferred posting and the identity of every excluded line.
- The HTTP regression covers authorized posting, rejection on FINAL, disallowed override fields and cross-store rejection. PR and main CI passed. Guarded deployment verified production revision `1ccd231fcbc70444c924cf9c199d1993387590c8` in workflow run `43915395690`.

## Hosted LAB retest on 2026-11-16

- In BackOffice, the LAB staff operator `lab31` (Δοκιμή απογραφέα LAB) opened `LAB-POS-3892-20261116-B` in ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. The synthetic invoice had two lines and a total of €2.48. It moved from `Προς έλεγχο / Τιμολόγηση` to `Τιμολογημένη` at 19:25 Greece time after one submission. No payment was initiated.
- Fresh warehouse searches before and after submission verified `LAB3702-20261110-A` (selected, 1 unit) moved from 3 to 4 and `LAB-3645-ALIAS-A` (excluded, 1 unit) stayed at 11. The invoice detail also showed 4 and 11 after posting.
- Platform Admin Audit verified exactly one stock receipt for this invoice at 19:25 Greece time. Movement `30b0d51e-467d-4c26-b309-243dcc0a4028` recorded `IN 1` for `LAB3702-20261110-A` under the LAB staff operator. No receipt appeared for the excluded SKU. BackOffice supplied the before/after balances because the Audit entry did not retain them.
- Result: PASS for staff invoicing, selective stock receipt and Audit verification.
