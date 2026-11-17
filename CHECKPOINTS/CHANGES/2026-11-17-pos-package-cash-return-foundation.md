# POS package/cash-return planning foundation

## 17/11/2026 — POS-PACK-STOCK-01 / POS-SCAN-RETURN-01 — SOURCE FOUNDATION / NOT INTEGRATED
Owner /root; source branch feat/pos-packs-cash-returns. Approved documentation #4001 and #4005 merged. Shared cents/base-unit planning implemented, with four passing local tests under Node 24.22.1 (not Node20/CI/LAB proof). No runtime imports, UI, endpoint, schema or production behavior changed.
Remaining: store-scoped package editor and persistence; sale stock posting with frozen package composition; atomic scanned cash return with permission/terminal/shift validation, persisted request identity, cash/stock/audit, POS confirmation; historical returns and holds/offline/reporting compatibility; Node20/full CI and existing LAB before/after acceptance. No source merge/deploy authorized. Next action: implement store-scoped package persistence and use the shared plan in atomic sale/return services.

Protected behavior: all production flows unchanged because the module is not wired into runtime. Tests exercise mixed loose/pack stock, per-store exact prices, 24/6 conversion, fractional weighed returns, unchanged card totals, invalid precision/units/self-links.
