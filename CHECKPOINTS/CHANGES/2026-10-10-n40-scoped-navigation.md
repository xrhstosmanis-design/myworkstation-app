# N40 — scoped canonical destinations and origin-aware return

Date: 10/10/2026 Europe/Athens. Same logical owner `codex/n40-full-twin-navigation-audit-20261010`; source continuation branch `fix/n40-twin-navigation-20261010`.

## Pre-change evidence and protected scope

Claim PR2040 is already merged0618764a; selection guard PR2046 merged4e1d6673 after fullCI38036849847 SUCCESS; handoff PR2047 merged d8999161. Current source reviewed from main2e59bfb6, including AGENTS, current tracker/active/pending/checklist N40 records, all relevant AI Command Center checkpoints and super-admin manual. Relevant navigation history since phase14 production22f1914b is exported in short-lived artifact11664619966. No newer N40 LIVE/LAB acceptance exists in these records. Visual phases1–14, original exact-pair selection/remount retention, central screen entry, existing support-token exchange and all other owners remain protected.

The branch-local source-review workflow only exported tracked files and commit history; it does not alter main or production. Local GitHub DNS is unavailable. Prepared source is applied with exact anchors in an isolated Node20 runner and the temporary preparation files are removed before PR review.

## Bounded implementation

Only the six Full Digital Twin tile transitions receive a dedicated origin-aware handler. POS preserves the canonical Checks destination; EFTPOS preserves the Cash report; Cash preserves its finding-dependent Cash/Checks/Supplier/Bank destination. Every route carries the exact company/store pair, resolved against current overview. Canonical Checks/Supplier/Bank screens accept an optional locked entryScope, including first read, refresh, date filters and Clear. Ordinary central entry retains its previous all-stores behavior. Cash report reads and shortages export use the selected store, including the top export button. No automatic analysis submission, email, payment, device command or business action is introduced.

Canonical modal close returns to the same Twin only for Twin-origin entries. Workforce offers only the originating store in that entry. Existing Video shell and business implementations are reused. Stock keeps the established support-access flow and canonical return to /platform-admin: a one-use, actor-bound, one-hour sessionStorage hint contains only company/store/user identifiers and creation time, never credentials, tokens or arbitrary redirect URLs. The support token exchange itself is unchanged.

Destination requests are checked before dispatch and after response against the current origin and current company/store availability. Close, reselection or removed context prevents stale responses from reopening a destination. Device overview reads are generation-guarded and keyed by the company/store pair. These are client navigation guards, not a replacement for server authorization. Existing server role/module/company/store checks are unchanged.

## Tests and limits

Local Node22 dependency-free navigation helper suite: 8 PASS, 0 FAIL. The protected selection helper suite: 8 PASS, 0 FAIL. Supported Node20 mounted tests, full CI, exact deployment, authenticated LAB, physical browser/support-return cycle and server role/module/revocation breadth are still NOT TESTED at this preparation checkpoint.

The new mounted regression test uses real PlatformAdminApp, AiCommandCenter and five canonical destination shells. APIs, nested business editors, downloads and the full-page browser navigation/return are fixtures. It covers six tile routes, finding-dependent Supplier/Bank routes, scoped initial/refresh/execute/export reads, automatic modal return, normal central entry, module denial, missing store, delayed response cancellation/reselection and a simulated Stock return. Any eventual synthetic PASS is not LIVE/LAB PASS. No production credentials or business-data writes are used by the test runner.

Full N40 remains OPEN / AWAITING LAB. No manual PASS entry. Final focused/CI evidence and remaining gaps must be recorded without re-running previous accepted transactions or touching other assigned business flows.

## Supported-runtime preparation

The isolated Node20 runner passed the new helper and mounted canonical navigation tests, protected selection suites and original phase regression suite, then the frontend Work build. Exact logs/counts and source revision are exported for independent review. This is synthetic component evidence; normal full repository CI and authenticated LAB remain required. No production secrets, data, support session or camera commands were used. Temporary preparation tooling is removed before PR review.
