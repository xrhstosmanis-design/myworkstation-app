# MyWorkStation checkpoint — Διαχείριση / PoS τερματικά

Ημερομηνία: 2026-08-11

## Ολοκληρωμένο

- PR #131: `Management POS terminals`
- Merge commit: `2c8ccf3681cd5cb8e87ecc33ab36240f9f25809c`
- CI #181: SUCCESS (tests + production build)
- Render deployment: SUCCESS

## Διαχείριση → PoS τερματικά

Υλοποιήθηκε πραγματικό company-scoped `ManagementPosTerminal`, συνδεδεμένο με πραγματικό `ManagementBank`.

Κύριο grid:
- Τράπεζα
- Ονομασία τερματικού / TID
- τρόπος πληρωμής
- IRIS / IRIS πληρωμή
- βοηθ. πεδίο 1 / κωδ. ετεροχρ
- ενημέρωση / παρατηρήσεις
- κάδος (soft deactivate)

Μολύβι → `Διόρθωση PoS τερματικού`:
- τράπεζα
- ενεργό
- IRIS
- Ονομασία
- κωδ. τρόπου πληρωμής
- TID
- κωδ. ετεροχρ
- βοηθ. πεδίο 1
- δ/νση IP
- port
- βοηθ. πεδίο 3
- On Line (1155 / middleware)
- παρατηρήσεις
- Επιστροφή / Καταχώρηση

Κάτω actions:
- Κλείσιμο
- Ανανέωση
- Νέα εγγραφή

## Ασφάλεια / αρχιτεκτονική

- SUPER_ADMIN / OWNER / ADMIN / MANAGER μόνο.
- Tenant/company scope σε όλα τα CRUD.
- Soft deactivate, όχι destructive delete.
- Δεν δημιουργούνται fake EDPS/TID εγγραφές από τις φωτογραφίες.
- IP/port/middleware αποθηκεύονται μόνο ως ρυθμίσεις. Δεν δηλώνεται ούτε εκτελείται πραγματική EFTPOS/τραπεζική διασύνδεση χωρίς πραγματικό middleware connector.
- Δεν προστέθηκε νέος MutationObserver.
- Διατηρείται το MyWorkStation navy/teal theme.
