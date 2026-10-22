# ftext — verified STATUS communication only

22 October 2026, 18:29 Europe/Athens. The authorized owner/technician used the final Rizareio Windows PC through AnyDesk. This is a LIMITED USER-observed physical communication PASS, not generic model certification, cloud pairing or POS checkout acceptance.

## Verified flow

1. Existing licensed FTEXT+25.02 remains configured for the intended DATECS device, SOLIDUS(II)T, txt input and C:\FText.
2. Transfer the selected terminal's diagnostic ZIP to Downloads on its final PC, extract all files into its own folder, keep FTEXT+ open and the register idle.
3. Open RUN_STATUS.cmd once. The preconfigured tool emits only STATUS with a unique first-line RESULT_FILENAME and accepts only the configured device serial.
4. The supplied screenshot shows ok true/code0 and the configured serial for RIZAREIO-POS-01. The tool's fiscalExecution flag is false. Press any key to close its completed console; do not rerun for documentation.

Company/store/terminal are local configuration boundaries in this diagnostic package; cloud authorization is not implemented in this accepted slice. Do not copy its config to another store/POS. The source is generic but this observation applies only to the tested installation. Source PR3021/main201eb5e, 29 Windows cases and green exact-main tests preceded delivery.

## Limits and troubleshooting

No fiscal sale, card charge, stock or shift reconciliation was tested. No independent before/after business baseline exists for this STATUS run. POS checkout, central settings/pairing, online heartbeat, Windows-login startup and another model/device are OPEN. A successful STATUS must not label a POS sale issued or paid. No fiscal test receipt without owner consultation.

On timeout, foreign serial or malformed reply, leave the unresolved marker and files intact; reopening reads the same reply without resending. Pending foreign txt input is left untouched and blocks the check. A technician inspects the selected folder/device before recovery. Do not reprogram FTEXT+, clear input folders, change licence or restart unrelated RBS connections as a diagnostic step.
