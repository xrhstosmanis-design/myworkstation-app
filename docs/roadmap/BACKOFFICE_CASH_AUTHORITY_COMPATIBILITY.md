# Native cash screen: authority and data compatibility before integration

Status: READ-ONLY REVIEW / NOT INSTALLED / NOT A NEW GRANT. Same retained CENTRAL-BACKOFFICE-ACCESS-01 owner. Prepare the next common-screen integration without changing the separately owned cash reconciliation algorithms, accepted reviews, stock/financial sources or recovery worker.

## Exact current boundary

The existing cash.read right admits only GET /api/backoffice-staff/cash/stores/:storeId with explicit selected-store header and validated from/to period. The endpoint checks exact user/store, fresh live grant before and after repository.read and unchanged lifecycle generation. The module contract currently requires CASH_CONTROL, STORE_CHAT and AI_READER. Do not broaden or remove those checks as a presentation shortcut.

That endpoint returns the canonical reconciliation repository's projected report, text, rows/context, issue/handoff registers, first history page, head and generation. It does not return the overview/daily-summary data model used by the ordinary CashControlPanel shift cards. Do not fabricate empty sessions, zero amounts, a successful daily summary or a cross-model API translation.

## Native screens and explicit unavailable operations

| Native surface | Existing personal cash.read authority | Integration boundary |
|---|---|---|
| CashControlPanel shared frame and date range | Presentation only | Reuse native shell/period controls; keep report data model honest |
| GET cash store overview / daily-summary | Not admitted for cash.read | No automatic Owner fetch; sales.read overview is a different restricted contract |
| CashReconciliationPanel report text, rows and history | Same canonical repository behind existing personal endpoint | Use explicit controlled redacted result/read callback and exact store/period/generation validation |
| Investigation, cash paper reads and AI reading | Not admitted | Hide controls and skip polling/listeners/requests until a distinct exact operation is integrated |
| Review OFFSET/ASSOCIATE/CONFIRM/CHECKPOINT/REVOKE/ISSUE/HANDOFF_ISSUE | Not admitted | No review form or writer callback for a read-only personal session |
| Kiosk source import/configuration | Not admitted | Do not mount import/configuration child |
| Reviewed archive export | Not admitted | No archive fetch/download just because report data is visible |
| Report copy | Existing personal report already permits explicit copy | Preserve same verified text and deny copying stale/unverified scope |
| History pagination | Existing personal endpoint fixes repository.read defaults | Do not silently ignore requested historyPage or display repeated first page as another page |

Avoid a broad cash URL-prefix bridge or an EMPLOYEE-to-Owner role substitution. Any future new exact read or write admission needs distinct validation, live session/grant/object/company/module checks and native transaction-time revalidation before replay or mutation. An action name in the review catalogue grants nothing.

## Required comparison and acceptance

Mount the real Owner and personal native components. Verify no Owner-only automatic request or review/import/export child for cash.read, exact selected-store period, delayed old scope/error clearing, no invented zero/success card, history capability boundary, verified-copy behavior and unchanged Owner forms/data. Test direct denied endpoints and live revocation separately. Keep native cash repository arithmetic, accepted review identities and financial totals unchanged. Full exact PR/main CI and normal guarded healthy release precede hosted read-only acceptance. Any future financial/review write acceptance requires a separately recorded fresh baseline and controls; no accepted transaction is repeated for evidence.

This packet is the next-step design only. Native inventory currently has its own source/CI batch; do not claim common cash UI or all-functions permission completion from this review.
