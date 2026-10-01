# Αναζήτηση προϊόντων Internet — read-only LAB PASS

**01/10/2026 — #14 READ-ONLY USER/LAB PASS · ευρύτερες write ροές OPEN:** exact production `/api/health` `35a52c4ef056453955b3764aefc8cf16e978f750`, #1586 / CI3985–3986 / deploy1844 PASS, Node20.20.2 /1727 serverPASS /0FAIL /0SKIP /build/invariants/E2E PASS. MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ: μία τελική query5449000000996 στις12:11:21 browser επέστρεψε9 αποτελέσματα, history14→15. Αποθήκη/σύνδεση barcode, active provider, unit/ambiguous price guard και net margin LAB PASS. SKU763 κόστος0,814, μικτή λιανική1,30,ΦΠΑ13% ⇒margin29,24%, ίδιο με αποθήκη. Matching5exact/3probable/1non-comparable,0manual confirmations. kalestimes unit rate κενό με λόγο· πολλαπλές τιμές κενές· πιθανή0,32 € και μη συγκρίσιμα δεν μπήκαν στη φθηνότερη ένδειξη0,93 €. Stock/λιανική μετά φρέσκο readback:1LT9/2,60,330ML0/1,30,500ML0/1,60 ίδια. MAIN2/2,40 €,POS02 2/0 € ίδια μετά refresh,1057 Audit ακριβώς ίδια. Δεν υποβλήθηκαν proposal,order,payment,stock ή price/VAT μεταβολές. Latest StockMovement/independentSQLcount, Owner live, disabled provider live και submission/approval/order write paths NOT TESTED· δεν δηλώνεται συνολικό PASS αυτών. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task14-internet-search-lab.md`, manual `docs/manual/internet-search/PASS.md`. Το ανατεθειμένο read-only σκέλος έκλεισε· τα ευρύτερα write σενάρια παραμένουν χωριστά OPEN.

## Επαληθευμένη χρήση

1. Platform Admin → signed support εταιρεία → BackOffice → Εμπορική λειτουργία → Αναζήτηση προϊόντων στο Internet.
2. Επιλέξτε ρητά το σωστό κατάστημα. Το panel αρχικά επιλέγει το πρώτο της λίστας.
3. Σύνδεση προϊόντος: γράψτε COCA και Αποθήκη προϊόντων· δείτε SKU/barcode/stock/αγορά/λιανική.
4. Επιλέξτε barcode5449000000996. Η σύνδεση COCA COLA330ML/SKU763 συμπληρώνει την query χωρίς να την εκτελεί.
5. Αναζήτηση: ο πραγματικός τελικός έλεγχος επέστρεψε9 πηγές και μία εγγραφή ιστορικού. Πιθανές απαιτούν ανθρώπινη επιβεβαίωση· μη συγκρίσιμες αποκλείονται.
6. Τιμή ανά λίτρο/κιλό ή αμφίσημα διαφορετικά ποσά μένουν κενά με αιτιολογία. Δεν επιλέγεται αυτόματα το πρώτο ή φθηνότερο αμφίσημο ποσό. Ελέγξτε τεμάχιο/συσκευασία/διαθεσιμότητα/ΦΠΑ/μεταφορικά στην πρωτογενή πηγή.
7. Δική μας αγορά είναι καθαρή, λιανική με ΦΠΑ. Margin χωρίς ΦΠΑ=(λιανική/(1+ΦΠΑ/100)−καθαρό κόστος)/(λιανική/(1+ΦΠΑ/100)). Στο LAB0,814/1,30/13% δίνει29,24%, ίδιο με αποθήκη. Αγνώστη/άκυρη βάση δεν δίνει υποθετικό margin.

## Τι ακριβώς έχει PASS

Super Admin signed support αποθήκη/barcode, active provider, αποκλεισμός unit/ambiguous τιμών, συγκρίσιμη ταυτότητα και net margin. Οι τιμές provider παραμένουν ενδείξεις, όχι εγκεκριμένη εμπορική αγορά. Η χαμηλότερη ένδειξη0,93 € αποκλείει την πιθανή0,32 € και κενές/μη συγκρίσιμες πηγές. Υποβολή/έγκριση price proposal, ανθρώπινη επιβεβαίωση αποτελέσματος και προσθήκη/αποστολή παραγγελίας ΔΕΝ δοκιμάστηκαν και δεν έχουν PASS. Ο Owner με ενεργό module προστατεύεται από CI· live Owner/disabled provider NOT TESTED. Platform κρατά explicit εταιρεία. Καμία αλλαγή τιμής/stock/πληρωμής εκτελέστηκε. Μόνο η online query καταγράφει tenant-scoped ιστορικό.
