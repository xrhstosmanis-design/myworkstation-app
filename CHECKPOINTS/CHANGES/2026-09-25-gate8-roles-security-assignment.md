# Gate 8 — Χειριστές, ρόλοι και τελική ασφάλεια — ΑΝΑΤΕΘΗΚΕ

## Ιδιοκτησία

- Branch: `agent/gate8-roles-security-20260925`
- Κατάσταση: **OPEN / ΑΝΑΤΕΘΗΚΕ**
- Η ανάληψη έγινε στις 25/09/2026 μετά τη ρητή επιβεβαίωση του ιδιοκτήτη ότι το Gate 7 έχει ήδη PASS.
- Δεν αγγίζει Gate 3, Gate 4 ή Gate 6, τα οποία ανήκουν σε άλλες σελίδες.

## Υποχρεωτικό scope αποδοχής

1. Super Admin: μόνιμη πλήρης πρόσβαση και κεντρική εποπτεία.
2. Owner: μόνο η δική του εταιρεία, τα δικά του καταστήματα και τα ενεργά πληρωμένα modules.
3. Manager: μόνο οι ρητά επιτρεπόμενες λειτουργίες του καταστήματος.
4. Employee/χειριστής POS: μόνο η λειτουργία που απαιτεί η εργασία του, χωρίς οικονομικά, score, κερδοφορία ή απαγορευμένα στοιχεία.
5. PIN/κάρτα εργασίας: είσοδος χωρίς εμφάνιση ή αποθήκευση καθαρού PIN.
6. Tenant, store, module και store-override isolation.
7. Λήξη άδειας/συνδρομής και ασφαλής ανάκληση πρόσβασης.
8. Audit αλλαγών δικαιωμάτων, χειριστών και ενεργών συνεδριών.

## Πρώτη φάση

Γίνεται read-only απογραφή των υπαρχόντων ρόλων, endpoints, UI guards, module grants και δοκιμών ασφαλείας. Κάθε γραμμή χαρακτηρίζεται `LAB PASS`, `LAB FAIL` ή `NOT TESTED`. Δεν αλλάζουν χρήστες, PIN, άδειες, modules ή παραγωγικά δεδομένα μέχρι να αποδειχθεί συγκεκριμένο κενό και να καταγραφεί ασφαλής δοκιμή αποδοχής.

## Read-only τεχνική απογραφή — 25/09/2026

| Περιοχή | Τεκμήριο κώδικα / αυτοματισμού | Κατάσταση Gate |
|---|---|---|
| Super Admin | Υποχρεωτικό 2FA, ασφαλής συνεδρία, μόνιμο module bypass και ελεγχόμενο tenant-targeted support token | **NOT TESTED στο LAB** |
| Owner / Admin | Company-scoped stores, operator management μόνο μέσα στο tenant και πρόσβαση μόνο με ενεργή άδεια/module | **NOT TESTED στο LAB** |
| Manager / Employee / POS | Τα runtime δικαιώματα διαβάζονται ξανά από το ενεργό BackOffice profile· το όνομα ρόλου δεν δίνει αυτόματα οικονομικά δικαιώματα | **NOT TESTED στο LAB** |
| Tenant / store isolation | Απόρριψη cross-company store/reference και ακριβές store binding για `STORE_OPERATOR` | **NOT TESTED στο LAB** |
| Modules / store override | Company entitlement, ημερομηνίες έναρξης/λήξης και ρητό store override εφαρμόζονται server-side και fail closed | **NOT TESTED στο LAB** |
| Άδεια / συνδρομή | `EXPIRED`, `SUSPENDED`, ανενεργή εταιρεία ή ληγμένο `subscriptionEndsAt` κόβουν customer access | **NOT TESTED στο LAB** |
| PIN / κάρτα | PIN με bcrypt hash, κάρτα με SHA-256 hash, public responses μόνο `hasPin`, `hasCard`, `cardCodeLast4`· login lock 15 λεπτών μετά από 5 αποτυχίες | **NOT TESTED στο LAB** |
| Συνεδρίες / ανάκληση | Έλεγχος expiry, revoke, `sessionVersion`, ενεργού χρήστη/εταιρείας/καταστήματος και live operator role/profile σε κάθε αίτημα | **NOT TESTED στο LAB** |
| Audit | Auth, login/logout, credential/profile/role, session revoke και module/store αλλαγές καταγράφονται χωρίς PIN/hash | **NOT TESTED στο LAB** |

