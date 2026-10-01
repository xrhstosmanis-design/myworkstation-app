# #25 — πρόσθετες πηγές εκκρεμοτήτων, 01/10/2026

ASSIGNED `codex/task25-pending-sources-20261001`, βάση main4bdc871.

Ιστορικό Chat USER/LAB PASS12/09 προστατεύεται όπως στο manual pending-center και στη συμφιλίωση01/10. Νέες πηγές NOT TESTED / AWAITING LAB. Νεότερη ιστορία main και ενεργές αναθέσεις ελέγχθηκαν. Δεν αλλάζουμε #16/#17, θυρίδα/myDATA/OCR, οικονομικές/stock μεταβολές, schema, module ή δικαιώματα.

## Περιορισμένο scope

Πρόσθετη read-only ενότητα στην υπάρχουσα καρτέλα: ανεξάρτητες GET πηγές με τα υπάρχοντα server guards, όλα τα ενεργά εταιρικά καταστήματα ή ένα επιλεγμένο. Τιμολόγια RECEIVED/IN_REVIEW, πληρωμές προμηθευτών PENDING_REVIEW/DISCREPANCY, προϊόντα trackStock με αρνητικό ή χαμηλό απόθεμα. Αποτυχία πηγής και όριο αποτελεσμάτων εμφανίζονται ρητά. Οι προτεραιότητες είναι ενδείξεις διαλογής, χωρίς μεταβολή της αρχικής εγγραφής. Δεν προστίθεται κουμπί έγκρισης/κλεισίματος σε αυτές τις πηγές.

## Αποδοχή

Μετά πράσινο πλήρες CI, merge και exact deployed revision: LAB έλεγχος πηγών/φίλτρων/πλοήγησης με σύγκριση υπάρχοντων στοιχείων. Καμία οικονομική ή stock πράξη. Owner scope και πηγές χωρίς module/με σφάλμα ελέγχονται χωριστά. Μέχρι τότε νέο scope AWAITING LAB και δεν μπαίνει στο manual PASS.

## Υλοποίηση / περιορισμοί

Invoice archive pagination έως1.000 ανά κατάστημα και όριο πληρωμών500 εμφανίζουν προειδοποίηση μερικής εικόνας. Ανεξάρτητη αποτυχία πηγής δεν κρύβει άλλες πηγές. Φίλτρο κατάστασης αφορά μόνο τα Chat tasks. Stock HIGH μόνο για αρνητικό, PAYMENT HIGH για DISCREPANCY, άλλα NORMAL. Δεν αποθηκεύονται προτεραιότητες ούτε νέες εκκρεμότητες. Δεν συγκεντρώνονται λοιπά έξοδα/τράπεζα ή purchase drafts. Invoice link ανοίγει υπάρχουσα θυρίδα στο επιλεγμένο κατάστημα· stock υπάρχουσα αποθήκη. Owner payment link ανοίγει την υπάρχουσα σελίδα καταστήματος με επιβεβαιώσεις, Super Admin την canonical Platform Admin και το υπάρχον κουμπί «Πληρωμές». Δεν υπάρχει direct row deep-link.

Η επιλογή καταστήματος του CommerceHub παύει να επαναφέρεται σε κάθε τοπική αλλαγή, ώστε η μετάβαση να διατηρεί το κατάστημα της πηγής. Δεν αλλάζει αρχική/support επιλογή ή εταιρικό context.

Στοχευμένοι λειτουργικοί έλεγχοι loader6 + προστασία υπάρχοντος Chat1:7PASS/0FAIL. Πρώτη εκτέλεση Node24· Node20 πλήρη checks εκκρεμούν. Live LAB NOT TESTED.

## Τοπική επαλήθευση

Node20.20.2: frontend build PASS, server preparation/Prisma generation PASS, πλήρες server suite1751PASS/0FAIL/1SKIP (το υπάρχον προαιρετικό Azure live replay χωρίς credentials). Η πρώτη unprepared εκτέλεση είχε29 import failures επειδή εγκατάσταση με ignore-scripts δεν είχε generated Prisma client· μετά το απαιτούμενο build:server μηδέν FAIL. Δεν έγινε σύνδεση/μεταβολή DB. Πρόσθετες πηγές εμφανίζονται μόνο μετά επιτυχημένη εξουσιοδότηση της υπάρχουσας GET Chat/PENDING_CENTER. Τελικό CI/invariants/isolated E2E και exact deploy εκκρεμούν.
