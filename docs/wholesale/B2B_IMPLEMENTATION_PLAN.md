## 18/10/2026 14:09 Europe/Athens — WHOLESALE-CUSTOMER-PORTAL-01 / ASSIGNED / SOURCE NOT STARTED / LAB NOT TESTED

Retained coordinator codex/wholesale-suite-20261017; docs claim docs/wholesale-customer-portal-claim-20261018, source feat/wholesale-customer-portal-20261018. Owner again says «ΞΕΚΙΝΑ». Baseline main190dd550; source50a07878 retains the completed exact-decimal/shared SUBMITTED core and replay correction (2974/0/0 native CI, ordinary guarded release and exact health receipt in prior checkpoint), not a hosted wholesale LAB PASS. This new coherent vertical slice adds approved customer access to the same order core. No source/test/config change before this claim is green and merged.

Three authorized workers: wholesale_core owns NEW dedicated portal bootstrap/auth/session and public/admin routers plus auth unit tests; field_sales owns shared trusted-principal adapter, pricing/order service integration, additive channel constraint extension and core tests; b2b_site owns isolated customer entry/components/API/CSS, portal administration component and mounted UI tests. Coordinator owns additive route/build/parent integration, native registered HTTP/PostgreSQL acceptance, review and common records/PDF/publication. No other Gate8/general auth, DAILY/retail/online, fiscal/payment/stock, Android/FCM or infrastructure owner is taken over; no second project/repository/service.

Contract: one company-scoped configured site with slug/name and explicit enablement, initially closed; manager-provisioned dedicated login/password accounts, immutable same-company WholesaleCustomer and single-store grant, explicit site/store/product publication. Canonical Product/StoreProduct and wholesale customer/list/tier references reused. No self-registration, automatic retail identity mapping, emails or real accounts created by this work. Opaque random sessions stored only hashed, separate HttpOnly/Secure/SameSite cookie, bounded attempts, expiry/revocation, CSRF/same-origin checks and private no-store responses; never mint a management-secret JWT or trust client actor/company/customer/channel/price. Portal auth uses no SuperAdmin license bypass; current active company CORE license plus live site/account/customer/store/session checks required. Dedicated commercial entitlements remain future work, not implied by CORE.

Customer entry /b2b/:slug uses isolated Vite page without administrative bootstraps, local credential storage or worker registration. Public branding/login only before authentication; own published catalog requires explicit granted store; quote and SUBMITTED order use authoritative shared decimal pricing and trusted principal B2B_SITE. Strict bodies derive customer on server. Own-customer history/detail returns safe saved snapshots, no costs/internal identifiers or staff notes. Stable namespaced account actor preserves same-account idempotency after re-login. Existing accepted own requests may replay/read original snapshots after price/list/publication changes, but current account/session/site/license/customer/store access is always rechecked; new quotes/submissions recheck publication and pricing. Frozen ambiguous UUID/body retained in memory, including session-expiry recovery by the same principal; changed-key body conflicts. No durable offline/reload/crash guarantee.

Protected regressions: strict BACKOFFICE manager API and quote hashes; explicit selected store/no company fallback; exact NET/GROSS/VAT0/decimals, legacy NULL basis refusal, SHARE locks, order ReadCommitted/advisory serialization/fresh lookup, immutable replay and atomic request/event/rollback; existing retail/POS/auth/license safeguards. Additive runtime portal tables and validated channel CHECK extension only, no sandbox production SQL/migration/seeds, direct deployment/restart/server/backup/license/account/business action. SUBMITTED still only «Προς έγκριση», creditChecked=false; no stock reservation/movement, sale/payment/collection/invoice/fiscal/myDATA effects.

Required evidence before source merge: focused and full Node20 tests/builds; native actual registered public/admin routes, opaque cookie/CSRF/login/logout/revocation/expiry/rate limits, tenant/customer/store/publication/license isolation, rejected body overrides and management credential crossover, shared quote/order/concurrent idempotency and rollback, populated legacy channel bootstrap twice, same backoffice readback, unchanged synthetic financial/stock controls; mounted UI expiry/store/stale-response/frozen retry tests. Full GitHub CI remains mandatory. Existing local environment has no PostgreSQL, so local native SKIP is not PASS. Exact guarded deployed revision before proposing LAB; no state-changing LAB authorized by this claim. No manual PASS until real observation. Remaining seller app/assignments, offline recovery, credit/fulfillment/fiscal integration, dedicated entitlement/standalone packaging/domain and complete acceptance remain OPEN with this coordinator. Checkpoint CHECKPOINTS/CHANGES/2026-10-18-wholesale-customer-portal.md. Next action green merge claim, then implement this vertical slice; historical next-action functional LAB is deferred to separately prepared acceptance, not silently marked complete.

