## 2026-11-10T18:03:36+02:00 — INVENTORY-CATALOG-XLSX-01 / ASSIGNED BEFORE SOURCE

Owner /root; branch `feat/inventory-catalog-xlsx-20261110`; issue [#3798](https://github.com/xrhstosmanis-design/myworkstation-app/issues/3798); checkpoint `CHECKPOINTS/CHANGES/2026-11-10-inventory-catalog-xlsx.md`.

Scope: true XLSX from the current store's product catalog, either all products across pages or checked products across pages. Preserve existing action selection, store scope and read permissions. Include text SKU and all barcode aliases, description, category/subcategory, VAT department, retail price and current stock. Independent of INVENTORY-RECONCILIATION-01 count reports and review. Validate in existing LAB, then check Acharnon 309 read-only. Source and LAB pending.

## Υλοποίηση — LAB NOT TESTED

Assignment merged in #3801 at `13fa0b9`. The store archive now exports all store products or a separate checkbox selection retained across pages. XLSX includes text SKU and barcode aliases, taxonomy, VAT, retail price, stock and active state. The read endpoint uses the existing owner, staff and POS inventory access checks and rejects selections outside the store.

Local verification: 21 existing structural tests passed. The picker test could not load esbuild in this checkout. CI and hosted LAB remain pending. LAB acceptance: verify workbook contents for all rows and a selection spanning two pages, leading-zero identifiers, alternate barcodes, and store isolation. Then verify Αχαρνών 309 read-only.
