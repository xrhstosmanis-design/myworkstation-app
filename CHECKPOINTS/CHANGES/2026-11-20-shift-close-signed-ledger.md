# SHIFT-CLOSE-SIGNED-LEDGER-01 — bounded claim before source

Owner /root of this invoice-recovery conversation; branch fix/shift-close-return-totals-20261120. User explicitly requests correction after a real normal LAB close failure. Preserve shared close/PIN, No5 and invoice owners except this independent bounded validation amendment. Claim must merge before source edits.

Evidence: real LAB MAIN with 3 prior returns, net cashSales -13.00, user-submitted zero counts. Server logs 20Nov2026 17:30:57.688286479Z identify Zod path cashSales / minimum0. Actual close FAIL before credentials/transaction. Earlier invoice plain capture limited LAB PASS remains protected, no repeat payment/upload/return. Filling zero counts does not fix this server constraint. No production mutation.

Scope after claim: server/src/routes/cash-control.js close-schema ledger fields ONLY; new server/test/shift-close-signed-ledger.test.js; strictly required source-provenance hashes only if the existing COMPANY packet pins the changed source. Allow finite bounded signed derived cashSales/cardSales/expenses because returns and negative expenses may make net ledger totals negative; physical drawer/custody/coins/safe and declaredEftpos remain nonnegative. Retain authoritative locked ledger computation, role/PIN/opener/tenant/terminal/pending-invoice/shortage/idempotency checks. Do not clamp or rewrite stored amounts or mutate historical records.

Required proof: reproduce original validation failure in isolated actual registered close route; signed return totals pass schema and reach unchanged real close handler, authoritative ledger overrides forged caller totals, negative physical counts/EFTPOS and invalid credentials still reject. Run retained cash-close/shift PIN/pending controls. Full source/main CI and guarded exact deployment before owner retry; hosted normal close remains FAIL/OPEN until then. No automatic administrative close and no real-store action.

Status CLAIM_ONLY / source NOT STARTED / LAB FAIL. Other owners and existing partial PASS retained.

## Source candidate after approved claim4107

Before-source claim4107/head00352cc4 passed three applicable checks (two runtime jobs skipped by docs classification) and merged a2929e8db59c4025541609c56b38ab89c5a3ccd0. User explicitly approved public code/tests/technical documentation publication after the earlier auto-review refusal. Local Git push subsequently failed for absent HTTPS credentials, so the connected GitHub API publishes the same bounded artifacts; no rejected disclosure retry occurred before approval.

Runtime diff: one bounded signed ledgerAmount validator applied only to close cashSales/cardSales/expenses. Global amount/open/review schemas and physical counts/EFTPOS/credentials/transaction body remain identical. No COMPANY pinned input names cash-control.js, no package hash amendment required. New regression extracts the actual source schema and registered close handler; it proves signed payload reaches transaction admission, not a new native business acceptance by itself.

Node20.20.2:26 targeted PASS/0FAIL/0SKIP (5 new plus21 retained); the same five new tests against original source fail5/5 before correction. Isolated PostgreSQL18.7UTC:32PASS/0FAIL/0SKIP across retained actual PIN-close and pending-invoice fixtures, including actual startup patch, authentication/opener/tenant controls and once-only close. An initial native attempt failed because the prior temporary PostgreSQL package/cluster had been cleared; recreated isolated runtime passed unchanged tests. Syntax and diff checks PASS. No hosted write/close/replay/deploy. Source fullCI/mainCI/guardedLIVE and real normalLAB close remain OPEN/AWAITING LAB.