# B2B customer site — implementation plan

Date: 2026-10-17. Read-only source baseline: main `87b2864`.

**Status: DESIGN ONLY / NOT IMPLEMENTED / NOT TESTED.** Every `/api/b2b` endpoint and new association below is proposed. This document neither registers a route nor changes authentication, licenses, schema, data or deployed behavior. Source work remains gated on the repository ownership claim being merged. Claim publication was blocked by automatic approval review; no alternate publication is authorized by this document.

## Product and first deliverable

The approved product comprises wholesale backoffice, a customer B2B site and field-sales tools. It must operate both inside MyWorkStation and as a separately licensed wholesale package, in the same repository and deployment architecture. Standalone means a wholesale customer need not purchase or use retail POS; it does not by itself mean offline operation.

The first customer-site slice is an approved customer logging in, seeing their own catalog and authoritative prices, submitting an order request, and seeing that request in their history and the wholesale backoffice queue. Submitting a request does not complete a sale, create an invoice, collect money, reserve inventory or execute fiscal/myDATA operations. Those operations belong to later explicitly designed order lifecycle transitions.

## Source findings and ownership

| Existing component | Verified source behavior | Intended treatment |
| --- | --- | --- |
| `server/src/wholesale-b2b-bootstrap.js` | Four company-scoped tables: customer, list, list-product tier, customer-list assignment | Reuse canonical references; no duplicated product/stock master |
| `server/src/routes/wholesale-b2b.js` | Administrative customer/list creation, tier upsert and list assignment | Preserve; reconcile customer-list readback and removal separately in core scope |
| `client/src/components/commerce/WholesaleB2BPanel.jsx` | Backoffice customer/list editor | Keep administrative API separate from customer-site API |
| `Product`, `ProductBarcode`, `StoreProduct` | Existing product identity, barcodes and per-store prices/stock | B2B uses these identities and explicit store membership |
| `server/src/routes/kat-online-ordering-modifiers.js` | Retail public slug lookup, licensing checks, catalog, hospital member login and order submission | Reuse architectural patterns only; preserve retail checkout and owner |
| `client/public/kat/app.html` | Public retail customer storefront | Do not replace with wholesale UI |
| `server/src/kat-online-ordering-bootstrap.js` | Per-store slug/branding, unique optional custom-domain field | Reference pattern; do not imply domain routing is implemented |
| `server/src/index.js` | `/online/:publicSlug` serves existing retail storefront | Preserve route; add isolated B2B entry only after claim |
| `server/src/online-members.js` | Customer/doctor/nurse/staff registration and approval | These hospital identities are not wholesale customer accounts |
| `server/src/pos-pricing-bootstrap.js`, `server/src/routes/store-pos.js` | Retail `Customer` plus `CustomerWholesalePrice` used for POS-specific wholesale pricing | Existing behavior protected; identity mapping requires explicit design |

The phase-1 checkpoint is `CHECKPOINTS/CHANGES/2026-10-01-wholesale-b2b-phase1.md`, historically assigned to `agent/wholesale-b2b-20261001` with NOT TESTED acceptance. Preserve that evidence and reconcile ownership centrally before implementation. DAILY online scope remains with `codex/daily-online-store-20261011` / issue #2054; existing Gate6, KAT configuration, retail modifiers and online fulfillment are outside this proposed claim. Existing fiscal/payment/catalog owners remain unchanged. No Sites project, second repository or second production service is proposed.

## User flows

