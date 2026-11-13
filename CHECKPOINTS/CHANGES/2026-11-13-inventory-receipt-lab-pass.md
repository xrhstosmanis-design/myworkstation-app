# 13/11/2026 — Hosted LAB evidence for inventory purchase document links

Source PRs #3852 and #3856. Render deployment `dep-dbrma4psrm7s73egvrf0`, revision `fbc7167ef554fc902a449e99c2b0efac9d7c9528`, live at 21:31:05 Europe/Athens.

Existing MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, cloud browser Backoffice, Super Admin support view. No POS payment or physical terminal involved. The baseline finalized free count `LAB-3852-RECEIPT-BEFORE` at 20:49:22 was 8 for synthetic SKU `LAB-3645-ALIAS-A`. The standalone OCR document `LAB-3852-RECEIPT-01` (4.96 EUR) showed AWAITING_APPROVAL. One stock approval changed it to CONFIRMED. A fresh inventory search showed stock 10 before the operator entered the after count. `LAB-3852-RECEIPT-AFTER` was finalized with a count of 10.

Full Audit, previous-count comparison and the expanded SKU movement showed PURCHASE +2 (8 → 10) at 21:32:40 Europe/Athens, document number `LAB-3852-RECEIPT-01` and source ID `cms1k1bje001xhn3xulr0rooz`. Net difference: 0 units / 0 EUR. Scoped hosted LAB PASS for the standalone OCR approval and its linked purchase movement in the comparison.

The movement's physical timestamp was shown as unknown. Physical delivery time, verified original bytes, alternate purchase/credit paths, role isolation and export parity were not tested by this scenario.
