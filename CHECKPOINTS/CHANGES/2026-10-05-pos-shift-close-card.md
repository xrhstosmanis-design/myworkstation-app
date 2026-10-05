# POS shift closing requires opener card — 05/10/2026

ASSIGNED fix/pos-shift-close-card-20261005. Owner explicitly requested and confirmed mandatory scan of the active shift opener’s own card at 20:42–20:43 Athens.

Existing evidence: screenshots 19:36–19:38 from physical LAB POS 2 show mandatory opening form after owner reported closing an old shift, entry to sales after owner confirmation, and closing count form with drawer/custody/coins/safe/EFTPOS. Exact deployment verified earlier: 8ef966c2. These are limited UI observations, not independently measured cash/stock/Workforce acceptance. Historical opening on 27Sep explains earlier direct sales entry. No transaction repeated and no production data changed by this implementation.

Implementation: Store Mode collects card scan in closing form; server checks active same-company/store/employee credential and locked shift openedBy. Missing/wrong/revoked/another opener card rejects before ledger, shortage audit, cash close or Workforce OUT. Check runs inside existing close transaction on both normal and forced-shortage paths. No raw card stored or audited. Existing BackOffice authorization path, same-terminal guard, shortage recount/confirmed closure, authoritative cash totals and idempotent close retained. UI title becomes Κλείσιμο βάρδιας.

Local tests: targeted card behavior and existing blind/manual closing tests PASS. HTTP E2E now uses registered isolated card fixtures and checks missing/wrong cards on normal/forced paths leave session OPEN. Full CI required. Status AWAITING CI / MERGE / EXACT DEPLOY / LAB.

Required physical acceptance: identify terminal, operator and session; record refreshed cash/card/IRIS/total and counts, Workforce status, audit, unaffected terminal; attempt wrong card once (no state delta); scan opener card and close once with observed values; record resulting CLOSED, one OUT, audit and unchanged control. Hardware scanner/phone QR camera and physical closure NOT TESTED. Scanner keyboard input is implemented; camera scanning is not added in this scope.
