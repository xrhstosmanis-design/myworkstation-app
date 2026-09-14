# Gate 3 — POS automatic reread of incomplete invoice lines

- The normal POS status poll, not a BackOffice refresh, now claims a completed draft whose line total still has a reconciliation mismatch.
- The POS keeps polling while the original durable pages receive one safe full reread.
- The existing guarded replacement path keeps the same draft, photos and payment and accepts only a reconciled or strictly improved result.
- No manual BackOffice trigger, new payment, credit, stock update, approval or finalization is introduced.

LAB acceptance starts at the POS with the invoice pages and ends automatically with 38 lines / 608 pieces / 2.369,99 € in the BackOffice draft.
