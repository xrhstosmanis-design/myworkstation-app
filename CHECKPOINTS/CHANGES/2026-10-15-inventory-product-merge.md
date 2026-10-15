
## 15/10/2026 — INVENTORY-MERGE-01 / ASSIGNED / NOT TESTED

Owner feat/inventory-bulk-vat-20261015; user expands request to explicit 2–4 selected cards into one survivor. Independent from invoice merge. Preview required; preserve historical IDs, no DELETE of products or invoice/sale history. Restrict first delivery to products exclusive to selected store; reject other-store associations, incompatible units/VAT, composition, open drafts/counts or nonstandard barcode mappings. Move eligible barcodes/supplier links and net stock with paired audited stock movements; archive sources in selected store only, no payment/fiscal posting. Native transactional/retry/conflict tests required. No actual real-store merge until user chooses survivor and confirms preview. Scope remains NOT TESTED.

