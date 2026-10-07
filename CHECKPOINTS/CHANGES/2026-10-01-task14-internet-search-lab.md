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


## AFTER πρώτης online query και νέο πραγματικό FAIL

**01/10/2026 — #14 PARTIAL LAB PASS / PRICE FAIL — ίδια σελίδα, `fix/task14-market-item-price`:** exact `fb58bf9610bd1193dfe54355eb9393f2468d2338`, #1582 / CI3975–3976 / deploy1840 PASS. Signed support αποθήκη/σύνδεση barcode και λειτουργικός provider PASS. Μία online query SKU763 /5449000000996 επέστρεψε9 αποτελέσματα στις11:24:22 εμφανιζόμενη ώρα browser· ιστορικό11→12. Stock0→0 και λιανική1,30→1,30 €, control Coca1LT9/2,60 € και500ml0/1,60 € ίδια, MAIN2/2,40 € και POS02 2/0 € ίδια,1057 LAB Audit ακριβώς ίδια. Δεν δημιουργήθηκαν proposal/παραγγελία/πληρωμή ή stock πράξη. Πραγματικό FAIL: kalestimes αποτέλεσμα1627,20 € παρουσιάζεται ως τεμάχιο, ενώ η πρωτογενής σελίδα το ορίζει ανά λίτρο, διαφορετικά από την τιμή προϊόντος0,65 €. Ο υπάρχων parser παίρνει το πρώτο νόμισμα χωρίς μονάδα/αμφισημία. Επόμενη μοναδική αλλαγή: αποκλεισμός unit rates και αμφίσημων πολλαπλών ποσών από item price, σαφής έλεγχος πηγής, χωρίς αυτόματη τιμή/stock/παραγγελία. Συνολικό #14 OPEN· επόμενη νέα αναζήτηση μόνο μετά exact deploy και φρέσκο baseline. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task14-internet-search-lab.md`.

Πρωτογενής πηγή: https://www.kalestimes.gr/coca-cola-330ml-eisagogis, διαβάστηκε01/10/2026. Ο rate δεν μετατρέπεται αυθαίρετα σε τιμή τεμαχίου. Ακριβείς/πιθανές/μη συγκρίσιμες αντιστοιχίσεις5/3/1,0 ανθρώπινες επιβεβαιώσεις,0 price proposals και0 προσθήκες παραγγελίας. Η προηγούμενη αποθήκη/κατάλογος support FAIL έκλεισε, το price FAIL κρατά το συνολικό #14 OPEN. Latest StockMovement και ανεξάρτητος SQL count NOT TESTED.


## Διόρθωση item price — LOCAL PASS / AWAITING CI/EXACT DEPLOY/LAB

Προστέθηκε μικρός pure parser: αποκλείει ποσά €/λίτρο, €/kg, ανά βάρος/όγκο/τεμάχιο όταν δεν είναι απλό συνολικό item price, σαφώς παλιές τιμές και μεταφορικά, και δεν επιλέγει αυθαίρετα ανάμεσα σε διαφορετικά ποσά. Διατηρεί ελληνικά/αγγλικά νομίσματα, πλήρη αριθμητικά ποσά και επαναλαμβανόμενη ίδια τιμή. UI δείχνει γιατί δεν επιβεβαιώθηκε τιμή τεμαχίου. Δεν αλλάζει barcode matching, provider query, ιστορικό, price proposal/approval, stock ή schema. 18/18 τοπικά tests (10 price +8 support isolation) και syntax PASS. Συνολικό #14 παραμένει OPEN μέχρι πραγματική νέα online query στο exact deploy με φρέσκο baseline.


## BEFORE ελέγχου της διόρθωσης

