# #3688 — LAB retest on two previously supplied real photo pairs

2026-11-09 Europe/Athens · /root · runtime health revision before trial `932e745d71d7fddca64b150562490694f693c401`. User explicitly authorized replay of the supplied images in LAB. Hosted BackOffice only.

Expected from the printed originals: Mouchalis, issuer VAT 999211633, issue date 2026-11-05, invoice 172950 payable EUR 487.68 and invoice 172949 payable EUR 4047.97.

| Trial | UI observation | FAST spans | Outcome |
| --- | ---: | --- | --- |
| 172950 original JPEG pair | 23.862 s | 10.726 / 9.955 s | Supplier, number and amount blank with conflict warnings; date correct |
| 172949 original JPEG pair | 45.739 s | 19.329 / 22.674 s | Number and amount blank; wrong issuer VAT suggested and date 2025-11-05 |
| 172950 original JPEGs wrapped in a two-page PDF | 4.521 s | 3.920 s | Wrong supplier VAT, number, date and amount; returned 4047.97 |
| 172949 original JPEGs wrapped in a two-page PDF | 2.912 s | 2.361 s | Full PDF payable unverified; form did not fill header |
| 172950 perspective-corrected JPEGs limited to each sheet | 26.120 s | 18.184 / 5.355 s | Correct supplier and date; number and amount blank with conflict warnings |
| 172949 perspective-corrected JPEGs limited to each sheet | 35.943 s | 22.458 / 11.545 s | Correct date; supplier and number blank, wrong amount 1193.87 |

No trial achieved all four correct header fields. UI times include upload and browser observation; the trials are not a performance benchmark. PDF wrappers used both original images in printed page order. Crops were inspected before upload. The trials show observed behavior only, not a proven provider-level cause or a regression comparison under identical conditions.

Before/after comparisons for each trial matched all scoped table counts/digests, active shifts and wallet in LAB and N40 CONTROL. UTC snapshot windows: 2026-11-09T14:14:34.831189Z to 2026-11-09T14:15:28.810284Z; 2026-11-09T14:15:47.260397Z to 2026-11-09T14:16:47.713446Z; 2026-11-09T14:17:20.789462Z to 2026-11-09T14:17:50.692208Z; 2026-11-09T14:18:04.80826Z to 2026-11-09T14:18:25.615439Z; 2026-11-09T14:19:18.893273Z to 2026-11-09T14:19:56.455841Z; 2026-11-09T14:20:10.183196Z to 2026-11-09T14:21:01.017431Z. No submission, payment, supplier creation, stock or fiscal action.

Real-photo automatic header acceptance: FAIL for these two examples. Existing conflict safeguards provided partial protection. A remaining issue is accepting an uncorroborated positive amount or issuer when other page evidence is missing or conflicting. Any source follow-up should use a separate claim and verify label/role provenance, keeping single-page and manual flows under test. Physical POS remains open.
