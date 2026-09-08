# DEV-15 checkpoint — rollout backup and rollback gate

Date: 2026-09-08
Base main: f2c96e595566bc9b404767a62e26b571d2afc70c

## Existing implementation confirmed
- Existing pilot backup/restore invariants, rolling-schema checks, restart recovery tests and backup UI tests were found.
- Existing Windows installer/preflight and store-terminal installation tests were found.
- No duplicate backup engine or installer was added.

## Shared rollout checklist
- [ ] LAB application/database backup completed before test data changes.
- [ ] Backup artifact identity and timestamp recorded.
- [ ] Restore performed only in isolated LAB scope.
- [ ] POS, shifts, invoice drafts, inventory and audit remain consistent after restore.
- [ ] No RBS, CapDriver, EFTPOS or fiscal command is sent.
- [ ] Rollback result recorded as PASS/FAIL in the next checkpoint.

## Gate
DEV-15 is not installation-ready until the checklist is executed in MYWORKSTATION LAB and recorded as PASS.