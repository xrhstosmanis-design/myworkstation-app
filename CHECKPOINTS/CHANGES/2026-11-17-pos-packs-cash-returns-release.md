# POS packages and scanned cash returns — released, grouped LAB pending

User approved source merge and deployment. PR #4006 merged to main as `a7bb1c4c00662118dc0c5e794172ca6e3817b0d2`.

- PR CI [44170419099](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44170419099): 6,113 PASS / 0 FAIL / 0 SKIP; all required jobs passed.
- Main CI [44183245449](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44183245449), attempt 2: all five jobs passed; 6,170 PASS / 0 FAIL / 1 SKIP, plus 8 backup-monitor PASS. Attempt 1 encountered three unrelated Chromium startup/CDP failures; the failed job was rerun without source changes.
- Guarded Render deployment [44188819828](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44188819828): classification, full-CI/freshness preflight, rollback checkpoint, deployment trigger and exact-production-revision wait all passed.
- Public `/api/health` returned `ok:true`, version `0.22.0+kat-test-pos`, exact revision `a7bb1c4c00662118dc0c5e794172ca6e3817b0d2` after deployment. Served `/assets/entry-WTS0n_Zn.js` contains both `cash-returns/quote` and `stock-package?storeId`, confirming the deployed client features.

Distinct pack sale products use each store's own price and consume 24 × 500ml or 6 × 1.5L base bottles. Direct scanned returns restore stock and reduce current-terminal cash atomically, with persisted replay/cancellation protection. Original card totals remain unchanged. Existing original-sale/special-product return flows and permissions are preserved.

No real store sale, return, stock adjustment, cash/card movement, fiscal command or LAB acceptance action was performed. Automated CI and public release verification are not functional LAB PASS. Both scopes remain open only for the user's grouped acceptance at the end, in the existing LAB, with Owner → POS → final Owner review and before/after stock, cash, card and control-terminal checks. Do not request repeated role switching now.

Implementation history: [implementation checkpoint](2026-11-17-pos-packs-cash-returns-implementation.md). Scope: [continuation](../../docs/roadmap/POS_PACKS_RETURNS_2026-11-17.md).
