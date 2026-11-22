# #3733 — Hosted LAB acceptance for conflicting photo totals

2026-11-08 Europe/Athens · owner /root · #3688 · source PR #3733.

PR CI 42511145942 passed after replacing the obsolete one-argument call assertion and reconciling current main. Main merge `12326cc7b8c4701a18c54da5f84afab89e9b26f3`, main CI 42512352523, Render deploy `dep-dbocgrnf3r2c73apaia0`. The tested healthy live descendant was `8ec3f63d6155c7c1c33a5153d388b3feab12576e`. Git comparison showed identical form, merge, FAST route and payable parser across the two revisions.

Three fresh synthetic two-image samples, selected once each in the hosted MYWORKSTATION LAB BackOffice, with no submission:

| Invoice suffix | Selection order | Observed payable | UI observation | Server request durations |
| --- | --- | --- | --- | --- |
| 11 | 1 → 2 | 496.00 EUR | 11.615 s | 5.662 s, 3.752 s |
| 12 | 2 → 1 | 496.00 EUR | 11.889 s | 5.652 s, 3.744 s |
| 13 | 2 → 1 | Blank, review prompt, credit submission disabled | 13.808 s | 7.269 s, 3.777 s |

Samples 11 and 12 have a 120.00 subtotal and a balanced net 400.00 + VAT 96.00 = payable 496.00. Sample 13 has competing values without that evidence. All three showed the expected synthetic issuer, number and date. UI observation includes upload and browser polling. The two server spans per sample are observations, not performance targets.

Baseline commits `756e3c8`, `3b4ec71`, `3190808`. In all three before/after comparisons, the ten scoped table counts/digests, active shifts and wallet matched in both LAB and N40 CONTROL. UTC snapshot windows: 2026-11-08T19:18:04.925449Z to 2026-11-08T19:19:00.907666Z; 2026-11-08T19:19:35.023788Z to 2026-11-08T19:19:58.922274Z; 2026-11-08T19:20:13.266774Z to 2026-11-08T19:20:39.989356Z. No payment, draft submission, stock or fiscal action. All six images are consumed.

Scoped PASS for the two ordering cases and the conflict prompt only. Physical POS, stability with real photos, and the separate invoice number and supplier VAT discrepancies remain open.
