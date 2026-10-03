# RBS CARD server finalization after YES

Date: 2026-10-03

Real CARD test reached OPERATOR_CONFIRMED after successful EFTPOS payment and operator YES but remained saleId NULL. The authoritative operator outcome endpoint now finalizes confirmed CARD server-side in one transaction: Sale/SaleLine, CARD Payment, exact-shift SALE_CARD, stock/StockMovement, audit, then SALE_COMMITTED. No fiscal/EFTPOS resend occurs.
