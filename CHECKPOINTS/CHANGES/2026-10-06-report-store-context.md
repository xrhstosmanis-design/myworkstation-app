# Store-scoped reports — 06/10/2026

Status: ASSIGNED fix/report-store-context-20261006 / diagnostic preparation only; no source change, CI, deployment or LAB fix PASS.

Owner explicitly requires reports opened inside one store to show only that store. Global selection belongs only to the central Super Admin context. Owner image(20261006-183139).png shows parent store ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, report criteria Όλα τα καταστήματα, and an independent Audit selector ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. The owner reports other-store events; this screenshot does not itself expose row store identities. Do not assert a verified data leak or one-OUT count from it.

Source diagnosis: installKioskReportsSuite.js initializes singleton state.storeId to empty; activate() loads all report lookups without adopting CommerceHub selected store. Audit has independent dataset scope and URL supportStore precedence; report search is intercepted by the audit capture handler. CommerceHub exposes its current store only through its React select, without a stable data attribute. No implementation yet.

Pre-change record: AGENTS read; active list reviewed in bounded historical segments; Gate7 authoritative PASS supersedes older OPEN entries. New main652dd532 adds mandatory claim publication before code. Relevant report manual and audit checkpoints inspected. Claim publication pending before source editing. Latest fetched origin/main329792ba; local documentation branch remains unchanged except this preparation note.

Protected: completed QR ordinary/forced/recount closes and financial fixtures must never be replayed. Task27/29/30/TODAY/installation/efood ownership retained. No sales, payments, stock, shift, production database, credentials or permissions changed.

Next action: finish full coordination-list review, establish independent report-context assignment on newest main, then bounded selected-store propagation and stale-response clearing with regression checks. LIVE acceptance requires exact deployed revision and read-only two-store report verification, not another shift closing.