**01/10/2026 — #14 BEFORE regression online query:** exact /api/health `386f5d7ee894dbb55469abbe539d31d4d17ebbc4`, PR #1585 / PR CI3982 / main CI3983 / guarded deploy1843 PASS, Node20.20.2 /1720 PASS /0FAIL /0SKIP /build/invariants/E2E PASS. Fresh signed support MYWORKSTATION LAB, ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. SKU763 /5449000000996 stock0, αγορά0,81 €, λιανική1,30 €· control1LT stock9 /αγορά1,74 /λιανική2,60,500ML stock0 /λιανική1,60. MAIN2/2,40 € και POS02 2/0 € ίδια, Audit1057 ακριβώς ίδιο. Φρέσκο ιστορικό13 (όχι αυθαίρετη υπόθεση12), latest barcode5449000000996 /11:24:22. Η5200040119037 /11:22:17 είναι ήδη υπάρχουσα, δεν εκτελέστηκε από αυτή τη σελίδα. Συνδέθηκε barcode χωρίς query. Επόμενη μία query μόνο για την αναπαραγωγή unit-rate/ambiguous price guard· μοναδική αναμενόμενη νέα εγγραφή ιστορικού, καμία τιμή/proposal/παραγγελία/πληρωμή/stock.


## AFTER price guard / BEFORE margin correction

**01/10/2026 — #14 PARTIAL LAB PASS / MARGIN FAIL — `fix/task14-vat-margin`:** exact `386f5d7ee894dbb55469abbe539d31d4d17ebbc4`, #1585 / CI3982–3983 / deploy1843 PASS, Node20.20.2 /1720 tests PASS. Στις11:53:11 browser μία νέα query5449000000996 επέστρεψε10 αποτελέσματα, ιστορικό13→14. UNIT/AMBIGUOUS PRICE GUARD πραγματικό LAB PASS: kalestimes rate1627,20 €/λίτρο αποκλείεται με λόγο, mymarket/BestPrice/DailyMarket/Skroutz πολλαπλές τιμές κενές με λόγο· μόνο ασφαλή priced exact συμμετέχουν, φθηνότερη ένδειξη0,93 €. Matching5 exact/3 probable/2 non-comparable,0 manual confirmations. Stock/λιανική SKU763 0/1,30,1LT9/2,60,500ML0/1,60 ίδια, MAIN2/2,40 και POS02 2/0 ίδια,1057 Audit ακριβώς ίδια. Καμία proposal/order/payment/stock πράξη. Νέο πραγματικό FAIL: Internet margin37,38% έναντι αποθήκης29,24% για κόστος0,814, μικτή λιανική1,30,ΦΠΑ13%. Ο server συγκρίνει καθαρό κόστος με μικτή λιανική· canonical αποθήκη χρησιμοποιεί sale/(1+VAT/100). Μόνη επόμενη αλλαγή ο read-only margin υπολογισμός/σαφής ένδειξη, χωρίς αλλαγή τιμής ή ΦΠΑ δεδομένων. Συνολικό #14 OPEN· αναζήτηση μετά exact νέο deploy και νέο baseline. Latest StockMovement/independent SQL count, disabled provider live και proposal/approval/order write flows NOT TESTED.


## Margin correction — LOCAL PASS / AWAITING CI/EXACT DEPLOY/LAB

Το market-search δικό μας προϊόν διαβάζει και το υπάρχον vatRate. Pure υπολογισμός αφαιρεί ΦΠΑ από τη μικτή λιανική πριν από καθαρό κόστος, όπως η canonical αποθήκη. Αγνώστη/άκυρη βάση δεν εμφανίζει φανταστικό margin. UI: Καθαρή αγορά / Λιανική με ΦΠΑ / Margin χωρίς ΦΠΑ. Καμία αλλαγή cost/sale/VAT/stock ή άλλης καρτέλας.25/25 targeted tests PASS (7 margin,10 item price,8 support context), τοπικός Node24· Node20/full CI/deploy/LAB απαιτούνται.

CI3984:1727tests/1726PASS/1FAIL από legacy UI label source guard. Διατηρούνται οι αρχικές ετικέτες με διευκρινίσεις «Δική μας αγορά (καθαρή)» / «Δική μας πώληση (με ΦΠΑ)». Αριθμητικές7 και προηγούμενες18 PASS· νέο πλήρες CI απαιτείται.


## BEFORE τελικού ελέγχου

