# No5 — COMPANY source binding after main integration

PR #4007, CENTRAL-BACKOFFICE-ACCESS-01. GitHub Actions run 44402256147 tested the synthetic merge of 18d61d9 and main 1b1d1f0. Its security suite reported 6,717 passed, 11 failed and 3 skipped. The COMPANY compatibility verifier identified a stale digest for the purchase-order route after the No4 assistant line transfer landed. CURRENT_CAPTURE also stopped in its worker and still needs the native CI rerun.

Integrated main 882adc805c7e06b7e0e1e91798f9a654017aada8. Reviewed scope checks, transactional staff authorization and purchase-line changes before updating the one stale digest in the inactive COMPANY compatibility packet. No plan, review identity, activation, runtime guard or backup rule changed.

On 18d61d9 the broad staff suite passed 404 tests and skipped four native checks. The proposed integration passed 27 targeted route/permission checks with one PostgreSQL check skipped, and 14 COMPANY verifier tests with two infrastructure-dependent checks skipped. Native backup, private restore and installation acceptance remain open pending new CI. Final human acceptance remains a single session in the existing LAB grouped by role.
