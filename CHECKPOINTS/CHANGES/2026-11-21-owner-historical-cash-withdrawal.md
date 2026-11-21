# OWNER-HISTORICAL-CASH-WITHDRAWAL-01 — before-source claim

Owner: /root, owner cash withdrawal conversation. Date: 2026-11-21 Europe/Athens.
Branch: feat/owner-historical-cash-withdrawal-20261121.

Request: record a previously omitted physical owner cash withdrawal remotely against its original store and shift, including a closed shift. This claim contains no customer records, amounts, names, or production identifiers.

## Bounded implementation

New dedicated authorized owner-withdrawal route/service and modal, mounted from the owner payment page. Preserve ordinary POS cash-transfer behavior and delegated staff permissions. Reuse existing StoreTransaction and StoreOperatorAudit; no new tables or schema changes. The owner selects the original shift and actual occurrence time. Fresh preview and explicit confirmation bind amount, reason, original shift snapshot, and idempotency key. An atomic transaction locks the original shift, records TRANSFER_OUT with historical occurredAt and current createdAt/actor, and updates only expectedOperational/variance/updatedAt for CLOSED. Original counted cash, closing/opening declarations, nextOpeningTotal, sales, expenses, status and subsequent shifts remain unchanged. Audit stores before/after values and reason. OPEN uses the normal ledger without a closed snapshot update. Duplicate retries cannot subtract twice; changed payload/context refuses. Stale views, invalid or out-of-shift dates, foreign stores/companies and unauthorized actors refuse. Historical closed-shift corrections must not use the ordinary reversal path without atomic snapshot reconciliation. Existing report review snapshots become stale after the added movement; no silent review reset or historical email replay.

## Paths and owners

Own new service/route/modal/tests; minimal mount in server/src/index.js and OwnerPaymentQuickActions.jsx. Preserve No5 shared policy except the explicitly requested additive owner-withdrawal capability wiring described below; preserve ordinary store-cash-transfer helper, automatic-report policy and lifecycle profiles. Existing No5/No7/No13/No14/No16 assignments retained. Shared-source integration must preserve current peer changes.

## Acceptance

Before code: publish this claim. Then native PostgreSQL atomicity/concurrency/idempotency/scope and actual mounted owner UI tests, exact-source full CI, reviewed merge and normal guarded deployment. Existing transaction replay is forbidden. Real owner-confirmed production correction is a separate explicit UI action with before/after verification; no direct production SQL write. Partial code/CI does not claim real correction or LAB PASS.

Status: CLAIM ONLY; application code NOT IMPLEMENTED. No financial, stock, shift or production mutation.

## Events requirement added before implementation

The same atomic correction must appear in the existing Events screen, linked to the original store/session/operator and ledger transaction. Display the withdrawal occurrence time separately from correction recordedAt, recording actor, reason, amount and before/after expected cash and variance. Add only the exact event label/allowlist/description mapping in server/src/routes/kiosk-reports-audit.js with linked-event regression coverage. Preserve existing access scope, event filters and chronological meanings. Historical session investigator must resolve the explicit session link even when registration is later. No duplicated financial effect from the audit row.

## Central all-store roles — explicit user expansion before source

The feature is centrally available for every authorized store, not limited to a single incident. OWNER is limited to its own company and stores, SUPER_ADMIN retains its established selected-company/store support admission, and a responsible delegated user requires an explicit store-specific owner-withdrawal action grant, default OFF. No ordinary employee, POS operator or legacy MANAGER role implicitly receives it. Add own shared definition for payments.owner-withdrawal; narrow additive imports/catalogue/permission label/exact endpoint mapper in shared/backoffice-staff.mjs and the minimal CASH_CONTROL module binding in backoffice-staff-access.js, preserving all existing No5 semantics and profiles. Recheck current grant/session/module/lifecycle before preview, in the locked transaction and before commit. No bulk grant or grant migration. If a changed source belongs to a pinned package, reconcile only its exact source digest/import closure and tests; immutable profile/plan definitions and other owners remain unchanged. Shared mapper integration must be reconciled against current main rather than replacing another owner's pending edits.

## First source implementation — 2026-11-21

Claim4129 merged91e894440cd496c0e546541e0354310810ff552e after exact docs CI44888334995 SUCCESS. Added dedicated transactional service/router, preview-confirmation modal, owner payment entry, default-OFF payments.owner-withdrawal grant and exact scoped endpoint mapper. Existing delegated policy applies the CASH_CONTROL/STORE_MODE prerequisites; no modification of the shared access service or pinned company sources was needed. The original POS transfer helper and worker/profile definitions remain unchanged. Events include linked session, original operator, actor, historical occurrence, current recording and before/after values. Cash investigation includes explicitly linked late events.

Node20 client production build PASS15.00s. First19 focused tests PASS0FAIL0SKIP against isolated native PostgreSQL18.7/loopback test DB, including real concurrent idempotent writes, stale payload, foreign scope, final authority failure rollback, exact original counted cash/next opening preservation and control-store preservation. Later Events formatter test added; final combined receipt below. Native setup initially could not create sandbox Unix sockets; started with TCP-only and shut down cleanly. A mistaken earlier test filename prevented that launch; it did not produce PASS. Initial local no-DB skips are superseded only for the explicitly executed native tests. Mounted real React modal tests lost reply, identical durable packet on remount, no double submission and actual residual rendering. Role-entry negative tests do not substitute for a hosted role session.

No real store/shift/ledger/permission/schema/environment/stock change. No real correction yet. Exact source CI, complete HTTP/role acceptance, current-main reconciliation and normal release still required. Overall OPEN, not installed.

Final focused Node20/native PostgreSQL18.7 batch:21PASS/0FAIL/0SKIP, including new Events formatter and existing payment correction Events behavior. Final native server stopped cleanly. No hosted mutation.
