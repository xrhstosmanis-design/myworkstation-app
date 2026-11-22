> 18/11/2026 follow-on: this contract now has a source implementation gated by actual installed schema, exact lifecycle catalogue, opt-in paired profile and fresh signed worker at the identical application revision. Existing production grants remain unchanged; native installed PostgreSQL and final hosted acceptance are separately required. The initial three directories do not cover every company screen.

# Company read access — proposed UI/API contract

18/11/2026 · `CENTRAL-BACKOFFICE-ACCESS-01` · PROPOSED / NOT INSTALLED.

This is a preparation contract for the requested Owner-delegated company views. It does not install schema, expose selectable rights, grant access, or certify runtime acceptance. The retained ownership and remaining scope are recorded in [the company authority compatibility packet](BACKOFFICE_COMPANY_AUTHORITY_COMPATIBILITY.md). Company activation remains blocked until the reviewed app/worker/profile and backup/restore compatibility requirements in that packet are met. Store-view delivery remains independent.

## Authority and initial scope

A personal account remains bound to its existing company and retains its native identity. It does not become Owner or Super Admin. `companyCapabilities` is an independently selected account policy. Store membership, profile names, all store capabilities, and a missing store selection never imply a company capability.

The proposed `staffCompanyCapabilities` enum is separate from the existing store capability enum. Its first executable subset is exactly `stores.read`, `suppliers.read`, and `customers.read`. Unknown, wildcard, platform, and unimplemented keys are refused. No existing account receives one of these rights by deployment, a profile preset, or schema default.

| Capability | Exact initial GET | Module | Safe item projection |
| --- | --- | --- | --- |
| `stores.read` | `/api/owner-products/stores` | `INVENTORY` | `id`, `name`, `city`, `active` |
| `suppliers.read` | `/api/commerce/suppliers` | `INVENTORY` | `id`, `name`, `taxId`, `email`, `phone`, `city`, `active` |
| `customers.read` | `/api/commerce/customers` | `POS` | `id`, `name`, `phone`, `email`, `discountPercent`, `creditLimit`, `balance`, `active` |

These are company directories. Supplier financial detail, customer ledger/receipts/loyalty credentials, product master data, store configuration, and all mutations remain outside this initial subset. These directory keys must not be described as complete coverage of every screen in their function family.

Every delegated response uses `{scope: "COMPANY", companyId, items}`. The server determines the company from the fresh authenticated account; it does not adopt an arbitrary company selected in a request. The item queries retain exact company predicates, active licence checks, the native module requirement, and live authorization revalidation before returning data. Their ordinary Owner response contracts stay unchanged.

## Request boundary

A company request supplies `x-backoffice-company-id` equal to the account's current company and supplies no `x-backoffice-store-id`. The initial GETs accept no store/company selectors in query or body. A store header, mismatched company header, foreign company selector, duplicate/array selector, or mixed company/store scope is rejected; no parameter is silently ignored to widen access.

Store requests keep their existing header and authorization. They cannot be admitted by `companyCapabilities`. The company API wrapper must not reuse the store wrapper or fall back to a company request when no store is selected. Only the three individually integrated GETs are admitted; URL prefixes and HTTP GET alone do not confer access.

The server checks the current personal account, current session, account activity, company binding, explicit capability, licence, and native module. Revocation during an expensive read withholds the response. Company reads do not run bootstrap DDL, create defaults, prepare master selectors, or perform financial, stock, provider, fiscal, or messaging actions.

## Owner permission form

The existing BackOffice account form gets a separate **Company views** fieldset only after the backend explicitly reports the reviewed company protocol as available. It must not display working checkboxes against an uninstalled schema. Until then, the runtime form and its payloads remain unchanged.

The company fieldset explains that these views cover the account's company, independently of assigned stores. Its three checkboxes use the separate company enum. Store presets and the existing "view only" store selector do not select company rights. A company preset, if implemented, acts only inside the company fieldset.

The proposed admin response and `/me` identity expose `companyCapabilities` separately from each store's capabilities. The proposed `/me.revision` is the existing `BackofficeStaffAccount.revision`, so cached company policy is bound to `userId`, `companyId`, the current token/session context, and that revision. An unavailable or missing field is **unknown/unsupported**, not an instruction to clear stored policy. Existing account activity and revision fences remain authoritative.

