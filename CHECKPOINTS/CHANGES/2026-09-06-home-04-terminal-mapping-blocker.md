# Checkpoint — HOME-04 terminal mapping blocker

Date: 2026-09-06

## Live evidence

- Platform Admin → Fiscal DRY RUN remained locked in safe mode:
  - mode `DRY_RUN`
  - RBS write `ΟΧΙ`
  - CapDriver write `ΟΧΙ`
  - fiscal receipt issuance `ΟΧΙ`
- No eligible completed `NON_FISCAL` sale with a recorded POS/RBS route existed.
- Store Mode login succeeded for operator `ΑΘΗΝΑ ΜΑΡΗ`.
- A single `ΝΕΡΟ ΖΑΓΟΡΙ 500ML` line at 0.50 EUR was prepared.
- Card checkout stopped fail-closed before sale creation with: `Δεν έχει αντιστοιχιστεί ενεργή ταμειακή στο MAIN.`

## Mapping evidence

- The operator session resolved to terminal `MAIN`.
- `MAIN` has no active fiscal mapping.
- `KAT-HOME-TEST` is active but has no stored fiscal/EFTPOS mapping.
- `KAT-POS-02` is active and has the stored mapping:
  - fiscal device `KAT-FISCAL-02`
  - in-store EFTPOS `KAT-EFTPOS-02A`
  - delivery EFTPOS `KAT-EFTPOS-02B`

## Safety result

- No `Sale`, `Payment`, `PaymentDeviceRouteAttempt`, `FiscalBridgeDryRun` or fiscal document was created.
- No command was sent to RBS, CapDriver or EFTPOS.
- Do not repeat the card attempt from terminal `MAIN`.

## Exact next step

Use a dedicated `KAT-HOME-TEST` mapping/activation or the already mapped `KAT-POS-02`. Create one controlled completed `NON_FISCAL` card sale, execute the same Fiscal DRY RUN twice, and confirm an idempotent replay with the same payload hash and no external execution. Then continue with `MOD-02`.
