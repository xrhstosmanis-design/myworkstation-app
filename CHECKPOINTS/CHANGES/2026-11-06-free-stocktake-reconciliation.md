# 06/11/2026 — Free stocktake comparison

Scope: read-only reconciliation of two finalized FREE stocktakes in the same company and store. Filter catalog placeholders before the SQL line and movement limits. Preserve measured zero, either missing-side finding, mixed scope, and existing reports and access checks.

Evidence: local source commit `688091d`, identical source tree on GitHub commit `95ba914`. The PGlite/Prisma regression failed on the baseline by including the untouched product and passed with the fix. Two measured products produced a numeric total. Both one-sided cases and mixed scope were checked. Eleven unit tests and the evidence SQL test passed. The concurrent-review transaction test timed out at the same point on baseline and candidate under PGlite.

Status: native PostgreSQL CI and hosted LAB are NOT TESTED. No deployment or hosted writes were performed. Next: exact PR CI, normal release gates, and a read-only LAB comparison confirming the two measured rows, numeric total, and missing-side indication.
