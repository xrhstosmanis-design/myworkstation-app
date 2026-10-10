

## 10/10/2026 21:38 Athens — DAILY BITE published POS layout / ASSIGNED
Owner `codex/daily-bite-pos-layout-live-20261010`, issue #2054. Fresh production readback shows DAILY BITE store `cmv25lf3h000ueegf0kkii3pb` has **no StorePosLayout row** (version/publishedAt/layoutJson all null), so the screenshot preset and coffee behavior are not yet visible as an actual published POS layout.

Bounded next step: create one idempotent DAILY-only published layout using MyWorkStation theme, the user-supplied screenshot category mappings, and the existing DAILY catalog IDs. Include prepared-coffee access through the existing production categories, keep quick keys empty unless explicitly mapped, never touch KAT layout/data, never reimport products or recreate departments, and never change product economics/stock/fiscal/roles. Fail closed if the DAILY store/company or mapped products are missing/ambiguous. Do not overwrite a later manually published layout after the one-shot marker has been applied.

Current state: ASSIGNED / NOT TESTED. Physical/cashier POS acceptance remains separate after deployment.
