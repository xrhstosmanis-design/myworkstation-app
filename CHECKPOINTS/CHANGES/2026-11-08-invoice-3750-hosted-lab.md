# #3750 — Hosted LAB issuer VAT conflict safeguard

2026-11-08 Europe/Athens · #3688 · /root. PR CI 42524289024 and main CI 42525685396 passed. Live Render `dep-dboes8bl550s739h8260` on `5ba8cf64828311d5d58023f7845a342d446d5e01`.

Two fresh synthetic photo pairs were selected once each in reverse page order in MYWORKSTATION LAB BackOffice. Case 31 printed the same issuer VAT on both images. The catalog supplier matching that VAT was selected, despite the synthetic issuer name printed on the fixture. Case 32 printed two different issuer VATs. The supplier stayed unselected, an issuer-VAT review prompt appeared, and the new-supplier form was absent. Explicit selection of the known supplier then worked. No submission, supplier creation or payment was performed.

Both reads filled the printed number, date and 496.00 EUR. UI observation 11.389 s and 8.880 s. Two FAST requests per pair: 4.308/5.114 s and 4.228/3.706 s. Baseline commits `a756f08` and `f712ed0`. Ten scoped table counts/digests, active shifts and wallet matched before/after in LAB and N40 CONTROL. Four consumed images.

Scoped PASS for consistent VAT, conflict review and subsequent manual selection. This is not independent verification of a lone OCR VAT against the original. Real-photo accuracy and physical POS remain open.
