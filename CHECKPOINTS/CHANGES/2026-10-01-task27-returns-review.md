# #27 — κόστος επιστροφών / ακυρώσεων

ASSIGNED στην ίδια σελίδα, branch `codex/task27-returns-review-20261001`, βάση c97e151. Προηγούμενα missing-cost και ημερολογιακά LIMITED LAB PASS προστατεύονται. Διάβασα τις νεότερες ενεργές εκκρεμότητες, manual profitability και κεντρική λίστα.

Πηγή: pos-sale-actions δημιουργεί COMPLETED POS_REVERSAL, αρνητικές ποσότητες/γραμμές και originalSaleId· η αρχική Sale μένει COMPLETED. Η αναφορά ήδη περιλαμβάνει τις αντίστροφες γραμμές σωστά στα έσοδα, αλλά LATERAL purchase cost αναζητεί έως occurredAt της επιστροφής. Μπορεί να αναιρέσει διαφορετικό κόστος μετά από νεότερη αγορά. Θα χρησιμοποιεί την αρχική ημερομηνία, μόνο με ίδιο company/store και έγκυρη αρχική πώληση. Σπασμένος σύνδεσμος θα δηλώνει άγνωστο κόστος. Μετρητές επιστροφών/ακυρώσεων θα εξηγούν τη συμπερίληψη χωρίς νέα οικονομική πράξη.

ΦΠΑ εξόδων: τα ποσά πληρωμών καταγράφονται μικτά, το υπάρχον πεδίο εξόδων εμφανίζεται ως χωρίς ΦΠΑ, ενώ πλήρης VAT συνδεδεμένου παραστατικού μπορεί να επαναληφθεί για μερικές πληρωμές. Χωρίς εγκεκριμένη πηγή δεν μπορεί να θεωρηθεί ασφαλές μηδέν. Καταγράφεται ξεχωριστά OPEN, δεν αλλάζει σε αυτό το σκέλος.

Scope: υπάρχουσα read-only αναφορά CASH_CONTROL, auth/tenant/store/licensing/POS/stock/fiscal και κλειδωμένο PROFITABILITY ίδια. Απομονωμένο SQL/HTTP fixture πριν/μετά κόστος αγοράς και reversal· snapshots αμετάβλητα μετά από report GET. CI/exactdeploy πριν από read-only LAB, με δύο fresh POS baselines. Καμία prod DB mutation ή νέα επιστροφή/πώληση/πληρωμή. Πλήρες ιστορικό κόστος και συνολικό #27 OPEN.

## Τοπική επικύρωση

Node 20: 1.777 server PASS / 0 FAIL / 1 optional PG SKIP χωρίς DATABASE_URL, 13 στοχευμένες PASS, production client/server build PASS, diff check PASS. Νέο isolated SQL/HTTP fixture AWAITING CI: αρχικό κόστος2 έναντι νεότερου9, multi-line RETURN μετρά μία φορά, CANCEL ξεχωριστά, αντίστροφα έσοδα−30/κόστος−6, συνδυασμένη περίοδος μηδενίζεται και orphan profit NULL. Production δεδομένα δεν μεταβλήθηκαν.

PR #1612, head f948e048, CI #4047 PASS. Actual SQL/HTTP 17:46:55.399Z: RETURN1/CANCEL1, sales−30/cost−6, laterCost9 not used, combined sales/cost/profit0, orphan profitNULL, snapshots unchanged. Merge `7b7ff2342f611967f4eab8eb0bef94a22ba76772`. Main CI/exact deploy/LAB AWAITING.

## Fresh baseline πριν από read-only LAB

2026-10-01T17:55:07.910056+00:00 — mainCI4048PASS/Render1869PASS, health exact7b7ff2342f611967f4eab8eb0bef94a22ba76772. SuperAdmin cloud Chrome / MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. MAIN active operator LAB POS2 opened27Sep20:24,2tx/cash2.40/card+IRIS0/total2.40,last01Oct12:51. Control LAB-POS-02 opened26Sep01:33,2tx/cash0/card+IRIS0/total0,last—. Action: report GET/default/daily/CSV on existing reversals only. Quantity/SKU/payment/physicalPOS N/A; no financial/stock/fiscal write. Live SQLcounts/stocklatest/hash NOT TESTED.

## LIMITED READ-ONLY LAB PASS — υπαρκτές επιστροφές / μετρητές / CSV

01/10/2026, exact `7b7ff2342f611967f4eab8eb0bef94a22ba76772`, PR #1612, CI #4047/#4048 και Render #1869 PASS. Cloud Chrome, SuperAdmin, MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Περίοδος 01/08–01/10: 5 επιστροφές και 2 ακυρώσεις, όλες Σεπτέμβριο. Daily: 24/09 RETURN2/CANCEL2, 20/09 RETURN1/CANCEL0, 16/09 RETURN2/CANCEL0· άθροισμα5/2, ίδιο με μήνα/σύνολο. Οκτώβριος0/0, πωλήσεις2.40 και missing4/4. Default gross54.60, missing8/75 και blank profits ίδια.

Πραγματικό CSV `eikona-epixeiriseis-2026-08-01-2026-10-01.csv`, 824bytes: δύο μήνες, Σεπτέμβριος5/2 και Οκτώβριος0/0, άθροισμα gross54.60, missing8/salesLines75 και κενά Margin/gross/netprofit. Το download event έκανε timeout3s, αλλά το μοναδικό νέο αρχείο δημιουργήθηκε και διαβάστηκε/επαληθεύθηκε. Ένα click, καμία επανάληψη.

Fresh μετά: MAIN2tx/cash2.40/card+IRIS0/total2.40,last01Oct12:51 και LAB-POS-02 2tx/cash0/card+IRIS0/total0,last—. Operator/openings ίδια με baseline. Καμία νέα επιστροφή/ακύρωση/πώληση/πληρωμή/stock/fiscal ενέργεια. Δεν αποτελεί ανεξάρτητη συμφωνία κόστους/λογιστικής. Το original-date cost2 αντί later9, orphan NULL και ledger snapshots αποδείχθηκαν μόνο στο isolatedCI. Live positive κόστος με δύο ήδη εγκεκριμένες αγορές διαφορετικών ημερομηνιών, invalid original/company/store, live Owner, φυσικόPOS/print/SQLcounts/stocklatest NOT TESTED.

Evidence `output/evidence/task27/returns-counts-lab.jpg`, `output/evidence/task27/returns-counts-lab.csv`. Κλείνει μόνο μετρητές υπάρχουσων επιστροφών/ακυρώσεων, ημέρα/μήνας/σύνολο/CSV και επεξηγηματική οθόνη. Η διόρθωση original-date έχει CI/deploy PASS, όχι ανεξάρτητο positive live costing PASS. Full historical cost / VAT expenses / Owner / full module OPEN. Η ίδια σελίδα κρατά ανάθεση. Επόμενη μία ενέργεια: συντηρητική διάκριση μικτών εξόδων και τεκμηριωμένου καθαρού/VAT, χωρίς αυθαίρετο μηδέν ή επανάληψη VAT σε μερική πληρωμή. Άλλα scopes παραμένουν ίδια.

Final baseline 2026-10-01T17:58:01.612965+00:00
