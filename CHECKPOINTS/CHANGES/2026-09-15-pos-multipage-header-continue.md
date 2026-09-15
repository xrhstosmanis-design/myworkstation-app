# 2026-09-15 — Continue multi-page POS header reading

## LAB evidence

Selecting the two pages of invoice 2612188 in back-to-front filename order (`1-2`, then `1-1`) produced an internal error and no supplier, document number, date or total. The fast header loop aborted on the continuation page before reaching the actual first page.

## Change

- Read each selected header candidate independently.
- Preserve successful header results even if another page has no usable header or its provider call fails.
- Fail the selection only when every candidate page fails.
- Merge supplier/document/total fields from all successful candidates.
- Add regression coverage for a failed continuation page followed by a valid front page.

## Safety

This happens before payment or durable handoff. It cannot create an invoice, payment, stock movement, approval or finalization.
