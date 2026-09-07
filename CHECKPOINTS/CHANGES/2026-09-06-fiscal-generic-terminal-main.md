# Checkpoint — Fiscal DRY RUN generic terminal validation from current main

Date: 2026-09-06
Branch: `fix/fiscal-generic-terminal-main-20260906`

## Change

- Ευθυγράμμιση της επικύρωσης terminal IDs με το σημερινό `main` και το MYWORKSTATION LAB.
- Επιτρέπονται μόνο trimmed IDs 1–80 χαρακτήρων με ασφαλείς ASCII χαρακτήρες.
- Διατηρούνται store-scoped route matching, idempotency, payload hash και όλα τα no-execution locks.

## Safety

Δεν ενεργοποιείται και δεν εκτελείται πραγματική εντολή fiscal, RBS, CapDriver ή EFTPOS.

## Next

Μετά από πράσινο CI και merge συνεχίζουμε το HOME-04 controlled DRY RUN στο ήδη mapped `KAT-POS-02`.
