# #27 — κόστος επιστροφών / ακυρώσεων

ASSIGNED στην ίδια σελίδα, branch `codex/task27-returns-review-20261001`, βάση c97e151. Προηγούμενα missing-cost και ημερολογιακά LIMITED LAB PASS προστατεύονται. Διάβασα τις νεότερες ενεργές εκκρεμότητες, manual profitability και κεντρική λίστα.

Πηγή: pos-sale-actions δημιουργεί COMPLETED POS_REVERSAL, αρνητικές ποσότητες/γραμμές και originalSaleId· η αρχική Sale μένει COMPLETED. Η αναφορά ήδη περιλαμβάνει τις αντίστροφες γραμμές σωστά στα έσοδα, αλλά LATERAL purchase cost αναζητεί έως occurredAt της επιστροφής. Μπορεί να αναιρέσει διαφορετικό κόστος μετά από νεότερη αγορά. Θα χρησιμοποιεί την αρχική ημερομηνία, μόνο με ίδιο company/store και έγκυρη αρχική πώληση. Σπασμένος σύνδεσμος θα δηλώνει άγνωστο κόστος. Μετρητές επιστροφών/ακυρώσεων θα εξηγούν τη συμπερίληψη χωρίς νέα οικονομική πράξη.

ΦΠΑ εξόδων: τα ποσά πληρωμών καταγράφονται μικτά, το υπάρχον πεδίο εξόδων εμφανίζεται ως χωρίς ΦΠΑ, ενώ πλήρης VAT συνδεδεμένου παραστατικού μπορεί να επαναληφθεί για μερικές πληρωμές. Χωρίς εγκεκριμένη πηγή δεν μπορεί να θεωρηθεί ασφαλές μηδέν. Καταγράφεται ξεχωριστά OPEN, δεν αλλάζει σε αυτό το σκέλος.

Scope: υπάρχουσα read-only αναφορά CASH_CONTROL, auth/tenant/store/licensing/POS/stock/fiscal και κλειδωμένο PROFITABILITY ίδια. Απομονωμένο SQL/HTTP fixture πριν/μετά κόστος αγοράς και reversal· snapshots αμετάβλητα μετά από report GET. CI/exactdeploy πριν από read-only LAB, με δύο fresh POS baselines. Καμία prod DB mutation ή νέα επιστροφή/πώληση/πληρωμή. Πλήρες ιστορικό κόστος και συνολικό #27 OPEN.

## Τοπική επικύρωση

Node 20: 1.777 server PASS / 0 FAIL / 1 optional PG SKIP χωρίς DATABASE_URL, 13 στοχευμένες PASS, production client/server build PASS, diff check PASS. Νέο isolated SQL/HTTP fixture AWAITING CI: αρχικό κόστος2 έναντι νεότερου9, multi-line RETURN μετρά μία φορά, CANCEL ξεχωριστά, αντίστροφα έσοδα−30/κόστος−6, συνδυασμένη περίοδος μηδενίζεται και orphan profit NULL. Production δεδομένα δεν μεταβλήθηκαν.
