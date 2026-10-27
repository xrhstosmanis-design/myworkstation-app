# FTEXT operator return — 27 October 2026

Retained owner: codex/rizareio-ftext-bridge-20261022. Draft PR #3216. The selected operator may release a rejected, verified ftext payment error after confirming register readiness. The action retains the original result and basket, does not emit a fiscal command and prevents later VOID on the released request. Unknown or confirmed receipts remain blocked. The pending unique index must upgrade from the exact existing versions under a lock; scoped native PostgreSQL tests cover the upgrade and concurrent release.

Local mounted POS, operator and VOID tests pass; production integration, native PostgreSQL and full CI are NOT YET VERIFIED. No live receipt, payment, VOID or production database action has been issued. Remaining: verify exact CI and release, then user-operated acceptance for the actual device. Keep the integration open.
