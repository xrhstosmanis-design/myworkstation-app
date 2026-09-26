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

## Deployed retest — 26/09/2026, Render `6edcf34f7e2da6b939bdf4fa06b211b3b1929305`

- PR #1341 / CI #3421 PASS. The pre-existing September DRAFT was read back without a duplicate: 7 employees, gross 19,67 €, paid 0,00 €, balance 19,67 €.
- LAB POS 2 received an internal BANK_TRANSFER payroll entry of 5,00 €: paid 5,00 €, remaining 14,67 €. A second entry of 14,67 € resulted in paid 19,67 €, balance 0,00 €.
- Platform Admin → Τράπεζα displayed the two LAB ledger entries separately as −5,00 € and −14,67 €, both `Σε αναμονή` / without proof. No external bank transfer occurred and neither entry was confirmed as reconciled.
- Attempting final lock with a reason returned `Υπάρχουν 9 παρουσίες που χρειάζονται κλείσιμο ή έγκριση.` The DRAFT remained open. Those attendance records have not been reviewed or changed.
- The old store-transaction overview used by Platform Super Admin still returns `Δεν βρέθηκε ενεργό κατάστημα`. A narrower payroll-scoped, tenant-checked read-only open-cash-sessions endpoint is proposed separately. Cash payment **NOT TESTED**. Full Payroll **OPEN**.
