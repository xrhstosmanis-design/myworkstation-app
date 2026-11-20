# No5 — retain COMPANY binding after invoice taxonomy integration

PR #4007 continues from caf0c77d. Integrated main 885f00f047cfe0a734cc0d526c68f01b4d7e279d. Its invoice taxonomy change adds selected-store product metadata and preserves the administrative write guard. Reviewed the route and refreshed only its stale digest in the inactive COMPANY packet. No activation or backup guard changed.

The exact previous draft tree passed 404 local rights checks with four skips. This integration passed 16 targeted checks, with four infrastructure-dependent checks skipped. Native PostgreSQL full backup, private restore and installation remain CI acceptance requirements. Final human checks stay grouped by role in the existing LAB.

CI 44404645737 reached the CURRENT target worker after native full backup, private restore and installation, then failed on the runtime fixture product count. CURRENT preserves an extra unassigned bundle base product. The fixture now asserts the exact CURRENT total, company attribution percentage and product IDs while preserving BASE and CAPTURE expectations. Native end-to-end acceptance awaits the rerun.
