# Workforce mobile card store context — 01/10/2026

Production USER phone test after numeric PIN fix: login succeeded (WORKFORCE_MOBILE_LOGIN audit at 19:06:36Z for LAB POS 2 with correct store), then «Η κάρτα μου» failed with «Δεν προσδιορίστηκε κατάστημα.» before QR load.

Root cause: /api/operators is wrapped by requireStoreModule(STORE_MODE), which resolves store only from body/params/path. GET /me/work-card has none, so module middleware rejects it before the handler can verify the mobile JWT storeId.

Fix keeps entitlement enforcement: EmployeeWorkCard sends its authenticated session storeId as query, and requireStoreModule accepts explicit query.storeId as a store context source. No module bypass, no QR/PIN/attendance/POS mutation.

Status: PIN LOGIN PASS / QR LOAD FIX IMPLEMENTED / AWAITING CI + DEPLOY + USER QR RETEST.
