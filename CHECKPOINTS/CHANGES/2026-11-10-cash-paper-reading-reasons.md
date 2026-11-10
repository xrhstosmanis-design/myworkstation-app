# 10/11/2026 — CASH-UNIFIED-AUDIT-15 / Reading status in the report

Retained cash owner. Scope claimed in #3802 and merged at 46668020d54e36b37cefc53e5629a9df56385d9b. The personal 06/11 report exposed the same generic reason for unread originals and did not distinguish a missing request from an attempted reading with no result.

This slice preserves the stored reading reason through the read-only projection and explains unread, pending and uncertain evidence in both report views. Attachment coverage shows the count with a saved reading. No paid reading or financial action is added by this slice.

Local focused stored-preview tests: 16 PASS. Hosted and LAB acceptance NOT TESTED. Next scope: explicit period-scoped paper preparation and separate original-versus-system comparisons for EFTPOS, Netlink and OKTO. The complete report remains OPEN.
