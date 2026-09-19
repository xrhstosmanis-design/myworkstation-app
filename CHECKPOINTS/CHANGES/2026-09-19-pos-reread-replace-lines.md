# 2026-09-19 — POS safe reread replaces draft lines

## Incident

Η επανεκτέλεση του πλήρους OCR στο ίδιο POS draft μπορούσε να αφήσει τις παλιές γραμμές και να προσθέσει μια δεύτερη ανάγνωση. Σε διάταξη προμηθευτή όπου το OCR έβαζε δίπλα στον κωδικό είδους και τον αριθμό τιμολογίου (101 260916), οι διπλές γραμμές εμφανίζονταν ως διαφορετικά προϊόντα.

## Fix

- Η συμπλήρωση υπάρχοντος POS draft διαγράφει, μέσα στην ίδια DB συναλλαγή, μόνο τα προηγούμενα PurchaseOrderLine του ίδιου draft πριν εισαγάγει το νέο τελικό σύνολο.
- Δεν αλλάζει PurchaseDocument, StoreTransaction, η αρχική πληρωμή, η κατάσταση οριστικοποίησης ή το απόθεμα.
- Ο parser κρατά τον πρώτο διακριτό αριθμητικό token ως supplier item code όταν το OCR έχει ενώσει με αυτόν τον αριθμό τιμολογίου.
- Σε ίδιες γραμμές προτιμάται πάντα η εκδοχή με sourceColumnsVerified.

## Verification

- Targeted Gate 3 and printed-column tests PASS locally.
- Production client build PASS locally.
