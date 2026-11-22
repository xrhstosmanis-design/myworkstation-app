# Invoice #28 — isolated synthetic BackOffice → HTTP → PostgreSQL cancellation acceptance

**Date:** 2026-11-08. **Status:** AWAITING EXACT-HEAD CI; HOSTED LAB NOT TESTED; #28 OPEN.

## Existing accepted technical baseline
- Backend owner/manager cancel PR #3743 merged, exact-head CI #9501 SUCCESS; cancellation is terminal, inverse inventory is linked to append-only audit, payment and source attachment retention.
- BackOffice cancel dialog PR #3746 merged, exact-head CI #9508 SUCCESS; explicit reason, confirmation, old-preview rejection, and negative stock consent.
- This is an **additional independent synthetic integration acceptance check**, not a new production feature or a retest against an actual store.

## Test-only change
One test appended to `server/test/purchase-order-reopen.test.js`, gated by existing `isolatedInvoiceDb()`: NODE_ENV must be test, DB host localhost/127.0.0.1/postgres, database pathname must contain "test". The existing fixture creates a random temporary PostgreSQL schema and deletes it afterward; the HTTP service listens on 127.0.0.1 with an ephemeral port. Browser UI is loaded into an isolated JSDOM document.

The test drives an authentic manager's BackOffice cancellation form through an actual local Express HTTP route and native PostgreSQL transactions. It records **before** values from the synthetic invoice: stock 13, payment/attachment/AI-job/control-store snapshot, preview of one original invoice line and delta -3. Negative actor/store/company authorization, stale version and missing confirmation are checked before cancellation and must preserve stock, payment and attachments.

It then submits the UI cancellation exactly once, expecting **after** stock 10, order/document CANCELLED, one linked inverse movement, one cancellation audit containing the original line, and payment/attachments/AI-job/control-store snapshot unchanged. Repeated HTTP confirmation must be idempotent, not create another reversal; terminal cancelled purchase must reject preview.

## Test evidence and required gates
- First CI #9517 (run 42522881249) **FAIL**: the new synthetic full-stack test ran (not skipped) but its test assertion expected the original POS source `PurchaseDocument id=d-pos` to become `CANCELLED`. The source intentionally remains `DRAFT` while the approved purchase projection `id=pos` becomes `CANCELLED`. Fixed only the test assertion to check **both** states; order stock had already reached 10 and the actual HTTP cancel returned 200. New exact-head CI is pending; no new PASS claimed.
- Require exact-head MyWorkStation CI **completed success**, including native PostgreSQL execution (not skipped) and the JSDOM path. Confirm specific test name in CI logs, not just aggregate CI PASS.
- The separate **hosted MYWORKSTATION LAB full invoice** environment was not verified as an isolated service/tenant. Render has full production `myworkstation-app` and separate POS-UI and wholesale LAB services; these are not evidence of a dedicated isolated invoice DB. Do **not** mutate a hosted invoice or fiscal/myDATA/payment record until store/tenant/revision, before/after and controls are demonstrably isolated and authorized.
- All real purchase, payment, inventory and fiscal data remain untouched. There is **no Render deploy** in this checkpoint.
