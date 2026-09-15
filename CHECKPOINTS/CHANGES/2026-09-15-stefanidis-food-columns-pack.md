# STEFANIDIS food invoice columns and stock packs

Date: 2026-09-15
PR: #854
Supplier VAT: 997763585
Reference invoice: 620889

## Verified target

- 20 physical product rows.
- Invoice total: 353.49 EUR.
- Printed net: 312.83 EUR; VAT: 40.66 EUR.
- Each recovered row must independently satisfy quantity × original unit price = pre-discount amount and pre-discount amount − printed discount = net amount.

## Stock rule

Invoice cartons remain the financial quantity. Explicit descriptions such as 12TMX and x14t supply the stock multiplier. Package rows without a clear multiplier remain unresolved/red and FINAL is blocked. Product sizes such as 250ml and 24x355ml are not treated as carton multipliers.

## Safety

This change does not create or alter a supplier payment. OCR remains a draft and stock changes only through the existing explicit finalization path.