1. Owner activates the wholesale/B2B entitlement, selects the fulfillment store and customer catalog, sets branding, and approves a customer's site access. Unconfigured/disabled sites remain closed.
2. Customer opens their enterprise's B2B URL. The anonymous page shows approved public branding and sign-in only; it does not expose customer prices, stock counts, balances or identity hints.
3. Customer signs in with a separately provisioned B2B identity linked to one active wholesale customer account. Session context determines company/customer, never an arbitrary request-body customer ID.
4. Customer browses a bounded, searchable catalog and permitted pack/quantity options. The page labels VAT basis and unit clearly. Changing permitted store clears stale catalog and quote state.
5. Customer requests a quote. The server resolves current customer assignment, valid tiers, product/store membership, tax and unit conversions. The UI displays the returned totals and an explicit change message if the quote becomes stale.
6. Customer selects an approved delivery address, enters optional notes and submits once. A stable request key supports retry after a network interruption. Same key with a different payload is rejected.
7. Customer sees the submitted request and its saved totals. Backoffice sees the same canonical request with source `B2B_SITE`; field-sales requests use the same underlying service with their own authorized actor/channel.
8. Customer reopens their own history. Reordering creates a fresh basket and quote, never reuses old order prices as current prices. No invoice, balance or payment view appears until those later features have authoritative data and access controls.

## Planned associations

Names below are conceptual design names, not existing schema declarations.

| Association | Scope and rules |
| --- | --- |
| B2B site configuration | Company, allowed fulfillment stores, unique public slug, branding, enabled flag, catalog policy, optional verified custom domain; deliberately separate enablement from retail online enablement |
| B2B account | Company + canonical `WholesaleCustomer.id`; active/approval state, credential hash or approved auth-provider reference, revocation/session version; multiple contact users may belong to one customer |
| B2B account-store grant | Same-company account/customer and store; explicit permitted selection, no implicit all-store access |
| B2B ship-to | Same-company/customer-owned address with active state; snapshot on order; arbitrary foreign address IDs rejected |
| Catalog publication | Company/store/product allowlist or explicitly scoped publication policy; do not silently inherit retail visibility or publish every wholesale ingredient |
| Customer-list assignment | Reuse `WholesaleCustomerPriceList`, recheck active same-company customer and list |
| Quantity tier | Reuse `WholesalePriceListProduct` with canonical product IDs; unit conversion and price basis must be settled centrally |
| Quote | Customer/store, inputs, price/policy revision, expiry and authoritative totals; opaque reference must be ownership checked; signing or persistence must prevent tampering |
| Order request + lines | Shared core wholesale model/service; company/customer/store, immutable submitted line/tax/address snapshots, channel, actor, request key, payload hash, events and version |

Do not create a second catalog, stock ledger, customer financial balance or fiscal subsystem for the site. Existing `Customer` and `WholesaleCustomer` identities must either be explicitly mapped under same-company constraints or deliberately remain separate with documented interoperability. Matching by tax ID, name or phone alone is not sufficient authorization for automatic merging.

Composite same-company relationships and unique constraints should enforce associations in the database where supported, in addition to server checks. Current phase-1 tables have individual foreign keys; those do not alone prove every referenced row shares a company. Address/account revocation and order history retention require an explicit lifecycle policy before schema changes.

## Planned API contracts — NOT IMPLEMENTED

Proposed isolated browser entry: `/b2b/:publicSlug`. Exact naming remains subject to the core contract review. Existing `/online/*`, `/api/public/online/*`, `/api/public/kat/*` and administrative `/api/wholesale/*` behavior stays intact.

| Method and path | Request | Response and boundary |
| --- | --- | --- |
| `GET /api/b2b/:slug/config` | Public slug | Safe branding and sign-in capability only; no customer/list/warehouse/private-price disclosure |
| `POST /api/b2b/:slug/session` | Approved B2B login credentials | Short-lived/revocable customer session; generic credential failure, bounded attempts; no admin/operator/hospital-member token reuse |
| `DELETE /api/b2b/:slug/session` | Authenticated session + CSRF protection as applicable | Revoke session and clear browser state |
| `GET /api/b2b/:slug/me` | Session | Minimal own account, allowed stores, approved ship-to options and capabilities |
| `GET /api/b2b/:slug/catalog?storeId=&cursor=&q=` | Session, explicit allowed store, bounded search/page | Published products only; price/unit/VAT basis and availability semantics; no costs or other customers' tiers |
| `POST /api/b2b/:slug/quote` | `storeId`, `items: [{productId, quantity}]` | Canonical lines, net/VAT/gross totals, pricing version, expiry and opaque `quoteId`; client prices are ignored/rejected |
| `POST /api/b2b/:slug/orders` | `clientOrderId`, `storeId`, `items: [{productId, quantity}]`, `notes`, `quoteId` | One canonical `SUBMITTED` request with snapshots; `201` first creation, `200` identical replay; no stock/payment/fiscal posting |
| `GET /api/b2b/:slug/orders?cursor=` | Session, bounded cursor | Own customer's visible requests only; immutable submitted totals, allowed status fields |
| `GET /api/b2b/:slug/orders/:orderId` | Session + opaque order ID | Same-company/customer-owned request or generic `404`; no salesperson/internal-cost notes |

