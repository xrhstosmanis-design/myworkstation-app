# MANTZILAS row identity guard — 2026-09-17

## LAB evidence

- Invoice `12665` returned 18 lines but a later focused reread moved economics between neighboring rows.
- The visible failures included code `0168` changing from printed net `9.60 EUR` / gross `11.90 EUR` to net `3.20 EUR` / gross `3.97 EUR`, while code `00009` retained the adjacent package economics.
- The affected draft remained in recovery and was not approved, finalized, posted to stock, or paid again.

## Root cause and bounded change

- The focused reread required 18 accepted candidates but did not prove that they represented 18 unique rows.
- Every reread candidate now carries the printed supplier code and is accepted only when both its index and supplier code identify the same unique source row.
- Duplicate or shifted row identities make the whole focused batch incomplete and restore the original lines atomically.
- A source-column-verified line also keeps its verified gross total; a candidate carrying a neighboring row's gross total is rejected before mutation.

## Safety and LAB acceptance

- Payment, credit, stock posting, approval, finalization, fiscal and accounting behavior are unchanged.
- PASS requires all 18 unique codes, invoice gross `429.27 EUR` within `0.05 EUR`, code `0168` net `9.60 EUR` / gross `11.90 EUR`, and code `00009` printed quantity `1 KIB`, stock quantity `24`, discount `31%` / `6.06 EUR`, net `13.49 EUR`.
- Codes `13192` and `433` must each have stock quantity `12`; code `02410` must have stock quantity `24`.
