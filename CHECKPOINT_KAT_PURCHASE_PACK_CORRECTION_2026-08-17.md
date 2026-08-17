# KAT Purchase Pack Correction Checkpoint — 2026-08-17

Σταθερή κατάσταση μετά τις πραγματικές δοκιμές POS → Παραγγελίες & Αγορές:

- V2.4.4 structured product lines περνούν στο BackOffice.
- Anchor/IBAN/raw OCR πληροφοριακές γραμμές δεν πρέπει να γίνονται προϊόντα.
- Reconciliation guard: ανοχή 0,05 €.
- Πάνω από 0,05 € η πρώτη Οριστικοποίηση μπλοκάρει και επιτρέπεται override μόνο από Ιδιοκτήτη/Διαχειριστή/Admin με υποχρεωτικό λόγο και audit.
- Ήδη FINAL/INVOICED παραγγελία δεν ξαναζητά mismatch override σε idempotent επανάληψη.
- Οικονομική quantity της PurchaseOrderLine μένει ως ποσότητα παραστατικού/κιβωτίων.
- StoreProduct.currentStock και StockMovement μετατρέπονται σε τεμάχια με pack correction.
- Pack rules: 1,5L=6 τμχ/ΚΒ, 330ml=24, 500ml=24, ρητή φιάλη=20, Monster/Red Bull=24, νερό 750ml=12.
- Η διόρθωση stock είναι idempotent μέσω PurchaseOrderPackCorrection και μπορεί να διορθώσει ήδη FINAL test παραστατικό χωρίς δεύτερη οικονομική κίνηση.

Κρίσιμο test order: COSMOS I.K.E., 106.414. Η αρχική Οριστικοποίηση είχε περάσει ποσότητες κιβωτίων στο stock. Μετά το deploy, επανάληψη Οριστικοποίησης πρέπει να εκτελέσει μόνο pack correction και να φέρει τα stock σε τεμάχια.
