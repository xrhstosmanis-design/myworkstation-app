# 30/09/2026 — RequestDocs string envelope · AWAITING CI / DEPLOY / USER

Owner: `codex/mydata-string-envelope-20260930`, continuation of the Diadochou installation. Independent inbound XML parsing scope; no OCR/Gate 3 or fiscal issuance work.

Before: production exact revision `08f532d3b0c088d4c20e880fe2d384164b0d6642`. Owner screenshot at 20:24 Greece reports zero inbound documents. Read-only database at approximately 20:33: correct company VAT and store, enabled PRODUCTION integration, inbound count 0. Credential screen hint is the account ID suffix, not the subscription key; the earlier suspicion of a swapped key is disproved.

Causal evidence: direct read-only AADE RequestDocs GET using the accountant email's company credentials and a single known MARK interval returned HTTP 200, 6,224 bytes, XML root `{http://schemas.microsoft.com/2003/10/Serialization/}string`. Decoding its escaped text yielded RequestedDoc, one invoice and the exact expected MARK. Current parser scans the outer encoded text and sees zero invoices. No entityVatNumber was required for this successful read; do not introduce that speculative change.

Change: unwrap only the .NET string envelope before error inspection, invoice parsing and continuation parsing. Direct XML remains unchanged. Invalid string contents throw rather than silently report zero. Company VAT filter, cursor/environment boundaries, company/MARK uniqueness, RECEIVED drafts and stockUpdated/fiscalTransmission false remain unchanged. No credentials, raw live XML or personal invoice content committed; tests use synthetic fixtures.

Acceptance pending: green CI, merge, exact Render revision, one authorized UI sync at the selected store, database readback of the expected inbox document and replay without duplicates. No payment, stock posting, finalization, fiscal transmission or production schema changes. Direct HTTP read is diagnostic evidence, not an application import PASS. Stock/payment delta NOT TESTED; no state-changing financial action executed.
