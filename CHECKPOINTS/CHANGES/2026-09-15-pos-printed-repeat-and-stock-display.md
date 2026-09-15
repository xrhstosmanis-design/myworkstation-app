# POS printed repeat and stock display

- LAB `ΔΑ0011467` after PR #860 has one canonical six-line draft and consistent inside/outside totals, but misses the genuinely repeated `FR1500` charge (`134.06/134.07 €`).
- Repeated-row recovery now uses the complete provider plus local OCR text instead of the already-deduplicated structured result.
- Versioned reread strategy `PRINTED_REPEAT_V2` safely reclaims this existing mismatched draft once after deployment.
- Purchase review displays warehouse quantity (`108000 g`, `2000 g`, `1000 g`, packages x `100 τμχ`) while preserving invoice quantity in the financial model and tooltip.
- No payment, credit, stock movement, approval, invoicing or finalization behavior changed.
- Targeted tests: 47/47 PASS.

