# Workforce Payroll — LAB period load — 26/09/2026

## Actual LAB result

- Platform Admin → Προσωπικό & Πρόγραμμα → MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ → Μισθοδοσία.
- September 2026 preview: 7 employees, 19,67 €.
- Creating a period returned the success message «Η περίοδος μισθοδοσίας δημιουργήθηκε ως προσχέδιο», but the selector still showed «Δεν υπάρχει περίοδος» and the page showed «Δεν βρέθηκε ενεργό κατάστημα».
- Refreshing the payroll workspace and the whole page did not expose the period. **LAB FAIL** for selecting the newly created period. Payment, cash/bank linkage, and closing remain **NOT TESTED**.
- The UI reports a successful POST before requesting both the payroll periods and the cash-shift overview in one `Promise.all`. Failure of the latter discards the successful periods response. The period's database persistence has not been separately verified.

## Narrow correction — AWAITING CI / DEPLOY / LAB

Load payroll periods independently of the cash-shift overview. A failed overview leaves the periods selectable, shows its own warning, and prevents a cash payment until the overview can load. The existing server-side active-shift guard remains in force. No payment, employee, or period data is changed by this code fix.

Targeted tests cover an overview rejection with a valid period response and a failing periods request. Retest the existing September draft first; do not create a duplicate or record any payment until its actual state is visible. Only then continue partial/full payment, cash/bank linkage, and locking in LAB.
