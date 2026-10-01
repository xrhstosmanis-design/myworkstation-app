# #25 — πρόσθετες πηγές εκκρεμοτήτων, 01/10/2026

**LIMITED READ-ONLY LAB PASS: τιμολόγια/αρνητικό απόθεμα, φίλτρα και πλοήγηση. Υπόλοιπο ASSIGNED `codex/task25-pending-sources-20261001`.** Ιστορικό Chat PASS12/09 προστατεύεται· #16/#17, OCR/myDATA, οικονομικές/stock μεταβολές και modules άλλων σελίδων δεν αλλάζουν.

## Υλοποίηση και δημοσίευση

- Βάση4bdc871. PR #1595 / head0abf4afa / πλήρες CI4006 PASS: build, server, invariants, isolated HTTP E2E. Merge `a882bb47493085eb0443b6122bcc8db21d2f25a4`, main CI4007 PASS.
- Exact `/api/health` παρατηρήθηκε με ok=true/revisiona882bb47493085eb0443b6122bcc8db21d2f25a4 πριν τη νέα LAB δοκιμή. Guarded Render1853 ενεργοποίησε το deploy αλλά το workflow εμφανίζεται CANCELLED μετά το νεότερο documentation #1596. Δεν δηλώνεται workflow PASS. Η πραγματική νέα έκδοση και ο νέος UI κώδικας επαληθεύτηκαν απευθείας.
- Node20.20.2: targeted7PASS, frontend/server build PASS, πλήρες local1751PASS/0FAIL/1SKIP. Η παράλειψη είναι το προαιρετικό PostgreSQL integration legacy kind constraint χωρίς DATABASE_URL, όχι Azure replay. Πρώτη unprepared εκτέλεση29import failures λόγω ignore-scripts/no generated Prisma· το απαιτούμενο build:server τα έλυσε. Καμία σύνδεση/μεταβολή παραγωγικής DB.
- Πρόσθετη ανεξάρτητη ενότητα στην υπάρχουσα καρτέλα, μόνο μετά επιτυχημένη εξουσιοδότηση της υπάρχουσας GET Chat/PENDING_CENTER. Πηγές χρησιμοποιούν υπάρχοντα tenant/role/module guards και διαθέσιμα εταιρικά stores. Καμία νέα εγγραφή εκκρεμότητας, έγκριση, κλείσιμο, πληρωμή ή stock posting.
- RECEIVED/IN_REVIEW invoice archive, PENDING_REVIEW/DISCREPANCY supplier settlements, trackStock αρνητικό ή <=minStock. HIGH μόνο για αρνητικό stock/απόκλιση πληρωμής· άλλα NORMAL. Η προτεραιότητα δεν αποθηκεύεται. Κατάσταση OPEN/COMPLETED/ALL αφορά μόνο Chat.
- Pagination invoice έως1.000/store και όριο payment500 εμφανίζουν προειδοποίηση. Αποτυχία πηγής δεν κρύβει επιτυχείς πηγές. Αυτά ελέγχθηκαν λειτουργικά στα local tests, όχι με live failure/cap.
- Invoice link ανοίγει υπάρχουσα θυρίδα στο store της πηγής, stock link την υπάρχουσα αποθήκη. Owner payment link ανοίγει σελίδα καταστήματος· Super Admin canonical Platform Admin/υπάρχον κουμπί Πληρωμές. Δεν υπάρχει row deep-link. Η επιλογή store του CommerceHub παύει να επαναφέρεται σε κάθε τοπική αλλαγή, διατηρώντας initial/support selection.

## Πραγματική δοκιμή LAB — 18:03–18:09 Ελλάδας (15:03–15:09 UTC)

MYWORKSTATION LAB, ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ `cmtpopbgo000trhb5ng9ytiru`, εταιρικό BackOffice μέσω Super Admin support. Cloud Chrome UI, όχι φυσικό POS terminal. Υπάλληλος/ενεργή operator βάρδια δεν χρησιμοποιήθηκε. Μόνο αναγνώσεις/τοπικά φίλτρα και πλοήγηση, ποσότητα μεταβολής0, μέθοδος πληρωμής N/A.

