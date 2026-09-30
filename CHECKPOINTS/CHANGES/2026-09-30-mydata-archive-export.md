# 30/09/2026 - full invoice archive and exports - AWAITING CI / DEPLOY / USER

Owner: `codex/mydata-archive-export-20260930`, same installation page continuing #1553. Owner asked for Excel/PDF at 21:16 and explicitly authorized implementation at 21:19 Greece.

## Before
Initial receiving has scoped LIVE PASS in #1553: 5,269 unique MARK, known 135848 / 75.14 RECEIVED. Existing inbox endpoint returns only 300 rows; UI filters that batch and groups by receipt date, so cannot search older records reliably. There is no archive export in this panel. Preserve the initial receiving PASS and separate original PDF/QR from generated reports.

## Change
Add read-only archive endpoint, gated by DOCUMENTS plus authorized BackOffice role and owned store. Parameterized company/store-scoped joins and filters cover the complete archive. Page size 100, stable date/receipt/id ordering; supplier choices from the entire store, search for number/MARK/VAT/text and Greek accent normalization. Document issue date used when available; receipt date is labeled separately. Existing inbox endpoint and mutation routes unchanged.
Excel export includes all matching records (not just the displayed page), string MARK/VAT/number, numeric financial values, status and original attachment availability. Uses the existing xlsx dependency and JSON data URL download pattern. Maximum 20,000 results; larger export rejected clearly, never silently truncated.
PDF report is an escaped print-ready HTML report; user selects browser Print / Save as PDF. Report identifies itself as summary data, not supplier original. Individual myDATA record has summary PDF action; original image/PDF action appears separately only for an existing attachment. No fabricated original link or QR. This PR does not fetch supplier originals.
myDATA RECEIVED label becomes “Εισερχόμενο myDATA · προς έλεγχο”. No stock, payment, purchase finalization, schema or fiscal changes.

## Verification
14/14 targeted tests PASS, frontend production build PASS, syntax/diff checks. Actual archive handler tested with 5,269 fixtures: XLSX generated and re-read with 5,269 records, full numeric amounts and textual MARK; pagination 100 at offset 300; foreign store 404 and operator token 403. SQL builder tests tenant joins, bound malicious input, literal wildcard search, Greek accents and report HTML escaping.
Read-only production execution of the generated count query for 135848 returned 1. No production write during diagnostics. Local Node is 24; required Node 20 CI remains authoritative.
Complete GitHub CI before merge; exact Render revision before user acceptance. No claim of user export/download or PDF print-layout PASS yet. Existing verified receiving remains PASS.

## Acceptance / handoff
After deploy, owner refreshes the same store, verifies total 5,269 (or later count), searches 135848 across full archive, exports Excel and checks rows/known amount, opens single-record PDF report and saves via browser Print. Original PDF is unavailable unless attached; do not call the summary the original. Replay/cursor, original acquisition and final posting remain OPEN. Owner retained until acceptance.
