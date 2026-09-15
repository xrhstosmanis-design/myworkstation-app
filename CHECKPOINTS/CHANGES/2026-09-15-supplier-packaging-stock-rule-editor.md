# Supplier packaging and stock-rule editor — 2026-09-15

## Scope

Add central supplier/item rules in Invoice Learning for invoice units, stock conversion, and decimal discount precision.

## User-configurable rules

- Invoice unit: `ΤΜΧ`, `ΠΑΚΕΤΟ`, `ΚΒ`, or `ΚΙΛΟ`.
- Stock units per invoice unit: for example 12, 24, 100, or 1,000.
- Stock unit: `ΤΜΧ` or `ΓΡ`.
- Exact first discount, including decimals such as `34,25%`.

## Safety

Saving a rule changes no stock, accounting, payment, invoice, or approval state. The conversion is retained for a later re-read and only the existing explicit final approval may post stock.
