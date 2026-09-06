# Checkpoint — HOME-04 safe terminal self-activation

Date: 2026-09-06

## Change

- Added «Άνοιγμα σε αυτό το PC» next to each one-time terminal activation URL in Platform Admin.
- The action navigates directly to the server-issued same-origin activation URL.
- The activation token is not read, copied, logged or exposed to the operator or automation layer.
- The existing «Αντιγραφή link» flow remains available for installation on another physical PC.
- Personal PIN/card authentication is still required after terminal activation.

## Safety boundary

- This change does not create a sale, payment, fiscal document or device command.
- It does not contact RBS, CapDriver, EFTPOS or a fiscal provider.
- It does not change Fiscal/EFTPOS mappings.
- It removes the need to manually handle a sensitive one-time activation URL when activating the current PC.

## Verification

- Contract test covers the self-activation handler, visible action and same-origin navigation.
- Frontend build and full CI must pass before live use.

## Exact next step

After deployment, issue a fresh one-time link for the already mapped `KAT-POS-02`, activate the controlled browser with «Άνοιγμα σε αυτό το PC», sign in through the existing personal operator flow, complete one controlled `NON_FISCAL` card sale, and execute the same Fiscal DRY RUN twice. Confirm identical payload hash, idempotent replay and zero external execution; then continue with `MOD-02`.
