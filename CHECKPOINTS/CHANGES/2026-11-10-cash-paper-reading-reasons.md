# 10/11/2026 — CASH-UNIFIED-AUDIT-15 / Reading status in the report

Retained cash owner. Scope claimed in #3802 and merged at 46668020d54e36b37cefc53e5629a9df56385d9b. The personal 06/11 report exposed the same generic reason for unread originals and did not distinguish a missing request from an attempted reading with no result.

This slice preserves the stored reading reason through the read-only projection and explains unread, pending and uncertain evidence in both report views. Attachment coverage shows the count with a saved reading. No paid reading or financial action is added by this slice.

Local focused stored-preview tests: 16 PASS. Hosted and LAB acceptance NOT TESTED. Next scope: explicit period-scoped paper preparation and separate original-versus-system comparisons for EFTPOS, Netlink and OKTO. The complete report remains OPEN.

Follow-up: full CI 42856289846 failed two existing email assertions when the familiar unread label was replaced. The label is retained with its specific explanation. The report now distinguishes an independently matched EFTPOS slip total from the stored POS–EFTPOS difference, and states when there is no verified slip total per shift. This covers exact existing matches only. Mismatched totals, automatic preparation, Netlink and OKTO remain open. Added a focused common-report regression. Hosted verification pending.
