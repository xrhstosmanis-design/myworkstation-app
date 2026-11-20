# Νο 5 — Παραχώρηση προβολής κατάστασης μηνιαίας απογραφής

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · συνέχεια PR #4007 από remote2a3a423c. Η πλήρης κάλυψη παραμένει OPEN.

Προστέθηκε ανεξάρτητο `monthly-inventory.read` (53 STORE capabilities): ακριβές GET `/api/monthly-inventory-capture/status?storeId=...`, με επιλεγμένο company/store, INVENTORY και live προσωπικό grant πριν/μετά. Η SELECT-only προβολή απαιτεί native schema/guards και τρέχον CAPTURE fence, επανελέγχει generation/maintenance μετά την ανάγνωση και επιστρέφει μόνο active, firstIssueMonth, firstScheduledFor, grantedAt, revokedAt. Απορρίπτει ασυνεπείς αποθηκευμένες καταστάσεις. Δεν εκθέτει actor/session/activation/revision/lifecycle tokens.

Η προσωπική προβολή επαναχρησιμοποιεί την native παρουσίαση κατάστασης με σαφή ένδειξη μόνο ανάγνωσης, χωρίς Owner hooks ή διαχείριση/λήψη τώρα. Καθυστερημένα αποτελέσματα προηγούμενης επιλογής αγνοούνται, refresh/σφάλμα καθαρίζει δεδομένα. Τα αρχικά προσωπικά Owner/SuperAdmin endpoints και η εξουσιοδότηση προγραμματιστή παραμένουν χωριστά και απαγορευμένα σε προσωπικό χειριστή. Η παραχώρηση δεν επιβεβαιώνει εκτέλεση scheduler ή πραγματική απογραφή.

Τοπικά Node24: τελική σχετική συνδυασμένη εκτέλεση53PASS/3SKIP/0FAIL (56σύνολο, τρία native PostgreSQL skips). Το πραγματικό Chromium test απέτυχε προηγουμένως στην εκκίνηση με ECONNRESET πριν από αλληλεπίδραση, όπως ο γνωστός τοπικός περιορισμός· εξαιρέθηκε ονομαστικά από την τελική τοπική εκτέλεση, όχι από CI. Οι21 native προσωπικές mounted ροές και4 νέες scoped mounted ροές πέρασαν. Build PASS. Οι επιμέρους αριθμοί επικαλύπτονται και δεν αθροίζονται.

Το προηγούμενο CI44263431364 πέρασε τον νέο native PostgreSQL COMPANY compatibility έλεγχο και τα δύο διορθωμένα ledger fixtures, αλλά απέτυχε σε άσχετο wholesale fixture που αναζητούσε substring999 σε όλο το JSON: δυναμικό timestamp μπορεί νόμιμα να περιέχει999. Το fixture ελέγχει πλέον ρητή απουσία ιδιωτικών πεδίων προϊόντος, με διατήρηση ακριβούς projection assertion και regression clock. Business runtime αμετάβλητο. Νέο CI απαιτείται στο ακριβές επόμενο head.

Δεν έγινε deployment, schema migration ή νέα δοκιμή πραγματικών λογαριασμών. COMPANY persistence/εγκατάσταση/κατάλογοι και προσωπικές ενέργειες μηνιαίας λήψης παραμένουν υπό υλοποίηση. Οι κοινές δοκιμές POS/SuperAdmin/Ιδιοκτήτη θα γίνουν στο τέλος σύμφωνα με την εντολή χρήστη.

Publication reconciliation: CI44265548556 at6c69720c failed because the temporary monthly-only Workspace index blob had unmatched JSX closing tags. Earlier local mounted/build evidence concerned the complete working-tree candidate, not that partial index. The complete source candidate restores valid JSX and is rebuilt/retested before the next publication. This is a real publication error, not an environment skip. Chat probe44265548239 passed but does not override the failed build/test jobs.
