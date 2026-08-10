# MyWorkStation checkpoint — Διαχείριση / Επαγγέλματα

Ημερομηνία: 2026-08-11 00:43 (+03:00)

## Scope
- Νέο tab Διαχείριση → Επαγγέλματα.
- Grid: Κωδ, Περιγραφή, μολύβι, κάδος.
- Κάτω actions: Κλείσιμο, Ανανέωση, Νέα εγγραφή, Excel / CSV, Συγχρονισμός.
- Πραγματικό company-scoped `ManagementCustomerProfession`.
- Προαιρετική σύνδεση `Customer.customerProfessionId`.
- Soft deactivate.
- Συγχρονισμός = local-only integrity check. Καμία ψεύτικη εξωτερική πηγή.
- CORE guard + management roles.
- Event bootstrap χωρίς νέο MutationObserver.
- MyWorkStation navy/teal palette.

## Branch
`feat/management-professions-v1`

## Επόμενο βήμα
PR → CI → merge → Render SUCCESS, μετά final checkpoint.
