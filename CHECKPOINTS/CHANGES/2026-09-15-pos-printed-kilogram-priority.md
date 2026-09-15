# POS printed kilogram priority

LAB invoice `ΔΑ0011467` prints a total quantity of 36 kilograms for the first
coffee line. The `3KGR` text describes the package and must not multiply the
already-weighted quantity. Printed KG/KGR/ΚΙΛΑ now takes precedence and converts
the invoice quantity once to grams (`36 × 1000 = 36,000 g`). Piece/package rules
remain unchanged. The same POS draft is eligible for one versioned safe reread.

No payment is created or altered, no stock is posted, and no draft is finalized.
