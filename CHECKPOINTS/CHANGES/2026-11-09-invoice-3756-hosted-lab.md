# #3756 — Hosted LAB issuer and recipient VAT review

2026-11-09 Europe/Athens · #3688 · /root. PR CI 42587871750 passed, main CI 42589629902 and guarded Render deploy `dep-dboordlg1s2s73ft04ag`. Tested live revision `52eb8eefc174a28ccd1036fe855ce93ce99572c4`.

Two fresh synthetic images were selected once each in MYWORKSTATION LAB BackOffice, without submission.

| Case | Printed VATs | Observed supplier behavior | UI observation | Server |
| --- | --- | --- | --- | --- |
| 41 | Distinct vendor and recipient VAT | Catalog supplier selected by issuer VAT | 6.750 s | 4.372 s |
| 42 | Same vendor and recipient VAT | Supplier blank, recipient review message, no new-supplier form | 13.497 s | 11.186 s |

Both retained the expected number, date and 496.00 EUR. Each used one FAST request with Azure stages and no OpenAI stage. Credit submission remained disabled in both forms. No payment, supplier creation, invoice submission, stock or fiscal action.

Baseline commits `7789e05` and `a2e420f`. All ten scoped table counts/digests, active shifts and wallet matched before/after in LAB and N40 CONTROL. Both images consumed.

Scoped PASS for the observed VAT contradiction and matching control. Unknown or unrelated misread VAT, real-photo repeatability and physical POS remain open.
