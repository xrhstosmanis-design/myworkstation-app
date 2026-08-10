# MyWorkStation checkpoint — 2026-08-10 23:45 Europe/Athens

## LIVE baseline

- PR #123: Διαχείριση → Κατηγορίες ειδών / Υποκατηγορίες, merge `38bca367a1f408373b710067f1076bc4169119f8`, Render SUCCESS.
- PR #124: Διαχείριση → Τμήματα ΦΠΑ, merge `09473891e293ccecb57b71f55d5d0b0928c289ed`, CI #173 SUCCESS, Render SUCCESS.

## Διαχείριση — Κατηγορίες ειδών

- Split view categories/subcategories.
- Category/subcategory edit, transfer, product drill-down, server pagination, CSV, bulk move, soft deactivate.
- Existing master catalog is not destructively rewritten; company-scoped ProductSubcategory mapping is used.
- Remaining management tabs stay unavailable until corresponding screenshots are provided.

## Διαχείριση — Τμήματα ΦΠΑ

Main grid:
- ΚΩΔ ΦΠΑ
- Τμήμα Ταμειακής
- Περιγραφή
- % ΦΠΑ
- Είδη
- Εμπορία
- ID

Actions:
- Description/pencil → `Διόρθωση τμήματος ΦΠΑ`.
- Barcode/item count → product list for the selected VAT department.
- Soft deactivate via trash.
- Bottom: Κλείσιμο, Ανανέωση, Νέα εγγραφή, Excel/CSV.

VAT edit fields:
- Περιγραφή
- ενεργό
- Τμήμα ταμειακής
- % ΦΠΑ
- Κωδικός
- Εμπορία
- Εξαίρεση ΦΠΑ configuration list based on supplied Kiosk screenshots.

Product drill-down:
- Περιγραφή είδους
- Λιανική
- Κατηγορία
- Υποκατηγορία
- Προμηθευτής
- Τμήμα ΦΠΑ
- Εσωτ. κωδ
- server pagination up to 200
- bottom: Επιστροφή, Ανανέωση, Excel/CSV, Ομαδική διόρθωση.

Data rules:
- Additive `ManagementVatDepartment` and `Product.vatDepartmentId`.
- Existing products are initially grouped from their real `Product.vatRate`; no fabricated Kiosk cash-register department numbers.
- Changing a VAT department rate updates assigned products' real `Product.vatRate` and marks VAT verified.
- Bulk assignment changes both `vatDepartmentId` and real `vatRate`.
- Latest supplier in drill-down comes from approved purchase history.
- Management access: SUPER_ADMIN / OWNER / ADMIN / MANAGER, behind INVENTORY module guard.

Anti-freeze / UI:
- No new MutationObserver for VAT management.
- Server pagination for product drill-down.
- Structural colors remain MyWorkStation navy `#123b5d` / teal `#0f766e`.
- Global touch keyboard continues to cover text/number fields.

## Next

Continue with the next screenshots of the `Διαχείριση` tabs. Do not recreate PR #123/#124 work. Keep Kiosk screenshots as functional references, not color references.