| Input case | Required policy behavior |
| --- | --- |
| New account; field omitted | Start with `companyCapabilities: []` |
| Existing account update; field omitted | Preserve the stored company policy |
| Owner explicitly submits a valid array | Replace only the intended company policy in the native fenced account transaction |
| Owner explicitly submits `[]` | Remove company authority; preserve separately selected store policy |
| Existing SA update that omits the field | Preserve existing native store-account behavior and company policy |
| Explicit company mutation without live Owner authority | Reject; no role impersonation or self-promotion |
| Account deactivated | Deny both company and store access and revoke sessions using native account behavior |

A company-only account has `grants: []` plus one or more explicit company capabilities. It is a valid personal account after activation. It sees company navigation and an honest empty store list. The UI must not invent a store assignment or enable a store function to make its login work. An account with neither kind of authority retains the existing empty-access policy; it does not gain a fallback view.

## Save and readback

Capture the exact submitted policy before resetting the form. Keep the existing `expectedRevision` fence, live Owner validation, target account/company checks, native session-version increment/session revocation, and immutable before/after security audit in the account transaction.

After save, fetch the current admin account state. Success requires the exact saved account ID and revision, expected active state, exact store grant sets, and—when explicitly submitted—the exact company capability set with no duplicates or extra entries. Never report a grant from checkbox state or a successful transport response alone.

A missing company field, stale revision, changed policy between save/readback, or failed readback means the chosen access was not verified. Keep that uncertainty explicit, refresh authoritative state, and do not automatically resubmit or clear policy. Omitted legacy updates are not compared as if they explicitly submitted an empty company array.

## Personal workspace

Add a **Company views** navigation area separate from the store picker and store navigation. Its buttons come only from fresh `/me.companyCapabilities`, not from store rights or the user's role label. Navigating there clears the selected store context and closes any mounted store view; navigating back does not grant store membership.

The company page identifies the company visibly, has no "all stores" fallback selector, and mounts only its explicitly granted directory. It does not mount the whole CommerceHub, company-wide bootstrap, administrative shell, or unrelated background widgets. Company-only accounts do not need to enter a store page first.

Native presentation candidates for this first subset:

| View | Reuse | Required exclusions |
| --- | --- | --- |
| Stores | Existing `BackofficeStores` cards, with a proposed read-only mode | Hide the "open store" control; a directory row is not a store grant. No shifts, credentials, routing, tax/fiscal settings, or lifecycle controls. |
| Suppliers | Extract/reuse native contact fields from `SupplierManagementPanel` | Use only the provided directory rows; no automatic `/:supplierId/detail`, `BankPaymentImportPanel`, bank selectors, financial joins, save, or import. Missing address data is not shown as a verified empty address. |
| Customers | Extract/reuse native contact/amount summary presentation from `CommercialPosApp` | No customer selection for a sale, pricing lookup, quote, member-card issuance, receipt entry, ledger, provider, or loyalty credential. Show amounts only when actually returned. |

The runtime extraction itself remains future implementation. Product-master integration is deferred: the native kiosk/catalogue path includes nested store stock, preparation hooks, and further requests that need their own reviewed adapter.

## Private view lifetime

Bind every mounted company directory to the authenticated identity/session context, exact company, operation, and request generation. Use the proposed `/me.revision` only after the compatible identity protocol returns it; do not manufacture one in the browser. Server-side fresh grants remain authoritative regardless of client caching.

Clear rendered rows and private details immediately on refresh, scope/navigation change, a new identity, deactivation/revocation, or read failure. Reject late responses after any such boundary, even when the underlying request cannot be cancelled. A response is accepted only for `scope: "COMPANY"`, the exact expected company, the expected array shape, and the reviewed item projection. Missing scope metadata is a failure, not a legacy company-wide fallback.

A denied refresh does not leave old names, contacts, amounts, or a selected detail on screen. Switching to another directory closes any current detail and invalidates its pending response. No response from a store-scoped request can populate a company directory. User strings remain text; directory rendering does not inject HTML, use unescaped URLs, or turn missing values into invented zero totals.

## Acceptance before activation

