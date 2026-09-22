# Workforce V2 date-only timezone fix — 2026-09-22

## LAB evidence

Ο κανόνας της Νωπής συμπληρώθηκε με ημερομηνία έναρξης **22/09/2026**, αλλά μετά την επιβεβαίωση εμφανίστηκε ως **2026-09-21**.

## Root cause

Το client δημιουργούσε ISO timestamp από τοπικά μεσάνυχτα (`YYYY-MM-DDT00:00:00`). Σε θετική ζώνη ώρας, όπως η Ελλάδα, η μετατροπή σε UTC μετακινούσε το timestamp στην προηγούμενη ημερολογιακή ημέρα.

## Fix

- Date-only έναρξη: `YYYY-MM-DDT00:00:00.000Z`.
- Date-only λήξη: `YYYY-MM-DDT23:59:59.999Z`.
- Η ίδια ασφαλής μετατροπή εφαρμόζεται στους κανόνες και στην ημερομηνία ισχύος εργαζομένου.
- Οι κενές προαιρετικές ημερομηνίες παραμένουν `null`.

## Verification

- `node --test test/workforce-v2-date-only.test.js` — PASS (2/2).
- `npm run build -w client` — PASS.
- Εκκρεμεί πράσινο CI, merge, deploy και νέα πραγματική LAB δοκιμή.
