# POS myDATA date review — 26 November 2026

Candidate: offer operator review of one verified same-store and same-supplier myDATA invoice with a matching number and corroborating amount when the date differs. Show both dates and use the existing canonical precheck before payment. Preserve blocked, paid and ambiguous entries. No production records changed.

Nine existing workflow tests passed locally. The focused date mismatch passed with the PostgreSQL engine in PGlite, with zero payment writes at proposal and recheck. Native CI and hosted LAB remain pending. LAB acceptance must show exactly one cash movement on the existing invoice and no additional movement on replay.
