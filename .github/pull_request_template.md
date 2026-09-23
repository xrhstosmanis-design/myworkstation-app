## Αλλαγή

- Περιγραφή:
- Επηρεαζόμενο module/flow:

## Έλεγχοι

- [ ] Διάβασα `AGENTS.md`, την κεντρική ενεργή λίστα και τα σχετικά checkpoints/manual.
- [ ] Κατέγραψα το πραγματικό status ως LAB PASS, LAB FAIL ή NOT TESTED.
- [ ] Το CI είναι πράσινο πριν από merge.
- [ ] Επιβεβαιώθηκε το ακριβές production revision πριν ζητηθεί LAB.

## Υποχρεωτικό PASS → manual

Συμπληρώνεται μόνο όταν υπάρχει πραγματικό `LAB PASS`, `LIVE PASS` ή `USER PASS`:

- [ ] Ενημερώθηκε το σχετικό checkpoint με την πραγματική απόδειξη.
- [ ] Ενημερώθηκε το `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md` και έκλεισαν οι παλιές εκκρεμότητες του ίδιου flow.
- [ ] Δημιουργήθηκε ή ενημερώθηκε το `docs/manual/<module>/PASS.md` με δικαιώματα, πρόσβαση, δοκιμασμένα βήματα, όρια ασφαλείας, PASS criteria και troubleshooting.
- [ ] Δεν χαρακτηρίστηκε ως πραγματικό PASS αποτέλεσμα που είναι μόνο CI/local/simulated.

Αν δεν υπάρχει πραγματικό PASS, γράψτε `AWAITING LAB` και μην προσθέσετε τη λειτουργία στο manual.