The backoffice and field-sales APIs should call the same core quote/order service rather than the B2B browser routes. Customer identity is resolved differently for a customer session versus an authorized salesperson, but pricing and order invariants are shared.

The shared submission body above is the initial cross-agent contract. `clientOrderId` is its stable idempotency identifier. `customerId` is derived exclusively from the portal session and passed through authenticated service context, never accepted from the portal body. The first slice uses canonical product quantities only; pack/unit selection and customer-chosen ship-to require a centrally agreed additive contract before being offered. Until that extension exists, display the verified account delivery destination and canonical unit explicitly; do not claim the more advanced flow is implemented.

Error contract: `400` invalid input; `401` missing/invalid session; `403` inactive entitlement/account or denied capability; `404` inaccessible object/site; `409` stale quote, changed catalog, idempotency payload conflict or invalid lifecycle transition; `429` bounded attempts. Responses must not disclose SQL, credentials, session contents or foreign-tenant object existence. Service outages remain explicit errors, never zero-price/zero-stock/empty-success fallbacks.

## Authentication, privacy and isolation

- Define a separate B2B session audience and authorization guard. Reject customer sessions on existing admin, operator, reporting and financial routes, and reject those token types as B2B customer impersonation.
- Resolve tenant from the configured slug or verified host mapping, then bind it to the authenticated customer account. Recheck customer/account/store grants, publication and entitlement on every request. Never trust body `companyId` or `customerId`.
- Prefer secure, HttpOnly, SameSite session cookies with appropriate CSRF/origin checks for mutations. Exact session integration must fit the existing platform architecture and receive native HTTP tests; this document does not change existing authentication.
- Hash credentials, support revocation/expiry, rate-limit login without making shared business Wi-Fi unusable, avoid account enumeration and record safe actor/action audit metadata without passwords or raw tokens.
- Mark authenticated customer catalog/order responses private and prevent CDN/service-worker/shared-browser cache leakage. Clear sensitive in-memory state on logout, expiry, tenant change and store change; discard delayed responses from older scopes.
- Browser offline storage of customer prices/orders is not implied by standalone packaging. The separate field-sales offline design must explicitly specify allowed local data and synchronization controls; it cannot automatically broaden customer-site storage.
- Allow only scoped catalog fields; do not expose purchase costs, other customers, global price lists, credit rules, internal warehouse counts or internal staff comments. Stock visibility can be a bounded availability indicator unless exact quantities are explicitly approved.

## Central decisions before source work

1. Which canonical customer model is authoritative, and how any existing retail customer mapping is approved and maintained.
2. Whether source list prices are net or VAT-inclusive; explicit tier/override/list-discount precedence; units, pack conversion, decimal arithmetic and rounding. Legacy retail `salePrice` must not be silently interpreted as wholesale net price.
3. Whether inactive/missing price assignments block order submission or require an explicit default; missing configuration cannot silently grant another price list.
4. What “available” means before reservation, whether backorders are accepted, and at which later transition stock is reserved/deducted/released. An order request must not promise reserved stock.
5. Credit-control source, approval rules and concurrent commitments. An editable `creditLimit` field is not a working receivables or credit-control engine.
6. Dedicated wholesale/B2B/field-sales entitlements and standalone access/navigation. Existing `CORE` gating is not the full commercial licensing implementation.
7. Shared canonical order schema/status contract and separation of customer-visible notes from internal notes.

