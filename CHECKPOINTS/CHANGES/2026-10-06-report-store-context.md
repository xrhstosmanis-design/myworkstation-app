# Store-scoped reports — 06/10/2026

Owner: ASSIGNED fix/report-store-context-20261006, independent #34 report-context regression only.
Status: LOCAL TECHNICAL PASS / AWAITING CI, EXACT DEPLOY AND LAB. No new LAB fix PASS.

## Evidence and reconciliation before code

Owner image(20261006-183139).png shows parent store ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, report criteria Όλα τα καταστήματα and a separate Audit store selector. Owner reports other-store events (USER-reported FAIL). The screenshot does not expose each row's store identity; no independently verified cross-tenant leak or one-OUT count is claimed.

AGENTS, active history, reports manual, relevant report/Audit checkpoints, pending assignments and newest main were reviewed. Authoritative Gate7 PASS supersedes historical OPEN entries. Main652dd532 adds mandatory central-tracker publication before code. Claim PR1787/head35d3d556, exact docs CI4494/run37514528357 SUCCESS, merged2d8a187c22b2d162c51379bb80f653aaff2757bf before source editing. Other owners retained.

## Bounded causal implementation

CommerceHub exposes its selected store ID/name to the report installer. Store reports initialize from that context, have a single disabled store criterion, and never load global reports without a selected store. Audit prefers this bound context over stale supportStore URL or independent company/store datasets; conflicting Super Admin selectors are absent inside a store. Central Platform Audit is unchanged.

Reuse the existing guarded host observer, observing only the selected-store attribute in addition to child changes. Changing store discards the previous report root and report detail overlays, preserves selected report/date/search criteria and loads that report for the new store. Shared request-generation/context guards prevent late previous-store or superseded report responses from rendering or replacing current CSV rows. Base reports, Audit, sales, stock and delivery use this guard. No new observer or lookup across all stores.

## Verification

Node20.20.2 production client/server build PASS. Full local server suite1860 PASS/0 FAIL/4 SKIP (isolated database-dependent tests unavailable locally); remote full CI including PostgreSQL/HTTP E2E remains required. Focused reports/Audit regression46 PASS/0 FAIL. New actual-installers/jsdom coverage: initial selected-store requests, stale URL/company/store criteria, Audit search/refresh, in-flight old responses across Audit/base/sales/stock/delivery, and empty-store no-global-call behavior. These are isolated DOM tests, not login, live API/database, visual or LAB acceptance. Build preparation's unrelated generated Audit allow-list change was excluded from this fix.

## Protected scope and acceptance

Completed ordinary/forced/recount QR closes and protected expense/payment fixtures must never be replayed. Preserve tenant/auth/module/license enforcement, report row calculations, Athens times, store-wide terminal reporting, all sales/payments/stock/shift/fiscal behavior and Task27/29/30/TODAY/installation/efood ownership. No production database, credentials, permissions or application-data writes.

Next: full exact-head CI → merge → verify exact deployed revision → read-only LAB report acceptance in two existing stores. Verify initial context, search/refresh/group rows and switching store while loading show only the selected store, with independent row store identities. Central SA Audit global navigation remains available. Native browser credential protection previously prevented automated live observation; use the already-requested manual handoff if it remains blocked. No shift close or financial transaction is needed.

Owner remains ASSIGNED until this read-only acceptance and synchronized actual PASS closure. Manual claims remain unchanged until actual LAB evidence exists.
