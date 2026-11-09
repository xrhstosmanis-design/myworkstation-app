# 09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / QR/PIN stocktake finalization

Retained owner /root. User requests final submission by the stocktake-link counter. Existing QR/PIN grant authorizes counting, while finalize requires owner/admin or delegated inventory.finalize.

Proposed scope: explicit owner opt-in on an unzoned stocktake grant, default off including legacy grants; verify active grant, exact company/store/stocktake, expiry/revocation and draft inside the finalization transaction. Present an explicit confirmation and reuse existing finalization rules, stock movement and audit handling. Check incomplete full counts, free counts, duplicate submission and unauthorized grants before live rollout. No production authorization or stock change.