These decisions are owned centrally by the core implementation plan; site and field-sales agents must not invent competing resolutions.

## Standalone and custom-domain readiness

Standalone wholesale needs an entry/dashboard that exposes only licensed wholesale features without requiring a retail POS shift or operator session. Company provisioning, owner access, subscription status, branding and support must use the existing platform controls and tenant isolation. Canonical Platform/Super Admin entry remains `https://myworkstation-app.onrender.com/platform-admin`.

Custom-domain readiness requires ownership verification, approved host allowlisting, DNS configuration, TLS issuance/renewal, canonical URL rules and a working slug fallback. Never resolve tenant from an arbitrary untrusted Host/X-Forwarded-Host value. Cookie origin/CORS/CSRF, login logout behavior, asset paths and branding must be checked on the real host. Existing `customDomain` storage/unique index is only a configuration building block; no real domain operation is certified by this audit.

## Acceptance checklist

All items currently **NOT TESTED for the new B2B slice**. Source/static observations above are not LAB PASS.

- [ ] Merged ownership claim defines isolated files and preserves current wholesale/retail owners.
- [ ] Core contract resolves customer identity, tax basis, price precedence, units, credit and order states.
- [ ] Native HTTP tests prove customer A cannot read customer B's prices, quote, ship-to or order, within one company and across companies.
- [ ] Foreign store/product/list/address references fail; revoked/inactive accounts, modules and grants stop subsequent requests; invalid store never falls back to all-company data.
- [ ] B2B sessions cannot enter admin/POS routes; non-B2B tokens cannot impersonate a customer; credential failures and rate limits disclose no account secrets.
- [ ] Quantity aggregation, tier boundaries, decimals, zero/negative/nonfinite/oversize values, pack conversion, VAT and total rounding match shared core contract.
- [ ] Catalog change, inactive product, reassigned list, expired quote and changed price are revalidated at submission with explicit conflict behavior.
- [ ] Concurrent identical requests create one order; same key with changed payload conflicts; failed transaction leaves no orphan lines/events.
- [ ] Submitting a request leaves sales, payments, shifts, stock movements and fiscal requests unchanged in an isolated test database.
- [ ] Backoffice sees the exact same request and snapshots; customer sees only approved fields and their own history.
- [ ] Mounted browser tests cover tenant/store changes, delayed responses, expiry, logout, retry, touch/mobile layout and private-cache boundaries.
- [ ] Existing KAT/DAILY public retail routes, members, modifiers, price caps and online order lifecycle regressions pass without configuration changes.
- [ ] Required repository CI/build/security/license/native PostgreSQL/HTTP/browser checks pass before guarded release; CI success remains distinct from LAB/customer acceptance.
- [ ] Following authorized guarded release, scoped LAB customer/backoffice readback proves the precise slice with evidence and no repeated protected retail transactions.
- [ ] Standalone wholesale entry works without a retail module or shift; disabled subscriptions fail closed.
- [ ] Domain behavior remains NOT TESTED until verified DNS/TLS/host isolation and sign-in are observed; domain field storage alone is insufficient.

The deliverable for this step is this plan only. No order, site, account, schema, endpoint, domain, deployment or functional PASS is created by writing it.

## Follow-up authentication boundary evidence - 18 October 2026

Read-only inspection of server/src/middleware/auth.js116-269 found explicit STORE_CHAT_OPERATOR, POS_BACKGROUND and STORE_OPERATOR branches, followed by legacy/session handling and a final req.user payload assignment. It does not universally reject every unknown tokenType. Therefore a new B2B JWT signed by the current general JWT_SECRET is not safely isolated merely by naming a different tokenType/audience. This is a design constraint for the new portal, not a newly implemented auth change or a claim of an exploitable issued token.

Prefer a dedicated opaque random portal session, stored hashed and validated only by B2B middleware, with host-scoped HttpOnly/Secure/SameSite cookie and CSRF checks appropriate to the chosen routing. It must never be attached as a BackOffice Bearer token. Alternatively require a separately reviewed cryptographically isolated signing/verifying boundary. Prove portal credentials fail every administrative route and cannot be exchanged for an admin session. Preserve the existing Gate8/auth owner; no general auth source was changed for this investigation.
