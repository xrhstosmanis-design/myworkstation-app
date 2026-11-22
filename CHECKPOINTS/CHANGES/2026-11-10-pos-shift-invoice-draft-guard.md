# POS shift closure and invoice drafts

Local candidate on main base 561adbf. Shift closure blocks unresolved invoice payments, including the legacy fast POS payment with no active linked purchase draft. POS recovery offers the stored original or a replacement image/PDF against the existing payment. The payment screen returns to service if payment is confirmed but draft handoff is unconfirmed.

Focused verification on Node 24: nine service/HTTP tests and ten mounted UI tests passed. Isolated native PostgreSQL 18.6 in UTC: 24 passed, zero skipped. A first run under Europe/Athens exposed timezone-sensitive legacy history fixtures, which passed under the UTC test configuration. Hosted LAB and release pending. No live payment or historical repair performed.
