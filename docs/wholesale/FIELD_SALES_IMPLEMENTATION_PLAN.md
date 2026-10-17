# External sales representatives — proposed implementation plan

Status: **PROPOSED — NOT IMPLEMENTED — NOT TESTED**.

Prepared for the owner-authorized session starting 2026-10-17 23:58 Europe/Athens for the MyWorkStation wholesale suite. This document is a design deliverable, not evidence that a mobile application, new authorization, offline synchronization or order API exists. No source, schema, production configuration or business data is changed by this plan. Implementation remains dependent on the merged scope claim and shared wholesale-core contract.

## Verified starting point

- `server/src/routes/wholesale-b2b.js` manages company-scoped wholesale customers and price lists. Its manager allowlist excludes `EMPLOYEE` and `STORE_OPERATOR`.
- `server/src/index.js` mounts `/api/wholesale` behind authentication and `CORE`; dedicated commercial wholesale/field-sales entitlements still need definition and integration.
- `UserRole` currently contains `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `EMPLOYEE`. There is no salesperson role or customer-assignment model in the inspected implementation.
- `WholesaleCustomer` and its price lists are separate from POS `Customer` and `CustomerWholesalePrice`. This plan does not silently merge these identities.
- `Product.id` remains canonical product identity; company/store availability uses the existing catalog and `StoreProduct`. Do not duplicate products or stock for sales representatives.
- `client/src/offline-sale-queue.js` is a retail cash-sale queue. It expects a sale result and is not a wholesale order queue.
- The historical checkpoint `CHECKPOINTS/CHANGES/2026-10-01-wholesale-b2b-phase1.md` retains its original assignment. Ownership must be reconciled centrally before implementation.

## Representative workflow

1. An authorized manager enables field-sales access for an existing company user, assigns customers and permitted fulfillment stores, and selects that user's permissions. No general manager access is granted to make the mobile screen work.
2. The representative signs in with an individually revocable session and opens the field-sales workspace. Initial delivery targets a responsive authenticated interface in the existing repository; an installable/native Android application remains a separate delivery milestone.
3. The workspace shows only active assigned customers for the authenticated company and selected store. Customer search, counts, pagination and direct links use the same server restriction.
4. The representative selects a customer, checks permitted contact information, and starts a draft. Any balance display is separately permissioned and comes from the canonical receivables service once that service exists.
5. Product search and quotation use that customer's active wholesale price list, quantity tiers and selected fulfillment store. Prices are calculated by the shared server pricing service.
6. The representative reviews quantities, prices, availability warnings, delivery instructions and requested delivery date, where supported by the shared order model. The first slice submits products, quantities and notes only; additional fields must be added to the common schema before use.
7. Submission returns a server order identifier and status. Only that acknowledgement marks the order as received centrally. A browser/network failure remains an unresolved submission until the same idempotency key is retried or reconciled.
8. The order enters the common wholesale order center with server-derived `FIELD_SALES` channel and actor. Authorized office staff perform subsequent review, allocation, picking, dispatch and invoicing through the shared workflow.

Visits, routes, targets, commissions, collection of money, signature capture and printing are later bounded scopes. Order submission does not itself create a sale, reserve/post stock, collect money, issue a tax document or call myDATA.

## Authorization and assignment model

Reuse existing `User` identity and session infrastructure. A field-sales permission does not imply access to unrestricted wholesale administration or the retail POS. Do not reuse POS operator tokens: they have store/shift/POS-specific constraints.

Proposed records, to be reconciled with the shared core before migration:

| Record | Required fields and invariants |
|---|---|
| Field-sales membership | `companyId`, `userId`, `active`, permissions, `revision`, timestamps, manager audit actor. A user must belong to or have an explicitly validated account relationship with this company. |
| Customer assignment | `companyId`, `userId`, `customerId`, `storeId`, `active`, `revision`, effective dates, timestamps, audit actor. Unique company/user/customer/store tuple. Customer is the canonical wholesale customer. |
| Shared wholesale order | Company, fulfillment store, wholesale customer, creator user, server-derived channel, common status, currency, price/tax snapshots, totals, idempotency metadata, timestamps. |
| Shared wholesale order line | Order, existing product ID, quantity/unit semantics, authoritative unit-price/tax snapshot and line totals. No separate salesperson stock table. |
| Later local draft envelope | Version, company/user/store/customer scope, stable client order ID, creation/update time, assignment/catalog revision, pending lines, state and last error. No trusted final server totals. |

Use same-company composite reference checks, active store validation and transactions so a foreign customer, product or user cannot be linked through individually valid IDs. Assignment mutation belongs to manager-only endpoints and is audited.

Every customer list/detail, catalog request, quote, order create/read and idempotent replay must recheck the current session, membership, module/license, assignment, selected store and customer state. Missing/invalid store never becomes an all-stores query. Field-sales order history is initially limited to orders created by that user for currently assigned customers; broader team/customer history requires explicit additional permission and response-field review.

The authenticated company and actor come from validated server context, never the request body. Cross-company IDs return a non-enumerating not-found response. Managers needing central company-wide views use a separate explicit permission and endpoint. Revocation must not be bypassed by a cached quote, previously valid order ID or replay key.

## Proposed shared API contract

These endpoint names are proposed adapters over **one shared wholesale order-request and pricing service**; they must not create an independent order implementation. The core, B2B site and field-sales owners must finalize names and schemas together.

| Endpoint | Behavior |
|---|---|
| `GET /api/wholesale/field-sales/context` | Current allowed company/store scope, permissions and assignment revision; minimal data only. |
| `GET /api/wholesale/field-sales/customers?storeId=...&q=...&cursor=...` | Paginated currently assigned customers. No complete company dump. |
| `GET /api/wholesale/field-sales/customers/:customerId/catalog?storeId=...&q=...` | Store-scoped available catalog for an assigned customer. No other customer's prices or purchase costs. |
| `POST /api/wholesale/field-sales/quotes` | Authoritative common pricing and availability validation; no stock/payment side effects. |
| `POST /api/wholesale/field-sales/orders` | Atomically submit a nonfiscal common wholesale order request in `SUBMITTED` state using the stable client key. |
| `GET /api/wholesale/field-sales/orders/:orderId` | Read an authorized own order with current assignment and field-level permissions. |

Proposed strict submission payload:

```json
{
  "clientOrderId": "UUID",
  "customerId": "canonical-wholesale-customer-id",
  "storeId": "fulfillment-store-id",
  "items": [{"productId": "existing-product-id", "quantity": 2}],
  "notes": "Optional order instructions",
  "quoteId": "opaque-server-quote-id"
}
```

`quoteId` is required for confirmation once quote snapshots are implemented. A field-sales client cannot send tenant, actor, arbitrary price-list selection, final unit prices, discount overrides or totals. Reject unknown financial/identity fields rather than silently trusting or applying them. Define quantity precision, supported selling units, item count and note length in the common core schema. In the first slice, the product selling unit is authoritative; do not infer that `quantity: 2` means two cartons.

The server revalidates active products/store availability and selects current customer-specific/tier pricing on every submission. Monetary arithmetic, VAT inclusion and rounding use one shared pricing implementation and an explicitly documented currency/tax basis. Before this is defined, do not present estimates as final invoice totals.

Successful create returns `201` with `orderId`, `status: SUBMITTED`, `channel: FIELD_SALES`, authoritative lines/totals, `clientOrderId`, `idempotentReplay: false` and server timestamp. Exact authorized replay returns `200` with the same immutable accepted order acknowledgement and `idempotentReplay: true`; current order status may be returned separately. Failed/partial requests never return a successful acknowledgement.

The first shared-core state is `SUBMITTED`: an order request awaiting office handling. Client-side local drafts are not accepted server orders. No first-slice endpoint implements stock allocation, dispatch, finalization or fiscal documents.

## Idempotency and uncertain submissions

- Reserve the unique tuple `(companyId, actorUserId, clientOrderId)` in the shared order transaction. Include source channel in the canonical request fingerprint; a representative cannot impersonate a B2B caller using a client-supplied channel.
- Canonicalize the validated body using documented deterministic rules. Preserve line order unless the common core deliberately merges equivalent product/unit lines. Include customer/store, items/quantities, notes and the submitted quote identifier; exclude transport-only timestamps and retry count.
- Same tuple and same fingerprint returns the original accepted acknowledgement without recalculating or creating another order. Later price changes must not alter an accepted order on replay. All current authorization checks still apply before any response is disclosed.
- Same tuple and different fingerprint returns `409 IDEMPOTENCY_CONFLICT`. Editing a confirmed/reconciled order uses a dedicated revisioned workflow, not a new submission with the same key.
- Insert order, lines, price snapshot and dedupe record atomically. Resolve concurrent unique-key races by reading the existing scoped record and comparing its fingerprint. Do not use a check-then-insert sequence without a database uniqueness constraint.
- On timeout, retry the identical frozen request/key. Do not generate a new key, clear the draft or tell the user the order failed definitively. If edits are requested during uncertain submission, reconcile the original before submitting a replacement.
- A deliberately cancelled/deleted order or draft leaves a suitable scoped tombstone/idempotency record. Retrying an old key must not recreate it.

## Delivery stages

1. **Online authorization and common drafts:** manager-controlled assignments, responsive representative workspace, assigned customer list/catalog, shared quote and idempotent nonfiscal order submission. No offline claim.
2. **Office integration:** shared order-center receipt, clear actor/channel, progress readback and common customer/store/order permissions. Define subsequent stock reservation/invoicing separately.
3. **Offline design and pilot:** choose storage policy, implement a separate scoped queue and price-conflict review, simulate lost acknowledgements/revocation/restarts in isolated tests, then complete authorized LAB acceptance.
4. **Installable/mobile distribution:** packaging, device identity, update strategy, platform-specific storage/permissions and verified Android behavior. A responsive screen alone is not evidence of an Android app.
5. **Visits and receivables:** add planned/actual visits and optional collection flows only after their canonical accounting/audit/idempotency contract is defined.

## Offline privacy and storage decision

Durable offline ordering requires data on the representative's device. The user's earlier zero-local-storage requirement concerned chat; it must not be silently extended to field sales or silently overridden by an offline implementation.

| Proposed policy | Capability and limitation |
|---|---|
| Online-only, memory drafts | No durable customer/catalog/order cache. Unsaved work can be lost on reload, app termination or lost connectivity. OS/network caches still require appropriate controls; this is not an absolute no-traces guarantee. |
| Explicitly enabled offline mode | Persist only the minimum assigned customer/product data and pending drafts in a tenant/user/store-scoped store, with TTL, logout cleanup and platform-appropriate encryption/key handling. More reliable field operation but creates device-resident business data. |

Do not claim encrypted browser storage merely because IndexedDB is used. Native secure storage, key management and recovery require their own implementation and tests. Never persist access tokens in the order queue. Avoid cached balances, full customer lists, tax documents and purchase costs unless specifically needed and authorized.

Revocation can stop server access immediately once connected; a disconnected device cannot reliably erase an existing cache remotely. Explain this practical limit in the eventual offline enrollment UI. On next authenticated contact, membership/assignment/license changes quarantine unsent drafts, remove revoked cached views as policy permits, and require manager-assisted recovery. Logout/account switch clears sensitive cache only with an explicit policy for pending orders: never silently discard an uncertain submitted order. No queued item can be replayed under another account/tenant.

Offline states should distinguish `LOCAL_DRAFT`, `QUEUED`, `SENDING`, `ACCEPTED`, `NEEDS_REVIEW`, `AUTH_REQUIRED`, `REVOKED` and `CANCELLED`. Local success means only saved on device. Price/availability changes require an explicit refreshed quote and user confirmation, not automatic acceptance of a higher total. Network retries use the frozen idempotent request; material review changes receive a new key only after the previous request is known not to have been accepted.

## Acceptance matrix

All rows below are **NOT TESTED**. Unit/integration/CI success does not constitute LAB or live acceptance.

| Scenario | Expected result and evidence |
|---|---|
| Assigned customer, selected valid store | Only that scope is listed and quoted; accepted order appears once in the common center with correct actor/channel. |
| Other customer's direct URL/search/cursor | No customer data, prices, balance or order history disclosed; server denial independent of UI filtering. |
| Cross-company customer/product/store/user IDs | Non-enumerating rejection; no order, assignment or partial line row created. |
| Missing/invalid selected store; late old-store response | Fail closed; no all-stores fallback; client discards stale results after store/account change. |
| Inactive/reassigned customer or revoked membership | List/detail/quote/create/read/replay denied; stale cache does not authorize sync. |
| License/module suspended or session revoked | Access denied before service execution; queued draft remains unresolved with correct state and no business writes. |
| Submitted unit price/discount/actor/company override | Strict request rejection; authoritative price unchanged. |
| Same idempotency key, same body, sequential or concurrent | One order/line set; same accepted acknowledgement; correct replay marker. |
| Same key, changed customer/store/items/notes | `409 IDEMPOTENCY_CONFLICT`; no second order and original unchanged. |
| Server committed, acknowledgement lost | Exact retry recovers original acknowledgement; no duplicate order. |
| Order/line transaction failure | Atomic rollback; no orphan order, dedupe success marker or partial lines. |
| Quote expired or customer price changes before acceptance | Explicit `QUOTE_CHANGED`/review response with fresh quote; no silent higher-price submission. |
| Stock/availability changed while offline | Review according to common order policy; no false availability promise or automatic stock posting. |
| Cancelled/deleted draft retried | Tombstone prevents recreation; no resurrection. |
| Account switch, device restart, simultaneous sync | No cross-user queue visibility/replay; durable states and dedupe recover correctly. |
| Revoked representative retries known order ID/key | No unauthorized data in replay/read response, even when original creation was legitimate. |
| Order submission baseline and after | Confirm zero Sale/payment/StockMovement/fiscal/myDATA delta and one expected order delta; unaffected control store/terminal unchanged. |

Before any LAB state-changing test, record the required store, terminal/device, operator/session, time, product quantities and financial/stock/order baselines in the active checkpoint. Perform one identified action and compare matching after values and control. Existing retail/online-order/fiscal PASS behaviors remain protected and are outside this plan's implementation scope.

## Open decisions and next action

Finalize the common wholesale order/pricing contract and dedicated entitlement names, reconcile the historical assignment, and merge the centrally recorded claim before source edits. Then implement and test the bounded online assignment/quote/order slice. Offline retention, balance visibility, visit tracking, collections, Android packaging and dispatch/invoicing acceptance remain separate unresolved milestones; none is claimed complete here.
