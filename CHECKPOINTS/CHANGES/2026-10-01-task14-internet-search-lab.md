# Εργασία #14 — Υπάρχουσα αναζήτηση Internet / LAB

**01/10/2026 — Εργασία #14 · ΑΝΑΤΕΘΗΚΕ — `fix/task14-support-company-search`:** ιδιοκτήτης ενέκρινε συνέχεια μετά το κλείσιμο #21. LAB FAIL στο exact `6d892277796e458c2d0ba2f16297189fe19d24cd`: BackOffice υποστήριξης MYWORKSTATION LAB, κατάστημα ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ, «Αποθήκη προϊόντων» → «Επίλεξε εταιρεία». Αιτία: companyFor αναγνωρίζει Super Admin αλλά δεν χρησιμοποιεί τη signed supportContext εταιρεία στο commerce endpoint. Μόνη προβλεπόμενη αλλαγή: fallback στη συμφωνούσα signed supportContext/companyId μόνο εκτός platform route. Platform απαιτεί ρητή εταιρεία, Owner δεν αλλάζει tenant, module/ρόλοι/store ownership προστατεύονται. Καμία νέα αναζήτηση provider, αλλαγή τιμής, παραγγελία, πληρωμή ή stock ακόμη. MAIN 2/2,40 €, δεύτερο POS 2/0 €· ιστορικό αναζήτησης NOT TESTED επειδή αποτυγχάνει η φόρτωση. Μετά CI/merge/exact deploy, καταγραφή φρέσκου SKU/stock/history πριν από μία αναζήτηση και έλεγχος συγκρίσιμων/μη συγκρίσιμων αποτελεσμάτων. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task14-internet-search-lab.md`.

## Προστατευμένα υπάρχοντα

Αναζήτηση προϊόντος από αποθήκη, ακριβές barcode/μονάδα/συσκευασία, ανθρώπινη επιβεβαίωση πιθανής αντιστοίχισης, tenant-scoped ιστορικό, proposal PENDING και κλείδωμα έγκρισης, καμία αυτόματη αλλαγή τιμής/stock και καμία αποστολή εξωτερικής παραγγελίας. G03 και #20/#21 δεν ανοίγουν ξανά. Άλλες ανατεθειμένες σελίδες δεν επηρεάζονται.

## Αποδοχή

Η ίδια LAB εταιρεία ανοίγει αποθήκη χωρίς Επίλεξε εταιρεία. Νέα αναζήτηση μόνο μετά από φρέσκο baseline προϊόντος και καταγεγραμμένο ιστορικό· η μόνη αναμενόμενη εγγραφή είναι InternetProductSearch. Φυσικές τιμές από πηγές, συγκρισιμότητα, αφαίρεση μη ασφαλών αποτελεσμάτων και ανενεργός provider ελέγχονται χωρίς price proposal/approval ή επιχειρησιακή μεταβολή. Συνολικό #14 NOT TESTED / OPEN μέχρι πραγματικό αποτέλεσμα provider.

## Διόρθωση — AWAITING CI / EXACT DEPLOY / LAB

Χρησιμοποιείται μόνο signed supportContext με companyId που συμφωνεί με req.user.companyId, και μόνο στο commerce endpoint. Το platform παραμένει explicit-company. 8/8 τοπικά εκτελεσμένα tenant/role/module tests PASS και syntax check PASS· τοπικός Node24, υποχρεωτικό Node20/full suite/build στο CI. Δεν αλλάζει provider, matched price, approval, βάση ή schema. Δεν εκτελέστηκε online search.


## Ακριβές deploy και BEFORE πρώτης online δοκιμής

**01/10/2026 — #14 BEFORE online query / `docs/task14-lab-evidence-20261001`:** exact LIVE `fb58bf9610bd1193dfe54355eb9393f2468d2338`, PR #1582 / PR CI #3975 / main CI #3976 / guarded deploy #1840 PASS. Support LAB αποθήκη ανοίγει χωρίς Επίλεξε εταιρεία. Query προς δοκιμή: barcode 5449000000996, συνδεδεμένο COCA COLA 330ML / SKU763 / b32e9be4-0283-4927-9a21-f81a232ca800, stock0, κόστος0,814 €, λιανική1,30 €, τελευταία απογραφή11/09/2026 16:00:28, τελευταία πώληση—. Latest StockMovement/SQL count NOT TESTED. MAIN2/2,40 € CASH, CARD/IRIS0· LAB-POS-02 2/0 € όλα0· LAB Audit1057 και ακριβώς ίδιο με #21. Πριν online search:11 ιστορικά αποτελέσματα, τελευταία ήδη υπάρχουσα 5449000054227 /9 αποτελέσματα /1/10/2026 11:20:52 εμφανιζόμενη ώρα browser. Η μόνη αναμενόμενη νέα εγγραφή είναι InternetProductSearch, όχι οικονομική/stock ή price proposal. Καμία νέα online query της σελίδας ακόμη.
