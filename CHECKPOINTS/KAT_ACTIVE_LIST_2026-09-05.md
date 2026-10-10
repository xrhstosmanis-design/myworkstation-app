

## 10/10/2026 21:38 Athens — DAILY BITE published POS layout / ASSIGNED
Owner `codex/daily-bite-pos-layout-live-20261010`, issue #2054. Fresh production readback shows DAILY BITE store `cmv25lf3h000ueegf0kkii3pb` has no `StorePosLayout` row (version/publishedAt/layoutJson null), so the screenshot preset and coffee behavior are not yet visible as an actual published POS layout.

Bounded next step: create one idempotent DAILY-only published layout using MyWorkStation theme, the user-supplied screenshot category mappings, and existing DAILY product IDs. Include prepared-coffee access through existing production categories. Keep quick keys empty unless explicitly mapped. Never touch KAT layout/data, never reimport products or recreate departments, and never change product economics/stock/fiscal/roles. Fail closed if DAILY store/company or mappings are invalid. Physical/cashier acceptance remains separate.

Current state: ASSIGNED / NOT TESTED.
