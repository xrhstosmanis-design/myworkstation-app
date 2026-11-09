# #3688 — Multi-photo FAST header LAB replay

2026-11-09 Europe/Athens · /root · LAB in cloud browser · physical POS NOT TESTED.

The #3777 runtime files were verified unchanged at live revision `3c6778b3a93eba9ed9158c9eb5487caaa5bc62a2` (Render `dep-dbou5uvf3r2c73catte0`, CI 42639405354).

| Input (two photos in order) | Visible result | Selection to result | Server OCR per image |
| --- | --- | ---: | ---: |
| Synthetic 51, sole unverified 120.00 EUR candidate | Blank amount, explicit payable review warning. LAB PASS for withholding. | 19.48 s | 12.81 / 5.07 s |
| Synthetic 52, verified 496.00 EUR payable | 496.00 EUR auto-filled. LAB PASS for verified amount. | 19.65 s | 7.88 / 9.15 s |
| Real Mouchalis 172949, perspective-cropped replay | Previous wrong 1,193.87 EUR absent. Amount, supplier and number blank, conflicts on supplier and number. Date 2026-11-05 correct. LAB FAIL for complete correct header, expected payable 4,047.97 EUR. | 30.39 s | 10.73 / 17.32 s |

Selection to result is browser wall time from selecting the image pair until first observed completed form. Server timings are separate FAST header logs. Prior real 172950 results remain as recorded in #3773. Neither speed stability on real photos nor physical POS is verified. #3688 remains open.

No form submission, supplier creation or payment. Before/after read-only checks showed no changes across scoped business tables, wallet and shifts in LAB and N40 CONTROL for the three runs. No original invoice images or raw OCR data are attached.
