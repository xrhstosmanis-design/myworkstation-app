# Checkpoint — Φωτογραφίες και PDF στο Chat καταστήματος

- Υποστηρίζεται μία φωτογραφία JPG/PNG/WEBP ή ένα PDF έως 7 MB ανά μήνυμα.
- Το κείμενο είναι προαιρετικό όταν υπάρχει αρχείο.
- Τα bytes του αρχείου μένουν στον server και δεν περιλαμβάνονται ποτέ στη λίστα μηνυμάτων.
- Η προβολή φορτώνεται μόνο μετά από ενέργεια χρήστη, με `Cache-Control: no-store`, και καθαρίζεται από τη μνήμη όταν κλείσει.
- Ο υπάλληλος δεν λαμβάνει δικαίωμα download. Ιδιοκτήτης και Super Admin έχουν ξεχωριστό, server-authorized download.
- Upload, προβολή και download αφήνουν ξεχωριστό audit event.
- MIME allowlist, έλεγχος magic bytes, όριο μεγέθους και tenant/store scope εφαρμόζονται server-side.
- Στοχευμένο test, 1111/1111 server tests και client production build: PASS.
- Εκκρεμούν CI, deploy και LAB retest.
