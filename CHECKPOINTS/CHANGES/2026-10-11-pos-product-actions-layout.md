# POS product-actions dialog — 11 October 2026

## 11/10/2026 — POS-PRODUCT-ACTIONS-LAYOUT-01 / ASSIGNED / USER FAIL, geometry acceptance OPEN

Owner `codex/pos-product-actions-layout-20261011`; branch `fix/pos-product-actions-layout-20261011`. Independent presentation subtask of installation tracker03: only the product-actions dialog opened by tapping a cart item (including entry to returns). No33/tracker35 owner and permissions/return transaction acceptance remain unchanged; scanner, fiscal, shift, catalog/DAILY, server/session and all other assignments/PASS preserved.

Owner supplied photograph `image-1791695113014.jpg` at11Oct08:06Athens and reported missing options when tapping the item in returns. USER FAIL for visible completeness; exact physical client revision/viewport/zoom and enabled operator permissions NOT CAPTURED. Photo labels are partly obscured by glare; do not infer an authorization defect or missing business action. Source baseline main8f5b7ac: the dialog has three direct children (header, product facts, actions), but inherits only two explicit grid rows `auto minmax(0,1fr)` and hidden overflow. Product facts have no dedicated layout/wrapping rules. This is a bounded source layout defect; isolated browser geometry NOT TESTED yet.

Intended correction: scope a header plus one scrollable body to this dialog, render six facts with wrapping and explicit contrast, retain original four action buttons/order/handlers and existing runtime permission selectors. Touch scrolling and close control must remain reachable at1024x600/1280x720/1366x768, enlarged text and narrow screens; no zoom workaround. No production data, permissions, return/VOID/exchange, sale/payment/stock/shift or fiscal submission. Preserve earlier return/manual PASS without repeating transactions.

Required completion: full green PR/main CI and guarded exact deployment; then non-transactional physical inspection of the dialog at ordinary zoom with all permitted options readable/reachable. Local/source or CI alone is AWAITING LAB, never physical PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-11-pos-product-actions-layout.md`. Claim must merge before source edit. Assignment retained until actual acceptance or named handoff.

