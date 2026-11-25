## 25/11/2026 — Netlink central catalogue and report printing

ASSIGNED /root; continuation of existing Netlink ownership. Branch fix/netlink-catalogue-tabs-20261125. Owner requests a common POS correction for every store and an explicit print button for the selected internal report. No store identifiers or credentials are published.

Observed: connection check succeeds but catalogue shows zero services. Provider responds with data.tabs[].groups[]; current panel only reads groups. Internal reports are MyWorkStation ledger, not provider identity statements. Print is currently absent. Existing source baseline85423aa. No card, PIN, charge, stock, fiscal or database mutation.

Bounded next work: shared catalogue adapter and read-only selected-report print UI plus meaningful mounted regressions. Preserve direct groups support, store/unmount/late-response fences, all server auth/module/demo/fiscal/execute/idempotency gates. No provider report endpoint is invented. Full source CI and real rendered verification remain required; no LAB/LIVE feature PASS or deployment claimed. Existing certification scope stays externally blocked. Trackers remain under same /root ownership; oversized histories are not transferred through connector.
