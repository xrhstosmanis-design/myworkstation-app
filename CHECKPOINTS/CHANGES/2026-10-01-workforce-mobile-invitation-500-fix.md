# Workforce mobile invitation 500 fix — 01/10/2026

Production USER test after #1598 showed «Παρουσιάστηκε εσωτερικό σφάλμα» when pressing «Αποστολή εφαρμογής» for LAB POS 2. Production DB read-only verification confirmed active Workforce/legacy employee and active StoreOperatorCredential/card, so credential absence was excluded.

Root cause: the work-card route created `legacyEmployeeId` inside the Prisma transaction callback but referenced that block-scoped variable afterward while building `mobileUrl`, causing a server ReferenceError/500 after the card transaction succeeded.

Fix: return `legacyEmployeeId` as part of the transaction result and build the mobile URL from `result.legacyEmployeeId`. No QR algorithm, PIN, attendance, POS session, sale, payment, stock, payroll or fiscal behavior changes.

Status: FIX IMPLEMENTED / AWAITING CI + DEPLOY + USER RETEST.