**01/10/2026 — #14 BEFORE τελική margin query:** exact `/api/health` `35a52c4ef056453955b3764aefc8cf16e978f750`, #1586 / PR CI3985 / mainCI3986 / deploy1844 PASS, Node20.20.2 /1727PASS /0FAIL /0SKIP /build/invariants/E2E PASS. Φρέσκο LAB: SKU763/barcode5449000000996 stock0/αγορά0,81/λιανική1,30, control1LT9/1,74/2,60 και500ML0/0/1,60 ίδια. MAIN2/2,40 CASH CARD/IRIS0,POS02 2/0 όλα0,1057Audit ακριβώς ίδια. Ιστορικό14 μεlatest11:53:11. Σύνδεσηbarcode χωρίς query. Μία νέα query θα ελέγξει margin29,24% (κόστος0,814,λιανική1,30,ΦΠΑ13%) και συνεχιζόμενο unit/ambiguous guard. Μόνο νέα InternetProductSearch εγγραφή αναμένεται· καμία οικονομική/stock/τιμή/ΦΠΑ/proposal/order πράξη.


## Τελικός πραγματικός έλεγχος / κλείσιμο ανατεθειμένου read-only scope

**01/10/2026 — #14 READ-ONLY USER/LAB PASS · ευρύτερες write ροές OPEN:** exact production `/api/health` `35a52c4ef056453955b3764aefc8cf16e978f750`, #1586 / CI3985–3986 / deploy1844 PASS, Node20.20.2 /1727 serverPASS /0FAIL /0SKIP /build/invariants/E2E PASS. MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ: μία τελική query5449000000996 στις12:11:21 browser επέστρεψε9 αποτελέσματα, history14→15. Αποθήκη/σύνδεση barcode, active provider, unit/ambiguous price guard και net margin LAB PASS. SKU763 κόστος0,814, μικτή λιανική1,30,ΦΠΑ13% ⇒margin29,24%, ίδιο με αποθήκη. Matching5exact/3probable/1non-comparable,0manual confirmations. kalestimes unit rate κενό με λόγο· πολλαπλές τιμές κενές· πιθανή0,32 € και μη συγκρίσιμα δεν μπήκαν στη φθηνότερη ένδειξη0,93 €. Stock/λιανική μετά φρέσκο readback:1LT9/2,60,330ML0/1,30,500ML0/1,60 ίδια. MAIN2/2,40 €,POS02 2/0 € ίδια μετά refresh,1057 Audit ακριβώς ίδια. Δεν υποβλήθηκαν proposal,order,payment,stock ή price/VAT μεταβολές. Latest StockMovement/independentSQLcount, Owner live, disabled provider live και submission/approval/order write paths NOT TESTED· δεν δηλώνεται συνολικό PASS αυτών. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task14-internet-search-lab.md`, manual `docs/manual/internet-search/PASS.md`. Το ανατεθειμένο read-only σκέλος έκλεισε· τα ευρύτερα write σενάρια παραμένουν χωριστά OPEN.

Πέρασαν τρεις οριοθετημένες queries της σελίδας:11:24:22 αρχικό price FAIL,11:53:11 price guard PASS/margin FAIL,12:11:21 τελικό read-only PASS. Κάθε επανάληψη ακολούθησε ελάχιστη διόρθωση/exact deploy και BEFORE commit· δεν είναι επανάληψη πώλησης ή πληρωμής. Τα ιστορικά υπόλοιπα/χρόνοι άλλων actor δεν αποδίδονται στη σελίδα. Οι παλαιότερες ενότητες FAIL/AWAITING είναι χρονολογικό τεκμήριο, υπερισχύει το παραπάνω.

## Επόμενη πρόταση από την επίσημη προτεραιότητα — #15 (χωρίς ανάθεση/λειτουργική αλλαγή)

Πρώτη αυτόματη OCR ανάγνωση: σκοπός ασφαλής αρχική εξαγωγή σε preview, χωρίς νέα πληρωμή/stock/posting. Υπάρχουν ήδη G03 βοηθός, `client/src/pos-invoice-auto-ocr-bootstrap.js` με τοπικό ell+eng OCR/PDF preview και threshold65, καθώς και bounded durable/provider recovery. Δεν προτείνεται επανεγγραφή. Λείπει πρώτα ο προσδιορισμός σημερινού live κενού από την υπάρχουσα διαδρομή. Κίνδυνοι: duplicate jobs/πληρωμή, λάθος γραμμές/ΦΠΑ, timeout/provider κόστος και επανάληψη G03. Πλάνο μετά έγκριση: read-only απογραφή σημερινής ροής/τεκμηρίων, απομονωμένα fixtures εικόνας/πολυσέλιδου/χαμηλής εμπιστοσύνης, ορισμός συγκεκριμένου κενού, ελάχιστη αλλαγή μόνο αν αποδειχθεί, tests duplicate/tenant/timeout, greenCI/PR/exact deploy και LAB preview χωρίς οικονομική πράξη. Η #15 παραμένει OPEN/ελεύθερη και δεν ξεκίνησε υλοποίηση.


