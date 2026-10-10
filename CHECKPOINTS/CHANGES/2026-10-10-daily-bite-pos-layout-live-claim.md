# DAILY BITE published POS layout claim — 10/10/2026

Owner `codex/daily-bite-pos-layout-live-20261010`, issue #2054.

Fresh production readback shows DAILY BITE store `cmv25lf3h000ueegf0kkii3pb` has no `StorePosLayout` row. Therefore the already-completed screenshot preset and coffee modifier LIVE PASS are not yet represented in an actual published DAILY BITE POS layout.

## Bounded scope
- publish one DAILY BITE-only layout;
- MyWorkStation theme/colors;
- use existing DAILY product IDs only;
- expose prepared coffees through the existing production categories;
- include the user-supplied screenshot categories;
- leave unmapped fixed slots blank;
- no KAT layout/data mutation;
- no product reimport, department recreation, stock/fiscal/payment/shift/role changes;
- fail closed on invalid/missing/ambiguous product mappings;
- idempotent one-shot behavior; do not overwrite later manual POS edits.

Status before implementation: ASSIGNED / NOT TESTED.
