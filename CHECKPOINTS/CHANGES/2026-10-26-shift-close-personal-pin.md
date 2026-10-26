# SHIFT-CLOSE-PERSONAL-PIN-01 - explicit PIN alternative / BEFORE SOURCE

26/10/2026. Central owner `codex/central-four-streams-20261018`; worker `/root/shift_pin`, source branch `fix/shift-close-personal-pin-20261026`. Prepared on `27ab5bc`; reconciled fresh main `2b3ac1790c97d6d2a052428586543997beee3c9b` with unrelated myDATA3168 source and complete owner registry bytes preserved. Source scope unchanged. User explicitly requests closing a shift with the opener's personal PIN as an alternative to their card. This supersedes ONLY the mandatory card-only restriction requested05Oct in `2026-10-05-pos-shift-close-card.md`; original personal-card authentication, opener binding, role/terminal rules, camera/scanner and accepted normal/shortage closures remain protected. No replay of previously accepted21:27/22:06/22:47/23:27 closes. Gate8 final25Sept11/11PASS stays locked; only the new PIN alternative needs new acceptance.

## Exact source/test claim - 6 paths

1. `client/src/components/store/StoreShiftClosePanel.jsx`: explicit CARD/PIN choice, normal/forced-shortage credential submission and clearing. Separate invoice-pending reminder UI is integrated here ONLY by this sole writer from the reviewed invoice worker snippet after the PIN commit.
2. `server/src/services/shift-close-card.js`: preserve legacy verifyShiftCloseCard; add explicit verifyShiftCloseCredential PIN alternative.
3. `server/src/routes/cash-control.js`: ONLY credential import/close schema pin+method/locked authentication/authFailed401 outside transaction/method-only audit. Separate invoice-pending overview/close acknowledgement sections belong to the invoice claim and are integrated ONLY by this sole writer after the PIN commit.
4. NEW `server/test/shift-close-pin.test.js`.
5. NEW `server/test/shift-close-pin-ui.test.js`.
6. NEW `server/test/shift-close-pin-postgres.test.js`.

## Authentication/transaction contract

Use the existing personal4-8digit bcrypt PIN; no shared PIN, administrator override, new credential store or login/auth change. Explicit method CARD or PIN; omitted method remains legacy CARD; both credentials together refuse. Require same company/store, original shift opener/operator.employeeId, active employee/current credential, bound terminal and dedicated server closeShift permission. Use existing StoreOperatorLoginGuard only, no DDL/schema; five failures/fifteen-minute lock remains durable/atomic.

Incorrect PIN returns authFailed inside the existing locked close transaction, committing ONLY the guard failure counter before any ledger/safe/shortage/close/Workforce OUT/mail action. Route sends401 outside that transaction. Successful closure audits method only, exactly once. Never retain PIN/card/hash in audit, shortage/recount payload, UI state beyond immediate use or replay body. Existing card, cash/EFTPOS counts, financial totals, forced-shortage protocol, opener and idempotency semantics stay unchanged.

## Required verification and shared-file serialization

Protect existing card/EFTPOS mounted and separation/HTTP regressions; actual mounted PIN normal/forced paths, clearing and method switching. Native PostgreSQL wrong PIN durable counters, lock expiry/concurrent failures, foreign operator/company/store/terminal, inactive/revoked operator, own successful PIN exactly one CLOSED/OUT/audit and no replay effect; verify finances/control unchanged on refusal. Full Node20 exact PR/main CI, independent review, normal guarded exact LIVE, then separately authorized real handover with fresh before/after/control. No synthetic or CI-only manual PASS.

Shared `StoreShiftClosePanel.jsx` and `cash-control.js` have ONE writer `/root/shift_pin`. Invoice worker must provide reviewed section snippets/interface, not parallel file edits. PIN credential sections and invoice pending service/schema/overview/reminder/ack sections are independent claimed portions, integrated serially after the PIN source commit and re-reviewed/tested at the combined exact revision. Separate source PRs/serial integration; no authority for unrelated close/payment changes.

Status ASSIGNED / SOURCE NOT STARTED / NEW FLOW NOT IMPLEMENTED OR INSTALLED / AWAITING LAB. Green merged before-source claim is required before code or any new real closure. No user/card/PIN/financial test or settings change occurred in this claim. Existing Gates2/3/8 and other owners remain protected.
