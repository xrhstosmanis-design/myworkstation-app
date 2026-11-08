# #3740 — Hosted LAB invoice-number safeguard

2026-11-08 Europe/Athens · #3688 · /root · live source `3109eb10fb1121ae4b74bbda9825e53f94b078a1`. PR CI 42515088333 and main CI 42517140006 passed. Render deploy `dep-dbodilk9v7es73evfg10` live.

Two new synthetic photo pairs selected once each, both in order 2 → 1, in MYWORKSTATION LAB BackOffice. No writes were requested.

| Sample | Printed references | Observed number | UI observation | Server requests |
| --- | --- | --- | --- | --- |
| 21 | Same number on both pages plus separate MARK and related reference | LAB-3740-20261108-21 | 15.089 s | 5.656 s, 6.484 s |
| 22 | Deliberately different invoice numbers ending 22 and 23 | Blank and review message | 15.168 s | 4.240 s, 7.790 s |

Supplier and date matched in both. Both left the amount blank and asked for payable review. These fixtures printed a percentage before the VAT amount, and the payable proof was not observed. The exact OCR inputs to the amount parser were not captured. Credit submission remained disabled. No payment, submission, stock or fiscal action.

Before/after LAB and N40 CONTROL matched across ten scoped table counts/digests, shifts and wallet. Baseline commits `586b288` and `45fa792`. UTC windows 20:26:37–20:27:25 and 20:27:44–20:28:14. Four consumed images.

Scoped PASS for the agreeing printed number and conflicting-number review. Single OCR candidate validation, real-photo accuracy, issuer VAT and physical POS remain open.
