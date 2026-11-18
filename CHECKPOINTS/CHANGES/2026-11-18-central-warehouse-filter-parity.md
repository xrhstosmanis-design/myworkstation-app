## 18/11/2026 — CENTRAL-WAREHOUSE-FILTER-PARITY-01 — SOURCE CANDIDATE / AWAITING CI AND LAB

Before-source claim #4027 merged `44ccf51976ba7baa03e37f582e260fd914bf9796`. Same /root owner, independent source scope retained. The Central/Owner archive now renders the existing VAT department and margin range controls already used by POS, with the same responsive filter panel and visible Filters focus/scroll action. Category/subcategory/status selections apply immediately like POS and reset pagination. Search, VAT, margin, selected-store read binding, capabilities, readOnly and staff edit boundaries retain their existing semantics. No backend/API, product/stock/price, permission, module, schema or financial/fiscal change.

Local validation on Node24.22.1: retained inventory-bulk-merge-mounted, inventory-archive-kiosk-v1 and product-card-vat-mounted suites 16/16 PASS, 0 FAIL/SKIP. An initial heading-only compatibility failure was corrected by retaining the existing Central heading. Separate temporary mounted actual-React verification with synthetic API responses passed for Central, POS and readOnly: VAT/margin combined with category/subcategory/status/text, first-page reset, selected-store replacement and header focus. 27 GET requests, zero writes. No permanent test mirroring this low-impact rendering change was added.

Final frontend build PASS (Vite30.18s), TABLE_SERVICE bundle verification PASS, diff --check PASS. Local Chromium visual execution was unavailable because the execution environment denied its process-singleton socket; no screenshot or visual/device PASS is claimed. The CSS reuses the existing POS filter layout and adds single-column narrow forms. Full exact-head Node20 CI and installed Central/physical-device acceptance remain outstanding.

Next: source PR/full CI; owner approval for source merge/publication; existing LAB/common final acceptance without changing stock, prices, permissions or stores. Do not repeat prior POS Filters USER PASS, and do not confuse the earlier PDF/shift-close acceptance with this independent warehouse request. Manual PASS is unchanged until genuine acceptance.

## 18/11/2026 21:31 Αθήνας — CENTRAL-WAREHOUSE-FILTER-PARITY-01 — ASSIGNED /root / BEFORE SOURCE

Νέο αίτημα ιδιοκτήτη της 18/11/2026 με δύο εικόνες: ίδια επάνω φίλτρα στην αποθήκη της Κεντρικής Διαχείρισης όπως στην αποθήκη από POS. Branch `feat/central-warehouse-filter-parity-20261118`, base `0a45f48d6`. Ανεξάρτητο στενό scope εμφάνισης/αναζήτησης, χωρίς ανάληψη δικαιωμάτων, επεξεργασίας προϊόντων, imports, merges ή αποθέματος άλλων σελίδων.

Before-source scope: μόνο `client/src/components/commerce/InventoryArchivePanel.jsx` για κοινά φίλτρα/κουμπί μετάβασης και `client/src/components/commerce/inventory-archive.css` για το αντίστοιχο responsive πλαίσιο. Επαναχρησιμοποίηση υπαρχόντων VAT department και marginMin/marginMax controls, state και selected-store GET query, χωρίς νέο API ή server αλλαγή. Κατηγορία, υποκατηγορία, Περιγραφή/SKU/Barcode, ενεργά/όλα/ανενεργά, Τμήμα ΦΠΑ/χωρίς τμήμα και Margin από–έως παραμένουν στο ίδιο κατάστημα και επαναφέρουν τη σελιδοποίηση κατά την εφαρμογή. Τα POS capabilities/readOnly/staff permissions, writers, ποσότητες/τιμές, stock/financial/fiscal και οι λοιπές αναθέσεις παραμένουν ανέπαφα.

Έγινε ανάγνωση τρέχοντος AGENTS/COMMON_WORK_RULE, tracker, pending roadmap, ενεργών/ιστορικών checkpoints, αριθμημένης λίστας, εγχειριδίου inventory και σχετικών warehouse checkpoints της 14/11. Το source επιβεβαιώνει ότι το ίδιο component ήδη έχει τα δύο νέα φίλτρα μόνο υπό operatorMode. Το POS layout παρέχεται από το scoped overlay CSS. Το existing USER PASS του POS κουμπιού Φίλτρα προστατεύεται, δεν επαναλαμβάνεται. Δεν βρέθηκε ξεχωριστή τρέχουσα ανάθεση για αυτήν τη γενική parity επέκταση.

Κατάσταση BEFORE SOURCE / NOT TESTED. Η καταγραφή πρέπει να δημοσιευτεί στο main πριν τη συγκεκριμένη αλλαγή κώδικα. Έλεγχοι: υφιστάμενες στοχευμένες δοκιμές archive/filters και build, με συνθετική μη οικονομική επαλήθευση ότι Κεντρική και POS στέλνουν τα ίδια scoped φίλτρα. Καμία παραγωγική αλλαγή δεδομένων, νέα άδεια ή οικονομική δοκιμή. Πραγματική αποδοχή Κεντρικής παραμένει για την κοινή συνεδρία στο τέλος. Source publication/deployment προς τελική έγκριση μετά από συγκεκριμένο ελεγμένο PR.

Checkpoint: `CHECKPOINTS/CHANGES/2026-11-18-central-warehouse-filter-parity.md`.

