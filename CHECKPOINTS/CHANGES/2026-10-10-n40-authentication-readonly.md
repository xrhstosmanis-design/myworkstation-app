# No40 — read-only authentication and Render-log evidence

## 10 Oct 2026 — No40 / AI-CC-LIMITS — read-only authentication evidence; OPEN

Same owner `codex/n40-full-twin-navigation-audit-20261010`. Prior visual phases 1–14, Stock USER evidence comment 6097485640 and five browser round trips recorded by PR #2092 are preserved without replay.

At 12:44:31–12:45:36 UTC (15:44–15:45 Athens), 14 real production GET requests across seven source-derived read endpoints returned 401: seven without Authorization and seven with an intentionally invalid token. No business data was returned. This verifies only rejection before authenticated context resolution; nonexistent `n40-invalid-context` placeholders do not establish LAB tenant isolation, permitted-role access, revoked access or module authorization.

Render workspace explicitly confirmed by the owner: My Workspace; matched service `srv-d9isenfavr4c73bdh52g` / canonical myworkstation-app. Request-log query for 12:33–12:38 UTC returned an empty collection (hasMore false). No request trace is therefore available to validate the earlier browser request scopes. Application logs for 12:33–12:46:30 UTC contain repeated VIDEO EVENTS module-not-technically-active errors with status 409 at videoStoreContext, and seven malformed-JWT validation messages at the negative-probe times. The 409 entries omit store/request identity: temporal overlap is not proof of the LAB caller or cross-store leakage. Camera navigation/UI PASS is preserved; module acceptance and this error remain unresolved.

Observed server revision remains `6b08e72a9c14f973a62cc1e3a43f8600aef9fef4`. No deployment, source change, business mutation, analysis execution, permission edit or device command. No40 remains OPEN. Remaining: attributable request-level same-store evidence, authenticated role/module/revocation negatives and network races, client revision attestation and Stock support-exit Audit. Next action: obtain an authorized attributable request trace and suitable read-only role fixture; investigate VIDEO EVENTS 409 without enabling/changing modules. Detailed checkpoint: `CHECKPOINTS/CHANGES/2026-10-10-n40-authentication-readonly.md`.


## Exact probe results

Canonical host: https://myworkstation-app.onrender.com. Operator: automated read-only HTTP probes, no authenticated LAB operator/shift; physical terminal, SKU, quantity and payment are not applicable. Company/store placeholders intentionally nonexistent. These probes supplement the browser checks; they do not replace interactive tenant acceptance.

| GET route | No Authorization | Invalid token |
| --- | --- | --- |
| `/api/platform/store-modules/companies/n40-invalid-context/stores/n40-invalid-context/check-packages` | 401 | 401 / AUTH_TOKEN_INVALID |
| `/api/platform/cash-control/daily?date=2026-10-10&storeId=n40-invalid-context` | 401 | 401 / AUTH_TOKEN_INVALID |
| `/api/platform/cash-control/shortages?from=2026-10-10&to=2026-10-10&storeId=n40-invalid-context` | 401 | 401 / AUTH_TOKEN_INVALID |
| `/api/platform/store-modules/companies/n40-invalid-context/stores/n40-invalid-context/workforce-v2/bootstrap` | 401 | 401 / AUTH_TOKEN_INVALID |
| `/api/platform/companies/n40-invalid-context/stores/n40-invalid-context/video-connection` | 401 | 401 / AUTH_TOKEN_INVALID |
| `/api/transactions/bank-ledger/summary?companyId=n40-invalid-context&storeId=n40-invalid-context` | 401 | 401 / AUTH_TOKEN_INVALID |
| `/api/transactions/supplier-settlements/review?companyId=n40-invalid-context&storeId=n40-invalid-context` | 401 | 401 / AUTH_TOKEN_INVALID |

All responses application/json. Missing-token body: `{"error":"Απαιτείται σύνδεση."}`. Invalid-token body: `{"error":"Η συνεδρία δεν είναι έγκυρη.","code":"AUTH_TOKEN_INVALID"}`. No real credential was read or exported. Checks are LIMITED AUTHENTICATION REJECTION VERIFIED, not full authorization/LAB PASS.

## Publication and protected evidence

Based on fresh main f73467c14265e92203735c07fdbb7712ce2a4282; docs only. PR #2092 merged prior browser observations. PR #2065 remains the release discussion; no re-merge/deploy requested. Shared tracker, active list, pending, numbered checklist, manual limits and both generated PDFs are synchronized in this publication. Exact PR/head/CI/merge evidence will be appended to the release conversation after green CI. Other assignments remain untouched.
