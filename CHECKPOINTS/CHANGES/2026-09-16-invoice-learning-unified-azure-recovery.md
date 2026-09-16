# Invoice Learning unified Azure recovery 2026 09 16

## Reconciled evidence before change

- **LAB PASS protected:** Inventory 2.0 and the recorded stocktake flow remain complete and are outside this change.
- **LAB FAIL:** Invoice Learning accepted only one Coffee Union line, `73.20 EUR` net and `82.72 EUR` gross, instead of the expected seven lines and approximately `1,380.44 EUR`.
- **LAB FAIL:** The QR and mobile intake still call `__MWS_INVOICE_LEARNING_ACCEPT_FILE__`, but the only module that defined it was removed from the active dispatch when the duplicate automatic reader was disabled.
- **NOT TESTED:** Current `main` has one automatic file reader, but it has no post-deploy LAB PASS for direct file, QR or mobile intake.

## Single bounded change

- The active Invoice Learning reader now owns direct file, camera and QR acceptance.
- A running guard prevents a second provider request while the same read is active.
- Azure results are accepted only when product-line gross values reconcile with the printed invoice total within the existing safe tolerance. A proven partial result falls through once to the existing OpenAI fallback.
- A partial fallback result is rejected with `PARTIAL_PRODUCT_LINES`; it cannot become a draft or learning input.
- Safe Azure states are returned as `READY`, `NOT_CONFIGURED`, `REQUEST_FAILED` or `NO_SAFE_RESULT` and are shown by the active reader without exposing endpoint or key values.

## Safety boundary

- No payment, credit, accounting, stock, approval, finalization, fiscal, RBS, CapDriver or EFTPOS behavior changes.
- Existing invoice payments and deliberately deleted drafts remain untouched.
- A provider failure retains the current manual retry path and cannot block POS sales.

## Required validation

- Targeted tests must cover one shared direct and QR reader, the one-request running guard, the removal of the inactive duplicate reader from dispatch, and the `82.72 / 1,380.44 EUR` partial-result rejection.
- Full server tests and client production build must pass.
- CI PASS is not LAB PASS.
- After exact deployed-revision verification, LAB must read one Coffee Union file directly and once by QR or mobile. Each upload must create one request and either return all reconciled lines or an explicit bounded failure. No draft may be saved or learned during the test.
