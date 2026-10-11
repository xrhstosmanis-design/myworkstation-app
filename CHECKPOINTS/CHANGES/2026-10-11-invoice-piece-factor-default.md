# Invoice piece factor — 2026-10-11

PR #2310: blank per-piece factor defaults to 1 only when invoice unit is PIECE. Package factors still require verification. User-reported failure on existing 12-line draft; physical acceptance pending. No payment, stock, or finalization testing. CI and deployment pending.

USER FAIL detail: invoice 142730, 12 selected lines, printed payable 678.28 EUR, working total 678.31 EUR; successive PIECE rows blocked by blank stockUnitsPerInvoiceUnit. Existing draft only; no reupload, payment, stock, fiscal or finalization. CI and same-draft USER acceptance still pending.
