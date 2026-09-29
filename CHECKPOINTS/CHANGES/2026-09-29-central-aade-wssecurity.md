# Κεντρική ΑΑΔΕ — WS-Security — 29/09/2026

Η εικόνα `image(20260929-200753).png` μετά την έκδοση SOAP 1.2 δείχνει απόκριση υπηρεσίας «Δεν ορίσθηκε ο χρήστης που καλεί την υπηρεσία». Η υπηρεσία δέχεται πια το αίτημα, αλλά δεν αναγνώρισε τον χρήστη.

Το επίσημο πακέτο τεκμηρίωσης ΑΑΔΕ `RgWsPublic2DevelopersInfoV1.1.zip`, `Soap_Request_Response_Examples/rgWsPublic2AfmMethod_WithOUTAsOnDate_Request.xml`, ορίζει `<Security><UsernameToken><Username>…</Username><Password>…</Password></UsernameToken></Security>` στο namespace WS-Security. Ο κοινός κώδικας έστελνε μη τυποποιημένο `AuthenticationHeader`. Αντικαταστάθηκε από το ακριβές WS-Security σχήμα, με XML escaping και τα ίδια αποθηκευμένα ανά εταιρεία κρυπτογραφημένα στοιχεία. Δεν εμφανίστηκαν ή μεταβλήθηκαν κωδικοί.

CI/Render και πιστοποιημένη πραγματική δοκιμή ΑΦΜ AWAITING. Η αλλαγή αφορά όλες τις εταιρείες, με υφιστάμενη απομόνωση company/store. Δεν έγινε μεταβολή προμηθευτή/stock/παραστατικού από τη διάγνωση.
