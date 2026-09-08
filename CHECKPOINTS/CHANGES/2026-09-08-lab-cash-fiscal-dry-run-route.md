# LAB checkpoint — cash sale POS/RBS route for Fiscal DRY RUN

Date: 2026-09-08
Base main: ab1c27d5787eed1b81dce88e3927df68a33dbc34
Branch: agent/lab-cash-fiscal-dry-run-route-20260908

## Finding

The LAB POS cash sale completed successfully as NON_FISCAL, but the Fiscal Bridge DRY RUN screen could not find a completed sale with POS/RBS mapping. The existing POS completion path created PaymentDeviceRouteAttempt only for card/EFTPOS amounts.

## Change

- Added a fiscal-only cash route when the LAB store has exactly one active StoreFiscalDevice for the terminal.
- Cash routes record the terminal and RBS device with eftposDeviceCode=NOT_APPLICABLE.
- Existing card/EFTPOS routing remains unchanged.
- The route is used only for validation/DRY RUN; no RBS, CapDriver, EFTPOS or fiscal command is sent.
- Ordinary NON_FISCAL sales remain allowed when no fiscal device mapping exists; they simply remain ineligible for Fiscal DRY RUN.

## Required verification

- [ ] CI green.
- [ ] LAB backup remains available.
- [ ] Create one new completed cash NON_FISCAL sale in LAB.
- [ ] Fiscal DRY RUN candidate appears with POS/RBS mapping.
- [ ] Execute DRY RUN twice.
- [ ] Both runs show externalExecution=false, rbsWrite=false, capDriverWrite=false, fiscalIssuance=false.
- [ ] Second run is idempotent and does not create a duplicate.
- [ ] No real fiscal/payment command is executed.

Until the LAB checks above pass, this item is not installation-ready.
