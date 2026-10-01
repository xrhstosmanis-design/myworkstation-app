# Workforce mobile employee card — 01/10/2026

## Assignment

- Branch: `agent/workforce-mobile-card-20261001`
- PR: #1598
- Scope: employee mobile access to the already-issued Workforce work card, plus BackOffice invitation action.

## Implemented

- Reuses the existing Workforce v2 employee and deterministic work-card code; no second employee/card dataset.
- Adds `Αποστολή εφαρμογής` beside the existing printable card action.
- Invitation opens Store Mode in employee-card mode and preselects the intended employee when that employee has a PIN.
- Adds isolated mobile PIN login with a `WORKFORCE_MOBILE` JWT scoped to `WORK_CARD_SELF` only; it does not create a POS operator session and does not bind the phone to a POS terminal.
- Adds `Η κάρτα μου` mobile view that returns only the authenticated employee's active card and renders its QR.
- Existing POS attendance IN/OUT scan semantics and printable card flow are unchanged.

## Acceptance status

- CI: rerun required after checkpoint/active-list update.
- Deploy: AWAITING.
- Physical employee phone install/login/QR scan: NOT TESTED.
- Final status: AWAITING CI / DEPLOY / LAB USER PASS.

## Safety boundaries

No sale, payment, stock, fiscal, payroll, attendance mutation or BackOffice employee access is added by this change.