### Αυτοματοποιημένες δοκιμές

- Στοχευμένο Gate 8 security pack: **62/62 PASS**.
- Πλήρες server regression suite: **1511 PASS, 0 FAIL, 1 SKIP** σε 1512 tests.
- Το μοναδικό skip είναι προϋπάρχουσα δοκιμή legacy PostgreSQL constraint repair και δεν αποτελεί Gate 8 αποτυχία.
- Τα αποτελέσματα αποδεικνύουν κάλυψη κώδικα/regression, όχι τελικό LAB PASS.

## Ενιαίο LAB checkpoint που απομένει

1. Σύνδεση ως Super Admin και επιβεβαίωση 2FA, κεντρικής εποπτείας, access matrix και audit.
2. Σύνδεση ως Owner και απόπειρα πρόσβασης σε ξένη εταιρεία/κατάστημα και ανενεργό module.
3. Σύνδεση ως Manager και Employee/POS με διαφορετικά profiles: έλεγχος ότι κρύβονται και απορρίπτονται οικονομικά, score και profitability χωρίς ειδικό grant.
4. PIN/card login με έλεγχο ότι δεν εμφανίζεται ή επιστρέφεται αποθηκευμένο μυστικό και ότι καταγράφεται μόνο ασφαλές metadata.
5. Αλλαγή role/permissions και απενεργοποίηση χειριστή με επιβεβαίωση ότι η παλιά συνεδρία χάνει αμέσως πρόσβαση.
6. Προσωρινό LAB-only inactive module/store override και ληγμένη άδεια, με πλήρη καταγραφή πριν/μετά και επαναφορά στις αρχικές τιμές.
7. Τελική ανάγνωση Audit και συγκεντρωτικό PASS/FAIL για κάθε γραμμή του scope.

## Οπτικός έλεγχος BackOffice — πραγματικά ευρήματα

- **FAIL:** Η μπάρα modules εμφάνιζε κυριολεκτικά `\\n` ανάμεσα στα «RBS Observer» και «Κάμερες / Video Audit», επειδή escaped newline είχε αποθηκευτεί μέσα στο JSX.
- **FAIL:** Η καρτέλα εργαζομένου περιοριζόταν σε 500 px, παρότι έχει μεγάλη φόρμα και editor φυσικής γλώσσας, με αποτέλεσμα στενή διάταξη και διπλή αίσθηση κύλισης.
- **Διόρθωση:** αφαιρέθηκε το escaped κείμενο, η καρτέλα έγινε responsive 860 px / δύο στηλών σε desktop και μίας στήλης σε κινητό, και ο editor ομαδοποιήθηκε οπτικά μέσα στην ίδια φόρμα.
- **PRODUCTION VISUAL PASS:** PR #1292, CI #3271 και ακριβές Render revision `96fb51f6c0dfca37473617040164eb8c6ee9a2e0`.
- Στην πραγματική παραγωγική οθόνη τα «RBS Observer» και «Κάμερες / Video Audit» εμφανίζονται διαδοχικά χωρίς κυριολεκτικό `\\n`.
- Η πραγματική καρτέλα εργαζομένου μετρήθηκε στα 860 px σε viewport 1363 px, με δύο στήλες 397 px, editor 812 px και χωρίς οριζόντια υπερχείλιση. Δεν αποθηκεύτηκε καμία αλλαγή εργαζομένου.
- Το οπτικό σκέλος έχει PASS· το συνολικό Gate 8 παραμένει OPEN μέχρι την πραγματική αποδοχή ρόλων, απομόνωσης, αδειών, PIN/κάρτας, συνεδριών και Audit.

## Κριτήριο συνολικού PASS

Κάθε ρόλος βλέπει και εκτελεί μόνο ό,τι δικαιούται, σε σωστή εταιρεία και κατάστημα, με σωστή άδεια/module και πλήρες Audit. Τοπικά tests ή CI δεν αποτελούν LAB PASS.
