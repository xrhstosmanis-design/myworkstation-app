# 25/11/2026 — Inline category and subcategory sales details

Owner /root, branch fix/financial-category-inline. Follow-up to #4231 from the owner screenshot of Αχαρνών 309. Clicking a category or subcategory inserts its sold products immediately below the selected row, with quantities, sales value and average units per day. Clicking again collapses it. Existing selected-store request, dates, permissions and supplier/item views stay in place.

Local evidence: JSX/CSS bundle passed, mounted React test with synthetic responses verified inline loading and products, category switch while the old request is pending, late-response suppression and collapse. Hosted LAB acceptance remains untested. No production store records modified.
