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

## PR2065 independent evidence review and full-CI follow-up

Preparation run38041734894 SUCCESS. Downloaded artifact11665463479 ZIP SHA256 `4b5eb1d2f2f746abe2125f52998f6945201b81ec95055d90e83efc14e5f674c0`; contained revision `a9765e99be60d936cf14e6c27180e7bb74c3d00d` matches initial PR2065 head. Independently read Node20 focused log:54 PASS/0 FAIL/0 SKIP and Work frontend build PASS. Twelve canonical navigation subcases,9 navigation helpers,8 protected mounted selection subcases,8 selection helpers,15 original phase checks and2 enclosing mounted tests. Initial preparation38041467521 stopped at an end-of-file paragraph assumption in pending-roadmap insertion before test execution; corrected without replacing concurrent owners' text. Temporary files are absent from the final PR tree.

Initial normal full CI38041830479 failed in the server suite. The source assertion in `server/test/workforce-v2-rules-shift-templates.test.js` required an unconditional `companies={data?.companies||[]}` substring. N40 intentionally narrows only Twin-origin Workforce entry, while preserving that full list for ordinary central entry. Updated the assertion to check the actual Workforce mount, both branches of that contract and its guarded request; no test is skipped, deleted or disabled. Added a mounted central-Workforce regression: both stores available, changing A to B reads the corresponding existing module endpoint, normal close does not reopen the Twin, manual reopen retains B. The existing scoped Workforce test still requires only B. Workforce business code, server permission/module gates and original rule tests are unchanged.

Local Node22 rerun of the five N40/phase suites plus all seven Workforce rule/template tests:62 PASS/0 FAIL/0 SKIP. This is local synthetic evidence only. Supported Node20 full normal CI must run again on the final updated head and succeed through build, invariants and isolated PostgreSQL/HTTP E2E before merge. Full N40 remains OPEN / AWAITING LAB; exact release and authenticated real-browser six-tile/support-return acceptance are NOT TESTED. No new manual PASS or production-data mutation.


## Explicit canonical Workforce entry modes

Full CI38042410725 remained failed with one legacy Workforce source assertion demanding the literal central companies prop. Its logged employee-rules-shifts filename could not be resolved through repository reads; no generated-file cause is established. The actual canonical central entry now remains an explicit unchanged JSX branch with all authorized companies, while a mutually exclusive Twin-origin branch receives only the exact pair and guarded request. This is executable behavior, not a comment added to satisfy a pattern. The existing mounted tests verify both real entry paths. No test is skipped or removed, no business/permission implementation changed. Local Node22 rerun62 PASS/0 FAIL/0 SKIP. Normal full CI still required on the resulting exact head; overall N40 OPEN and authenticated LAB NOT TESTED.
