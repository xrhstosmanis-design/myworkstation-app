## 17/11/2026 — POS-PACK-STOCK-01 / POS-SCAN-RETURN-01 — IMPLEMENTED / AWAITING CI + MERGE + LAB

Owner /root; source branch `feat/pos-packs-cash-returns`; PR #4006. Documentation claims #4001/#4005 are merged. The earlier foundation-only entry is superseded for implementation scope, retained as history.

Implemented: distinct sale products with store-specific prices and store-scoped base-product/units mapping; POS catalog availability from base units; shared stock posting used by ordinary POS/RBS/ftext finalizers; frozen line composition for historical returns; package-aware exchange/waste paths; DB guard against writing independent package stock. Scanned cart → Return → cash confirmation → Finish records stock, negative cash payment/shift entry and audit atomically. No original receipt selection or replacement purchase, no card/EFTPOS refund and no duplicate miscellaneous expense. Persistent request identity, replay and cancellation tombstones reconcile uncertain responses. Permissions, store/company/terminal/shift and authoritative price checks remain server-side.

Validation: Node 20.20.2 + isolated local PostgreSQL 18.6 expanded targeted suite: 25 PASS, 0 FAIL, 0 SKIP. Native delegated cancellation and baking regressions also passed; the source-evaluating delegated cancellation fixture now supplies the real package helper dependency, preserving all its permission/fiscal/terminal assertions. It measured 24/6 stock, loose+pack aggregation, per-store prices, cash-only refund with original card payment/control terminal unchanged, concurrent retry, cancellation, changed price rejection, rollback, package stock guard and exact original-line restoration. Mounted React test covered confirmation, double click, lost-response reload and identical request replay. Frontend build passed. Broad local suite was interrupted after independent Chromium ECONNRESET/environment failures; no full-suite PASS claimed. Exact PR CI, deployed-revision verification and real LAB remain pending.

Automatic recipe records are checked directly, including stale false recipe flags, so a scanned refund or package never restores fictitious ingredient/recipe stock. The expanded 25-test native suite was rerun successfully after this guard.

Package stock-guard bootstrap is atomic and idempotent: it does not drop an installed trigger while other requests may run. Native replay of the schema setup leaves exactly one effective guard.

CI 44167183328 reached 6,113 tests: 6,109 passed and four catalog fixture closures lacked the newly imported packageCatalog helper. The fixture now injects the real helper into all three actual catalog handlers; its complete 26,656-product native/read-only assertions pass unchanged. The isolated browser job independently timed out at CDP Target.createTarget after app readiness; no wholesale assertion was weakened.

User requests one grouped acceptance session at the end; no repeated POS/Owner/Super Admin switching. No live products, stock, cash, cards, fiscal commands, charge or external message changed. No functional LAB PASS/manual closure claimed. Source merge/deploy awaits owner approval after required checks.

Checkpoint: `CHECKPOINTS/CHANGES/2026-11-17-pos-packs-cash-returns-implementation.md`. Scope/remaining grouped acceptance: `docs/roadmap/POS_PACKS_RETURNS_2026-11-17.md`.


Previous assignment: [claim checkpoint](../../CHECKPOINTS/CHANGES/2026-11-17-pos-packs-scan-returns-claim.md). Detailed implementation and grouped acceptance: [implementation checkpoint](../../CHECKPOINTS/CHANGES/2026-11-17-pos-packs-cash-returns-implementation.md).

Historical central registries remain intact: [OPEN_WORK_TRACKER.md](OPEN_WORK_TRACKER.md), [PENDING_WORK.md](PENDING_WORK.md).
