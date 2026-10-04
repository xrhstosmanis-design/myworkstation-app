# 04/10/2026 — TODAY-04 dynamic bulk-price preview label

Status: IMPLEMENTED / AWAITING CI / LIVE / USER ACCEPTANCE.

Observed failure: React summary correctly showed one selected product and one selected store, while the enhanced submit button remained at 0 products × 0 stores. Root cause was installBulkPricePreview.enhance assigning button.textContent, which removed the React-managed dynamic text nodes.

Bounded correction: change only the leading static text node from «Εφαρμογή» to «Προεπισκόπηση». React retains ownership of the product/store counters, so later selections continue to update the label.

No price API, preview calculation, product/store selection, commit payload or final-apply behavior is changed. No price commit was executed. TODAY-04 cannot be PASS until CI, LIVE and USER visual acceptance.
