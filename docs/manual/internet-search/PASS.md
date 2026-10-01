# Αναζήτηση προϊόντων Internet — επιβεβαιωμένο περιορισμένο scope

## UNIT/AMBIGUOUS PRICE GUARD LAB PASS · συνολικό OPEN — 01/10/2026

**01/10/2026 — #14 PARTIAL LAB PASS / MARGIN FAIL — `fix/task14-vat-margin`:** exact `386f5d7ee894dbb55469abbe539d31d4d17ebbc4`, #1585 / CI3982–3983 / deploy1843 PASS, Node20.20.2 /1720 tests PASS. Στις11:53:11 browser μία νέα query5449000000996 επέστρεψε10 αποτελέσματα, ιστορικό13→14. UNIT/AMBIGUOUS PRICE GUARD πραγματικό LAB PASS: kalestimes rate1627,20 €/λίτρο αποκλείεται με λόγο, mymarket/BestPrice/DailyMarket/Skroutz πολλαπλές τιμές κενές με λόγο· μόνο ασφαλή priced exact συμμετέχουν, φθηνότερη ένδειξη0,93 €. Matching5 exact/3 probable/2 non-comparable,0 manual confirmations. Stock/λιανική SKU763 0/1,30,1LT9/2,60,500ML0/1,60 ίδια, MAIN2/2,40 και POS02 2/0 ίδια,1057 Audit ακριβώς ίδια. Καμία proposal/order/payment/stock πράξη. Νέο πραγματικό FAIL: Internet margin37,38% έναντι αποθήκης29,24% για κόστος0,814, μικτή λιανική1,30,ΦΠΑ13%. Ο server συγκρίνει καθαρό κόστος με μικτή λιανική· canonical αποθήκη χρησιμοποιεί sale/(1+VAT/100). Μόνη επόμενη αλλαγή ο read-only margin υπολογισμός/σαφής ένδειξη, χωρίς αλλαγή τιμής ή ΦΠΑ δεδομένων. Συνολικό #14 OPEN· αναζήτηση μετά exact νέο deploy και νέο baseline. Latest StockMovement/independent SQL count, disabled provider live και proposal/approval/order write flows NOT TESTED.

## Πρόσβαση και επαληθευμένη χρήση

Super Admin σε signed support εταιρεία ή Owner με ενεργό ADVANCED_ONLINE_PRODUCT_SEARCH. Το Platform Admin διατηρεί ρητή επιλογή εταιρείας. Στο LAB ελέγχθηκε Super Admin support μόνο.

1. BackOffice → Εμπορική λειτουργία → Αναζήτηση προϊόντων στο Internet.
2. Επιλέξτε ρητά το σωστό κατάστημα· το panel αρχικά επιλέγει το πρώτο της λίστας.
3. Γράψτε COCA στο πεδίο σύνδεσης και ανοίξτε Αποθήκη προϊόντων. Εμφανίστηκαν COCA COLA1LT/330ML/500ML με SKU/barcode/stock/αγορά/λιανική.
4. Επιλέξτε barcode5449000000996. Το πεδίο αναζήτησης και η σύνδεση έδειξαν COCA COLA330ML/SKU763.
5. Η καταγεγραμμένη αναζήτηση επέστρεψε9 δημόσια αποτελέσματα και μία νέα εγγραφή ιστορικού. Οι ενδείξεις τιμών ΔΕΝ έχουν συνολικό PASS λόγω του παραπάνω unit-price FAIL. Μην χρησιμοποιείτε μη ελεγμένη online τιμή για απόφαση αγοράς ή αλλαγή λιανικής.

## Όρια / πρακτικός έλεγχος

Η ανάγνωση αποθήκης δεν δημιουργεί οικονομική ή stock πράξη. Η online αναζήτηση γράφει InternetProductSearch ιστορικό. Δεν δοκιμάστηκαν υποβολή/έγκριση price proposal ή εξωτερική παραγγελία και δεν εκτελέστηκαν. Πιθανή αντιστοίχιση απαιτεί ανθρώπινο έλεγχο· άλλο barcode/παραλλαγή δεν είναι ασφαλής ταυτοποίηση. Ελέγξτε τεμάχιο/συσκευασία/ΦΠΑ/μεταφορικά στην πηγή. Αν εμφανιστεί Επίλεξε εταιρεία, ελέγξτε σωστή support συνεδρία και exact revision μετά το #1582. Μη ρυθμισμένος provider/timeout είναι χωριστή τεχνική κατάσταση, όχι κενός κατάλογος ή PASS τιμών.


Το guard επαληθεύθηκε σε πραγματική νέα query στο exact revision386f5d7. Το προηγούμενο unit-price FAIL έκλεισε. Το margin παραμένει FAIL μέχρι διόρθωση/readback. Η φθηνότερη τιμή είναι ένδειξη provider, όχι εγκεκριμένη αγορά.


## Margin correction — LOCAL PASS / AWAITING CI/EXACT DEPLOY/LAB

Το market-search δικό μας προϊόν διαβάζει και το υπάρχον vatRate. Pure υπολογισμός αφαιρεί ΦΠΑ από τη μικτή λιανική πριν από καθαρό κόστος, όπως η canonical αποθήκη. Αγνώστη/άκυρη βάση δεν εμφανίζει φανταστικό margin. UI: Καθαρή αγορά / Λιανική με ΦΠΑ / Margin χωρίς ΦΠΑ. Καμία αλλαγή cost/sale/VAT/stock ή άλλης καρτέλας.25/25 targeted tests PASS (7 margin,10 item price,8 support context), τοπικός Node24· Node20/full CI/deploy/LAB απαιτούνται.

CI3984:1727tests/1726PASS/1FAIL από legacy UI label source guard. Διατηρούνται οι αρχικές ετικέτες με διευκρινίσεις «Δική μας αγορά (καθαρή)» / «Δική μας πώληση (με ΦΠΑ)». Αριθμητικές7 και προηγούμενες18 PASS· νέο πλήρες CI απαιτείται.
