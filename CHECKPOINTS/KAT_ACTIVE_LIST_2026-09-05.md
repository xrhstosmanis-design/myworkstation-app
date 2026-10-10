

## 10/10/2026 21:38 Athens — DAILY BITE published POS layout / ASSIGNED
Owner `codex/daily-bite-pos-layout-live-20261010`, issue #2054. Fresh production readback shows DAILY BITE store `cmv25lf3h000ueegf0kkii3pb` has no `StorePosLayout` row (version/publishedAt/layoutJson null), so the screenshot preset and coffee behavior are not yet visible as an actual published POS layout.

Bounded next step: create one idempotent DAILY-only published layout using MyWorkStation theme, the user-supplied screenshot category mappings, and existing DAILY product IDs. Include prepared-coffee access through existing production categories. Keep quick keys empty unless explicitly mapped. Never touch KAT layout/data, never reimport products or recreate departments, and never change product economics/stock/fiscal/roles. Fail closed if DAILY store/company or mappings are invalid. Physical/cashier acceptance remains separate.

Current state: ASSIGNED / NOT TESTED.


## 10/10/2026 21:45 Athens — DAILY BITE published POS layout implementation / AWAITING CI
Owner `codex/daily-bite-pos-layout-live-20261010`, issue #2054. Implemented one-shot DAILY-only StorePosLayout publication after the already-LIVE coffee bootstrap. Layout uses MyWorkStation theme, 20 empty quick keys, 12 visible categories (2 prepared-coffee groups + 10 user-supplied screenshot groups) and 2 hidden blanks. Screenshot groups resolve only exact normalized DAILY product names; missing/ambiguous names are recorded and not guessed. The startup patch inserts only if DAILY has no existing layout and records a durable marker; it will not overwrite later manual layout edits. No product economics, stock, fiscal, payment, shift, role or KAT layout/data mutations. AWAITING CI; LIVE publication not yet executed.
