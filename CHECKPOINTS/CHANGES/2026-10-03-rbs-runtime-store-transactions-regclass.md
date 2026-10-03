# RBS runtime store-transactions regclass root cause

Date: 2026-10-03

Production continued logging Online shift reconciliation regclass errors after 5459d3a7. Inspection showed the patch generator was fixed, but server/src/routes/store-transactions.js (the runtime route) still had SELECT to_regclass('"OnlineOrder"') without a cast. This change fixes the runtime route directly. No CAPDriver, Writer, AURORA, payment or VAT mapping changes. Await green CI, exact deploy and clean production logs before physical retest.
