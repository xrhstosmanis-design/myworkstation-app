## Λεβεντόπουλος — one-time recovery του υπάρχοντος failed draft

### LAB evidence

- Το συνδεδεμένο draft `ΤΔΛΠΧ14 15` παραμένει `POS_FAILED` με το ακριβές fail-closed μήνυμα και χωρίς νέα πληρωμή ή κίνηση αποθήκης.
- Η πλήρης ανάγνωση κενού πρώτου OCR είχε διορθωθεί, αλλά το ήδη αποτυχημένο job δεν ήταν επιλέξιμο για automatic recovery και το χειροκίνητο AI reread ήταν απενεργοποιημένο.

### Ασφαλής διόρθωση

- Προστίθεται ξεχωριστό one-time strategy `LEVENTOPOULOS_EMPTY_COMPLETE_TABLE_V17` μόνο για το profile `LEVENTOPOULOS_MM_POS1_COLUMNS` ή το authoritative supplier του ήδη συνδεδεμένου draft.
- Απαιτείται το ακριβές αποθηκευμένο fail-closed σφάλμα και ενεργό linked `DRAFT` τύπου `POS_OCR_DRAFT`.
- Επαναχρησιμοποιούνται το ίδιο job, `purchaseDocumentId`, `pageJobIds`, attachment και φωτογραφία με `replaceExistingDraft=true`.
- Καμία διαγραφή, νέα πληρωμή/πίστωση, κίνηση αποθήκης, οριστικοποίηση, fiscal/accounting ή myDATA ενέργεια.
- Αν δεν επαληθευτούν ανεξάρτητα όλες οι 9 τυπωμένες γραμμές, το footer ΦΠΑ και το σύνολο `194,77 €`, το υπάρχον draft παραμένει ανέπαφο.

### Validation

- `node --check`: PASS.
- 62 targeted OCR/recovery regression tests: PASS.
- Αναμένεται πράσινο GitHub CI, merge/deploy και απόδειξη πάνω στο ίδιο LAB draft χωρίς νέο upload.
