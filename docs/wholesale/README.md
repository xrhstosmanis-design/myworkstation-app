# MyWorkStation Wholesale Suite

## Status: public publication authorized - source work awaits merged claim

Owner authorized the full product and three collaborating agents on 17 October 2026. The agents completed separate code audits. Local claim commit ce269224 was NOT published: automatic approval review rejected publishing new project trackers/checkpoints/PDF to this public GitHub repository. Verification confirmed the connected repository identity and write permission, but review again required explicit user authorization for public publication. Do not bypass this using another tool.

Repository: https://github.com/xrhstosmanis-design/myworkstation-app

Coordinator: codex/wholesale-suite-20261017. Existing source remains unchanged. This document and linked plans are preparation for review, not deployed capabilities. The mandatory ownership claim must be green and merged to main before source changes or state-changing LAB tests. No source code, production state, database or deployment was changed.

## One product, three client surfaces

| Surface | Scope | Worker |
| --- | --- | --- |
| Wholesale BackOffice | Customers, suppliers, stock, price lists, orders, fulfillment, receivables, reporting | wholesale_core |
| B2B site | Approved customer access, personal prices, catalog, orders, documents/account views | b2b_site |
| Field sales | Assigned customers, visits, mobile orders, later offline synchronization and authorized collections | field_sales |

The coordinator owns shared domain decisions, licensing/tenant integration, contract alignment and final review. Each worker has a separate documentation file. Later code file ownership must be explicitly recorded before concurrent edits.

## Integrated and standalone commercial modes

One repository and shared backend, with an additive wholesale workspace and independently licensed access. Standalone means buyers can use wholesale without retail POS; it does not yet promise a customer-hosted server, native APK, offline full ERP, working custom-domain provisioning or an independent production service. No second repository, Sites project or service is created in this initiation. Each buyer's company data, staff, customer accounts, branding and entitlement must be isolated.

## Shared contract for the first vertical slice

Authenticated context supplies company and actor; a validated fulfillment store supplies store scope. The canonical product remains Product.id with StoreProduct membership. WholesaleCustomer remains distinct from POS Customer until an explicit audited identity mapping is implemented. Portal customer identity comes from its session; a field seller may act only for current assignments. The browser never authoritatively supplies price, company, actor or source.

Proposed shared order command: clientOrderId (UUID), customerId (service context; never portal-controlled), storeId, items [{productId, quantity}], quoteId, optional notes. Route adapters derive channel BACKOFFICE/B2B/FIELD_SALES. The shared server quote returns explicit net/VAT/gross, units, currency, pricing revision and expiry. Existing prices have no proven wholesale net/gross interpretation, so no silent migration or activation is allowed.

Atomic request creation must revalidate authorization, customer, store, active products, quote and price on submission. Unique (companyId, actorUserId, clientOrderId) plus canonical request fingerprint allows identical replay and rejects conflicting reuse with 409. The first accepted request is SUBMITTED; it is not a Sale, paid invoice, fiscal document, stock movement or automatic credit approval. Later fulfillment transitions have revision guards and independently measured posting.

## Delivery sequence and honest acceptance

1. Repair master readback/unassignment and UI asynchronous form handling, review saved tiers; native tenant/role tests.
2. Authoritative shared quote and order request service with persistence/idempotency/revision proof.
3. BackOffice order-request review and separate customer/seller principals.
4. B2B customer site and field-sales online application use the same service.
5. Picking/dispatch/returns, stock/receivables/collections/invoicing and approved provider integration.
6. Standalone licensing, branding/domain setup and onboarding.
7. Offline capture and measured complete multi-channel acceptance.

Every stage needs actual functionality and tests, not only a screen or documentation. Full product remains OPEN. Existing retail/LAB PASS and other owners remain protected. Build/CI is never a substitute for LAB acceptance.

## Worker specifications

- [Core implementation plan](CORE_IMPLEMENTATION_PLAN.md)
- [B2B implementation plan](B2B_IMPLEMENTATION_PLAN.md)
- [Field-sales implementation plan](FIELD_SALES_IMPLEMENTATION_PLAN.md)

## Next single action

Owner explicitly authorized publication to this public repository on 18 October 2026 at 00:18 Europe/Athens. Publish this documentation-only claim PR, require green checks, merge, and begin the first bounded source slice. Prior automatic-review rejections are historical and superseded by this explicit authorization. Until the claim merges, source implementation has not started.
