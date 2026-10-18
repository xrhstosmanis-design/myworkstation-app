# WHOLESALE-ORDERS-01 - shared quote and order requests

## 18/10/2026 12:35 Athens - WHOLESALE-ORDERS-01 / ASSIGNED / NOT TESTED

Owner/coordinator codex/wholesale-suite-20261017 retained; claim docs/wholesale-orders-claim-20261018, source feat/wholesale-orders-core-20261018. Owner says «ΞΕΚΙΝΑ» for next agreed shared pricing/order phase. Prior explicit public repository authorization remains valid. Previous sourcePR2685/main11235c4c and evidencePR2686 retained; baseline main d8ff16ef. No prior wholesale LAB PASS is invented. New scope is additive wholesale quote and SUBMITTED order requests, not fiscal/financial completion.

Three independent workers after green merged claim: wholesale_core owns new exact-decimal pricing lib and pricing tests; field_sales owns new atomic order-request lib and order tests; b2b_site owns internal wholesale quote/order UI and mounted tests. Coordinator owns bootstrap, routes, parent launcher integration, HTTP/native PostgreSQL acceptance, shared records and review. No code before claim merges. No other Gate6/Gate8/DAILY/efood/retail/POS/inventory/fiscal/assistant/store-lifecycle owner is taken over.

Scope: explicit nullable tier priceBasis NET/GROSS with legacy NULL unclassified; tier version and scoped price-change audit; no reinterpretation/backfill of legacy numeric values. Quote fixed eligible quantity tiers only, active same-company customer/list/store/product/store-membership and explicit source basis, decimal net/VAT/gross snapshots; ambiguous/unsupported/unclassified price fails closed. Operational APIs require explicit store. Actor/channel/prices derive from authenticated manager context. No public customer/seller token or new entitlement is enabled yet.

Submit one online BACKOFFICE order request with UUID clientOrderId, customerId,storeId,items,quoteId,notes. Transactional idempotency bound to company/actor/key + canonical hash, unchanged retry returns original committed order, changed reuse409, stale quote409 before write, atomic request/event. Status SUBMITTED/«Προς έγκριση», creditChecked=false; no stock reservation/posting, sale, payment, invoice, myDATA, fiscal or collection. UI freezes ambiguous submission and retries same key/body; blocks own launcher departure and warns on browser unload. No browser persistence/offline/crash-recovery guarantee in this slice.

Additive runtime bootstrap only for new wholesale tables and price metadata; no production SQL/migration from sandbox, no physical/LAB state-changing action, no server/backup/restart/license change. Isolated tests must prove exact cents/net/gross/zeroVAT/tier boundaries, tenant/store/product isolation, stale responses, quote mismatch, concurrent duplicate serialization and rollback, unchanged synthetic financial/stock controls. CI/build/invariants/registered HTTP/native PostgreSQL + mounted UI required before source merge. CI alone is not LAB PASS; new manual PASS absent. Full suite remains OPEN. Checkpoint CHECKPOINTS/CHANGES/2026-10-18-wholesale-orders-core.md. Next action merge this claim then implement the scoped vertical slice.

## Shared contract

- buildWholesaleQuote(db, authenticatedContext, {customerId,storeId,items}, {lock}) returns financial-version quoteId, EUR, authoritative item snapshots and totals.net/vat/gross as decimal strings, creditChecked:false.
- Quote input quantities are decimal strings, max4 places, positive, max1million; at most100 unique products; base Product.unit only. No silent package conversion or retail fallback. Highest eligible tier must be explicitly classified. Fixed tier overrides list default discount; nonzero discount on same fixed tier is rejected.
- POST /api/wholesale/orders accepts {clientOrderId,customerId,storeId,items,quoteId,notes}; server context fixes actor/channel. Shared snapshot pricing occurs inside transaction, quote recalculated, ID is not a bearer capability.
- Request/event tables store immutable priced JSON; no dispatch/finalization/deletion in this slice. Snapshot-consistent pricing does not prevent a new tier being inserted after the transaction snapshot. RepeatableRead serialization/unique races use bounded full-transaction retries.
- GET product search and order list/detail require explicit validated store, no company-wide fallback. Public site and sellers use separate approved identity adapters later.

## Acceptance and limits

Tests use only dependency isolation or guarded local myworkstation_test PostgreSQL random schema. No production DB access. Decimal fixtures test NET/GROSS, VAT0, half-cent rounding, highest-tier unclassified refusal, quantity/amount overflow, unknown/client price fields, active cross-company/store guards. Request tests prove same-key concurrent replay, changed payload conflict, stale quote, transaction failure/no partial rows/events, scope revocation on replay, and no Sale/StockMovement/StoreTransaction changes. Mounted UI proves explicit store, stale responses, frozen retry and display/price classification.

Future remains credit policy/receivables, reservation, approval/picking/dispatch/invoicing/provider integration, B2B authentication/site, seller assignments/application, standalone packaging and durable offline recovery. Owner retains suite until named handoff.

## Prior release evidence - read-only

18Oct pre-change check: mainCI39112180379 for11235c4c SUCCESS. Render workspace My Workspace user-confirmed, service myworkstation-app/srv-d9isenfavr4c73bdh52g. Latest deploy dep-dba8i2bbc2fs73afh06g statuslive/finished08:55:17Z at sourceca2654525dc3a0a97539f74b1367ce86e7e6dd62; public health oktrue/version0.22.0+kat-test-pos/exactca265452 matched. All5owned runtime/test blobs from first wholesale source match unchanged in that release. This establishes deployment/code inclusion only, NOT hosted functional/LAB PASS. No deploy/restart/production mutation was triggered by this check.
