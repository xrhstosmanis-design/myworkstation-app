# 09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / QR/PIN count correction

Retained owner /root. User reports an existing count cannot be corrected from the Rizareio stocktake link. Proposed fix: expose a correction action for counted lines in a DRAFT, reuse the current scoped count endpoint with an absolute total, and retain expectedVersion and count audit. Ordinary scan entry stays additive. Verify correction including zero and stale versions before release. No live count has been edited.

QR/PIN count correction implemented in `5099e0dc`. Focused arithmetic check passed for 7 → 5, 7 → 9, 7 → 0 and additive 7 + 5 → 12. Full CI and live acceptance pending.
