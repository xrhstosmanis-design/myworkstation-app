# POS exact-gap row and stock-unit reread

The POS-linked draft `ΔΑ0011467` remained short by 134.06 €, exactly one FR1500
gross charge, although the independent OCR text layer exposed the supplier code only
once. Coffee and chocolate showed current gram conversion, while cup descriptions
containing `100 TEM` still displayed raw invoice quantities.

The recovery now permits one omitted-row restoration only when exactly one existing
line has a gross amount equal to the positive invoice-total gap. Multiple candidates
remain untouched. A new versioned reread replaces the same DRAFT lines atomically and
reapplies description-based stock units.

No payment is created or changed. No stock is posted, and the purchase remains a draft
requiring review.
