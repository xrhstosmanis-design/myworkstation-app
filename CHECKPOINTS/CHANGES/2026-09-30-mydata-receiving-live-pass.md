# 30/09/2026 21:14 Greece - myDATA receiving LIVE PASS (limited scope)

Owner: same Diadochou installation page, `codex/mydata-receiving-evidence-20260930`, continuing #1551/#1552. This is real-store receiving evidence, not an OCR/Gate 3 or complete installation PASS.

## Before and after
Before user retry: independent read-only production query recorded inbound_count=0 and inbox_count=0 for the Diadochou company/store. Earlier user screenshot at 20:53 showed internal error; log at 17:53:16Z identified undefined Supplier Prisma delegate.
After #1552: exact production `5e5d12317d5677b77a742a898b033a55eab2acd7`, CI PASS and Render live. Owner desktop screenshot `image(20260930-181415).png`, 21:14 Greece, shows “5269 νέα παραστατικά μπήκαν στα Πρόχειρα” and an inbox list. Operator shift, sales and stock baselines were not captured; no measured financial/stock delta is claimed.

Independent read-only production result after the screenshot: 5,269 MyDataInboundDocument rows and 5,269 distinct MARK in the scoped company/store; invoice dates 2024-02-20 through 2026-09-30. Known invoice MARK 400015448413446 / number 135848 / gross 75.14 / recipient VAT matching company taxId is present and joins a DocumentInbox row with status RECEIVED. No credentials or raw production XML are stored here.

## Limited PASS and limits
LIVE PASS: production RequestDocs envelope parsing, company VAT acceptance and persistence of the initial inbound batch, plus known invoice header/amount readback. Distinct MARK count confirms this stored batch has no duplicate MARK; repeated synchronization is NOT TESTED.
The screen's 300-of-300 count is a server LIMIT 300, not the total downloaded. UI search only filters the loaded batch. Complete archive paging/search is OPEN.
RECEIVED is currently displayed as “Αρχειοθετήθηκε”. These are received reference records, not verified purchase postings. Original PDF/QR acquisition, line items, OCR, stock/payment effects, final purchase posting, other-store security and subsequent cursor/replay are NOT TESTED by this evidence. Do not import historical documents into stock merely because they arrived.

## Central closure
Close only the initial receiving/envelope/Supplier lookup failure. Update active list, invoice manual, pending roadmap and central PDF together. Keep owner assigned to safe replay/cursor verification and complete archive search. No further source-code changes in this evidence PR.

## Next action
Inspect the existing known record and establish a fresh baseline before one subsequent sync. It may receive later documents; classify new MARK separately and verify no duplicate of existing MARK. Do not replay a payment, sale or finalized purchase to repair evidence.