| Έλεγχος | Αναμενόμενο / παρατηρημένο | Κατάσταση |
|---|---|---|
| Όλα τα stores/πηγές |21 στοιχεία,10 IN_REVIEW invoices +11 αρνητικά stock, χωρίς warning|LAB PASS προβολής|
| STOCK + HIGH |11 στοιχεία, μόνο αρνητικά προϊόντα|LAB PASS|
| INVOICE + ALL |10 στοιχεία|LAB PASS|
| INVOICE + HIGH |0, σωστό empty message|LAB PASS|
| PAYMENT + ALL |0, χωρίς source error|LAB PASS μόνο empty state|
| Store απομόνωσης ετικέτας |0 στοιχεία, κανένα από το άλλο LAB|LAB PASS φίλτρου|
| Επιστροφή κύριου LAB / invoice |10 στοιχεία|LAB PASS|
| Stock source LAB-CAFE-20260927 |id12890a39-c0eb-4c80-9d32-8691a4e4c90d, -2 στη συγκεντρωτική και -2 στην υπάρχουσα αποθήκη με LAB selected|LAB PASS μετάβασης|
| Invoice source ΦΟΡΤΙΣ |id13876c09-17b8-452b-a09f-11a3c6a6d6e0 → θυρίδα με LAB selected· φορτις.jpg/Σε έλεγχο/ίδιος προμηθευτής|LAB PASS μετάβασης|
| Επανέναρξη συγκεντρωτικής |21 στοιχεία,10invoice/11stock ξανά|LAB PASS refresh/projection|

Πριν/μετά φρέσκο reload: MAIN2 συναλλαγές, μετρητά2,40€, κάρτα0€,IRIS0€,σύνολο2,40€· LAB-POS-02 2 συναλλαγές/όλα0€, ίδια ακριβώς. Stock LAB-CAFE-20260927 -2 πριν/πηγή/αποθήκη/επιστροφή, ίδιο. Δεν πατήθηκαν έγκριση, διαγραφή, επανεπεξεργασία, myDATA sync, καταχώριση κίνησης ή κλείσιμο βάρδιας. Ανεξάρτητο DB count, latest StockMovement και πλήρης stock hash NOT TESTED· δεν υποκαθίστανται με υπόθεση από τα UI σύνολα.

Τεκμήριο οθόνης18:08:05 Ελλάδας: `output/evidence/task25-pending-center-lab-2026-10-01.jpg`. Το αρχικό Playwright label selector δεν βρήκε control· μετά fresh DOM χρησιμοποιήθηκε το πραγματικό combobox role. Αυτό δεν ήταν σφάλμα εφαρμογής. Μία αναζήτηση notification selector δεν βρέθηκε· store/stock διασταυρώθηκαν από τα ορατά πραγματικά στοιχεία, χωρίς να δηλωθεί notification PASS.

## Υπόλοιπο / διατήρηση ανάθεσης

Η περιορισμένη read-only προβολή τιμολογίων/stock και τα παραπάνω φίλτρα/μεταβάσεις κλείνουν στο manual, ενεργή λίστα, roadmap και PDF. Δεν δηλώνεται συνολικό #25 PASS.

ASSIGNED στην ίδια σελίδα: θετική υπάρχουσα pending supplier payment και link ανοίγματος, πραγματικό Owner χωρίς SuperAdmin και adversarial roles/tenant, live unavailable-source/cap, χαμηλό μη αρνητικό stock. Δεν δημιουργούμε πληρωμή ή stock μεταβολή μόνο για τεκμηρίωση. Δεν περιλαμβάνονται λοιπά έξοδα/τράπεζα, purchase drafts ή ανάθεση/προτεραιότητα αποθηκευμένη σε όλες τις πηγές. #16/#17 παραμένουν στους υπευθύνους τους.

**Μία επόμενη ενέργεια:** read-only έλεγχος μίας ήδη υπάρχουσας PENDING_REVIEW/DISCREPANCY πληρωμής προμηθευτή και της μετάβασης στην υπάρχουσα οθόνη της, όταν υπάρχει διαθέσιμη στο LAB. Ο τρέχων υπεύθυνος διατηρείται μέχρι ονομασμένη μεταφορά, χωρίς δεύτερη παράλληλη ανάθεση.
