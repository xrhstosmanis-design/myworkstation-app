# SHIFT-CLOSE-SIGNED-LEDGER-01 — bounded claim before source

Owner /root of this invoice-recovery conversation; branch fix/shift-close-return-totals-20261120. User explicitly requests correction after a real normal LAB close failure. Preserve shared close/PIN, No5 and invoice owners except this independent bounded validation amendment. Claim must merge before source edits.

Evidence: real LAB MAIN with 3 prior returns, net cashSales -13.00, user-submitted zero counts. Server logs 20Nov2026 17:30:57.688286479Z identify Zod path cashSales / minimum0. Actual close FAIL before credentials/transaction. Earlier invoice plain capture limited LAB PASS remains protected, no repeat payment/upload/return. Filling zero counts does not fix this server constraint. No production mutation.

Scope after claim: server/src/routes/cash-control.js close-schema ledger fields ONLY; new server/test/shift-close-signed-ledger.test.js; strictly required source-provenance hashes only if the existing COMPANY packet pins the changed source. Allow finite bounded signed derived cashSales/cardSales/expenses because returns and negative expenses may make net ledger totals negative; physical drawer/custody/coins/safe and declaredEftpos remain nonnegative. Retain authoritative locked ledger computation, role/PIN/opener/tenant/terminal/pending-invoice/shortage/idempotency checks. Do not clamp or rewrite stored amounts or mutate historical records.

Required proof: reproduce original validation failure in isolated actual registered close route; signed return totals pass schema and reach unchanged real close handler, authoritative ledger overrides forged caller totals, negative physical counts/EFTPOS and invalid credentials still reject. Run retained cash-close/shift PIN/pending controls. Full source/main CI and guarded exact deployment before owner retry; hosted normal close remains FAIL/OPEN until then. No automatic administrative close and no real-store action.

Status CLAIM_ONLY / source NOT STARTED / LAB FAIL. Other owners and existing partial PASS retained.