Required isolated checks include company-only login/navigation, empty defaults, legacy omitted-update preservation, explicit empty-array revocation, exact save/readback, stale revision rejection, unknown/wildcard denial, and account/session invalidation. Distinct tests cover store-only access versus company-only access, mixed headers/selectors, foreign company data, and revocation during a read.

Mounted tests must exercise every initial directory with only its own grant, inspect actual requests, reject foreign/missing envelopes, clear denied refreshes, discard delayed responses after navigation/session changes, and preserve ordinary Owner controls outside the delegated mode. Recovery compatibility and rollback are tested separately against the exact reviewed app/worker/profile pair. A source/UI test or CI run alone does not activate this company contract or certify hosted acceptance.

Live account tests stay in the consolidated final session requested by the Owner. No hosted grants, schema installation, financial operation, or repeated accepted LAB transaction is part of this document.

## Follow-on management directories — source candidate 18 November 2026

The account policy now has seven individually integrated keys. The initial three directory projections remain unchanged. Four additional precise GETs accept the same explicit company header and no store header or query/body selectors:

| Capability | Exact GET | Module | Safe projection |
| --- | --- | --- | --- |
| expense-categories.read | /api/management/expense-categories | CASH_CONTROL | id, description, active, createdAt, updatedAt, usageCount |
| customer-categories.read | /api/management/customer-categories | CORE | id, description, selectable, allowCredit, saleAtCostOrWholesale, deferred, active, createdAt, updatedAt, usageCount |
| professions.read | /api/management/professions | CORE | id, code, description, active, createdAt, updatedAt, customerCount |
| shipping-methods.read | /api/management/business-units/shipping-methods | CORE | id, code, description, active, createdAt, updatedAt; native active-only list |

The exact early delegated bridge runs before native management bootstrap/mapping middleware. It never ensures schemas or creates defaults; unavailable tables fail unavailable, not as an empty list. Tenant predicates apply to both sides of usage-count joins. The presentation uses native field labels in a pure read-only table, without importing editor/synchronization/bank/terminal hooks. All account/session/revision/module/response and stale-data rules above apply unchanged. Existing policies containing only the first three keys remain valid and gain no additional rights.

## Follow-on structured catalogues — source candidate 18 November 2026

The source catalogue now contains eleven independently selected company keys. Added categories.read (INVENTORY), vat-departments.read (INVENTORY), product-companies.read (INVENTORY) and banks.read (CORE). Categories alone accepts an optional, exact single own categoryId; arrays, other query names, transported bodies and store headers remain refused. Category responses atomically bind own category/subcategory rows, counts, percentages, totalProducts and selectedCategoryId. VAT returns its native unchanged exemption metadata through a pure shared constant; product companies include actual totalProducts. Bank settings expose only active native internalCode/name/accountingAccount/auxiliaryName/date fields, not IBAN, terminal/network configuration or financial ledger.

All four reads skip schema/default/mapping writes and product dialogs. The client validates the entire scoped response before publishing it, hides previous children immediately on category/company/revision/API changes and ignores late replies. These keys do not grant product drilldown, editing or other company's data. The finite Owner entry census in BACKOFFICE_OWNER_VIEW_COVERAGE.md records remaining panes and partial coverage.

## Follow-on business views — source candidate 18 November 2026

Company-products.read exposes only own-company Product fields, including clearly labelled sale/cost prices, native 500-row list/search window and optional single trimmed q (maximum120). Purchases.read exposes only native recent300 metadata, with no file/detail/approval implication. Recipes.read retains own recipe lines; missing/foreign ingredient identifiers, names and cost are redacted and aggregate recipeCost is null with explicit incompleteness instead of an understated total. Genuine complete zero cost remains zero. Supplier-details.read first validates an own supplier and returns native latest200 purchase/payment windows, own-product costs and explicitly estimated window balance, without files/provider/import/payment actions.

Supplier-details.read explicitly depends on suppliers.read. The Owner checkbox visibly selects the parent directory right and removing the parent removes details; the account validator rejects an orphan policy. A supplier is chosen by native name/tax-ID, never by technical UUID. All prior3/7/11-key policies remain valid and acquire no right automatically. The scope, response, revision, module, late-response and no-write rules above apply unchanged.