## 07/10/2026 19:38 Europe/Athens — continuation claim, read-only only

07/10/2026 19:38 Europe/Athens — Ο ιδιοκτήτης ζήτησε συνέχεια του Νο 14. ASSIGNED: codex/task14-owner-provider-readonly-20261007-r1. Περιορισμένο scope: read-only επιβεβαίωση πρόσβασης Owner και fail-closed συμπεριφοράς όταν ο provider είναι ήδη ανενεργός, καθώς και έλεγχος ασφαλούς σύνδεσης με Master Catalog χωρίς αλλαγές δεδομένων. Δεν θα αλλάξω τιμές/ΦΠΑ, δεν θα υποβάλω ή εγκρίνω πρόταση τιμής, δεν θα δημιουργήσω/στείλω παραγγελία, δεν θα κάνω πληρωμή/stock write ούτε θα αλλάξω ρυθμίσεις provider. Το read-only USER/LAB PASS της 01/10/2026 παραμένει τεκμηριωμένο και δεν επαναλαμβάνεται. Οι υπόλοιπες write ροές μένουν OPEN. Checkpoint: CHECKPOINTS/CHANGES/2026-10-01-task14-internet-search-lab.md; PR #1833.

**Evidence retained:** #14 read-only USER/LAB PASS remains the 01/10 result at exact revision `35a52c4ef056453955b3764aefc8cf16e978f750`, PR #1586 and docs PR #1587. No new UI/LAB result is claimed here. The deployed revision must be read before any live check. User-specific boundary: no price or VAT changes and no price proposal or order submission. Payment/stock writes and provider-setting changes are also excluded from this claim.

**Next checks:** verify current public health revision; inspect Owner access and fail-closed behavior only if the provider is already disabled; review Master Catalog identity linkage for ambiguity/fail-closed behavior. If a check requires changing provider settings, an account credential, a proposal, an order or stored prices, leave it NOT TESTED and report the blocker.

## 07/10/2026 20:42 Europe/Athens — #14 Master Catalog exact-barcode read-only lookup / PARTIAL

**Runtime and role:** Public `/api/health` reported revision `b5f5dbf8566f74d430c8277305313296e64e9928`, version `0.22.0+kat-test-pos`. The visible signed-in role was Platform Super Admin. No customer Owner login or credential entry was attempted.

**Read-only catalog evidence:** In the Master Catalog, the list showed 9,110 products, 68 without retail price and 0 with unconfirmed VAT. Quick lookup of exact barcode `5449000000996` returned one visible `COCA COLA 330ML` row at retail €1.30. The catalog also displayed another `COCA COLA 330ML` row with internal SKU 763 but barcode `5449000214911`, also at €1.30. This makes name/SKU-only matching ambiguous; the observed exact-barcode lookup was unique in that view. This does not establish or save an Internet-result-to-catalog mapping.

**Action boundary and result:** No product/store was selected and no checkbox, mapping, import, distribution, price, VAT, provider, proposal, order, payment, or stock action was saved. The Master Catalog linkage remains **OPEN** because persistence/reopen of an explicit safe mapping was not tested. Customer Owner access and disabled-provider fail-closed behavior remain **NOT TESTED**; the provider appeared active in the earlier 20:03 search. The read-only continuation is partial; overall #14 remains **READ-ONLY PASS / WRITE OPEN**, not a total PASS.

**Next step:** Only test Owner access through an available official secure flow, without sharing or entering credentials through chat or ordinary automation. Test disabled-provider fail-closed behavior only if the provider is already disabled. Any mapping/write test needs a separately approved, isolated scope and baseline; proposal/order/payment/stock and price/VAT writes remain outside this assignment.

**Publication:** At 07/10/2026 20:47 Europe/Athens, PR #1843 was OPEN; combined status for initial PR head `f775a69093bf597832fc8c80ad5dc28469c122fb` returned no checks. Final head status will be checked after this documentation update.
