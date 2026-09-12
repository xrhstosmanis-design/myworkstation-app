# Checkpoint — Κουμπί Chat σε Super Admin και Ιδιοκτήτη

- Στο Super Admin εμφανίζεται κουμπί Chat ανά κατάστημα του επιλεγμένου πελάτη.
- Η πρόσβαση του Super Admin παραμένει μόνιμη και παρακάμπτει εμπορικά entitlements, χωρίς να παρακάμπτει store/company scoping των δεδομένων.
- Στον Ιδιοκτήτη προστέθηκε κεντρική επιλογή `Chat` στο βασικό μενού.
- Το κουμπί του Ιδιοκτήτη εμφανίζεται μόνο όταν το `/api/license/current` επιστρέφει ενεργό `STORE_CHAT`.
- Ο Ιδιοκτήτης επιλέγει Chat αποκλειστικά από τη λίστα `/api/stores` της εταιρείας του.
- Το ίδιο ασφαλές `StoreChatPanel` χρησιμοποιείται σε POS, Ιδιοκτήτη και Super Admin.
- Κάθε API αίτημα συνεχίζει να περνά από `auth`, `requireStoreModule("STORE_CHAT")` και τον store/tenant έλεγχο του Chat route.
- Στοχευμένο test, 1109/1109 server tests και client production build: PASS.
- Εκκρεμούν CI, deploy και LAB retest.
