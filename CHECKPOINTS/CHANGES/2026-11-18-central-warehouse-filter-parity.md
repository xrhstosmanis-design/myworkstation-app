## 18/11/2026 21:31 Αθήνας — CENTRAL-WAREHOUSE-FILTER-PARITY-01 — ASSIGNED /root / BEFORE SOURCE

Νέο αίτημα ιδιοκτήτη της 18/11/2026 με δύο εικόνες: ίδια επάνω φίλτρα στην αποθήκη της Κεντρικής Διαχείρισης όπως στην αποθήκη από POS. Branch `feat/central-warehouse-filter-parity-20261118`, base `0a45f48d6`. Ανεξάρτητο στενό scope εμφάνισης/αναζήτησης, χωρίς ανάληψη δικαιωμάτων, επεξεργασίας προϊόντων, imports, merges ή αποθέματος άλλων σελίδων.

Before-source scope: μόνο `client/src/components/commerce/InventoryArchivePanel.jsx` για κοινά φίλτρα/κουμπί μετάβασης και `client/src/components/commerce/inventory-archive.css` για το αντίστοιχο responsive πλαίσιο. Επαναχρησιμοποίηση υπαρχόντων VAT department και marginMin/marginMax controls, state και selected-store GET query, χωρίς νέο API ή server αλλαγή. Κατηγορία, υποκατηγορία, Περιγραφή/SKU/Barcode, ενεργά/όλα/ανενεργά, Τμήμα ΦΠΑ/χωρίς τμήμα και Margin από–έως παραμένουν στο ίδιο κατάστημα και επαναφέρουν τη σελιδοποίηση κατά την εφαρμογή. Τα POS capabilities/readOnly/staff permissions, writers, ποσότητες/τιμές, stock/financial/fiscal και οι λοιπές αναθέσεις παραμένουν ανέπαφα.

Έγινε ανάγνωση τρέχοντος AGENTS/COMMON_WORK_RULE, tracker, pending roadmap, ενεργών/ιστορικών checkpoints, αριθμημένης λίστας, εγχειριδίου inventory και σχετικών warehouse checkpoints της 14/11. Το source επιβεβαιώνει ότι το ίδιο component ήδη έχει τα δύο νέα φίλτρα μόνο υπό operatorMode. Το POS layout παρέχεται από το scoped overlay CSS. Το existing USER PASS του POS κουμπιού Φίλτρα προστατεύεται, δεν επαναλαμβάνεται. Δεν βρέθηκε ξεχωριστή τρέχουσα ανάθεση για αυτήν τη γενική parity επέκταση.

Κατάσταση BEFORE SOURCE / NOT TESTED. Η καταγραφή πρέπει να δημοσιευτεί στο main πριν τη συγκεκριμένη αλλαγή κώδικα. Έλεγχοι: υφιστάμενες στοχευμένες δοκιμές archive/filters και build, με συνθετική μη οικονομική επαλήθευση ότι Κεντρική και POS στέλνουν τα ίδια scoped φίλτρα. Καμία παραγωγική αλλαγή δεδομένων, νέα άδεια ή οικονομική δοκιμή. Πραγματική αποδοχή Κεντρικής παραμένει για την κοινή συνεδρία στο τέλος. Source publication/deployment προς τελική έγκριση μετά από συγκεκριμένο ελεγμένο PR.

Checkpoint: `CHECKPOINTS/CHANGES/2026-11-18-central-warehouse-filter-parity.md`.

