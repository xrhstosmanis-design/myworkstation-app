# Εργασία17 — Apple Push / iOS PWA και συσκευές — 01/10/2026

Κατάσταση: **λογισμικό deployed / AWAITING DEVICE LAB**.
ASSIGNED `fix/task17-apple-push-20261001`, ίδια σελίδα με #16, μετά ρητή εντολή «16-17». #15/OCR και ανεξάρτητο TABLE_SERVICE δεν αλλάζουν.

## Προστατευμένα πραγματικά PASS

Android PWA και mobile responsive11/09, Workforce QR/Code128/scanner23/09 (ΕΛ/ENG) και USER ετικέτα→scanner27/09 διατηρούνται. Διαβάστηκαν τα σχετικά checkpoints/manual και ιστορικό PWA manifest/index από11/09. Τα ήδη περασμένα δεν επαναλαμβάνονται για τεκμηρίωση. Πραγματικό iPhone/Safari installation/Push/QR και πρόσθετοι θερμικοί/scanners/συρτάρι/display παραμένουν NOT TESTED.

## Δύο χωριστές οριοθετημένες διορθώσεις

1. **Apple Push conformance:** το WebKit απαιτεί Notifications API notification για κάθε Push και μπορεί να ανακαλέσει subscription όταν παραβιάζεται userVisibleOnly. Ο worker πριν επέστρεφε χωρίς system notification όταν ήταν ορατό το matching POS. Είναι απόκλιση προδιαγραφής, όχι παρατηρημένο iPhone LAB FAIL. Ο sender προσθέτει boolean `requiresSystemNotification` ανά recipient μόνο για HTTPS hostname `push.apple.com` ή πραγματικό subdomain. Ο worker για αυτό το flag δείχνει system notification ακόμη και με matching visible POS. Άλλοι providers διατηρούν υπάρχον foreground in-app alert/ήχο. Δεν αλλάζουν subscriptions, DB ή permissions.
2. **PNG icon fallback:** manifest/HTML είχαν μόνο SVG από#679. Προστέθηκαν180/192/512 PNG από το ίδιο υπάρχον SVG, χωρίς αλλαγή brand, start_url, scope, display, Android SVG ή app identity.180 χρησιμοποιείται ως apple-touch-icon,192/512 επιπλέον manifest icons·192 καλύπτει και την ήδη υπάρχουσα notification διαδρομή. Δεν ανασχεδιάζεται εφαρμογή.

Πρωτογενείς πηγές:
- https://webkit.org/blog/12945/meet-web-push/
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
- https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/

## Πραγματικοί έλεγχοι λογισμικού και deploy

Πραγματικός sender/worker σε απομονωμένα fixtures: πριν3/5 PASS,2 FAIL· μετά5/5 PASS. Μαζί με routing#16:13/13 targeted PASS. Ελέγχονται strict host/spoofing, tenant/company/store/sender bindings, TTL300, privacy, foreground/background και legacy root destination. PNG rasterization από Inkscape, οπτικός έλεγχος και διαστάσεις180/192/512 επιβεβαιωμένα.

PR#1591 merged `c260534436d986cdb003465d777d9a4c6e6e3fe7`. PR CI4000 / main CI4001 PASS: Node20.20.2,1746 server PASS,0FAIL,0SKIP, frontend build, invariants και isolated HTTP E2E. Guarded Render1850 PASS. Πραγματικό /api/health13:27Z επιβεβαιώνει ακριβώς αυτό το revision.

13:28Z άνοιξαν από production τα τρία PNG και ο browser τα αποκωδικοποίησε σε180×180,192×192,512×512. Fresh HTML αναφέρει /apple-touch-icon.png και /manifest.webmanifest. MAIN2/2,40 € και LAB-POS-02 2/0 € ίδια μετά reload. Στο τελικό LAB Chat13:30:05Z παραμένουν49 μηνύματα/9 αδιάβαστα. Αυτά είναι asset/UI readbacks, **όχι πραγματική iOS εγκατάσταση, Push παραλαβή/ήχος ή hardware PASS**.

## Handoff / μοναδική επόμενη ενέργεια

Cloud Chrome επέστρεψε αποκλεισμένη άδεια σε μία μόνο ενεργοποίηση στο#16. Δεν υπάρχει πραγματικό iPhone/iPad, OS notification center ή φυσικός εκτυπωτής/scanner/συρτάρι/display στη διαθέσιμη συνεδρία. Επόμενη μία ενέργεια: πραγματική LAB συσκευή, Safari Home Screen PWA όπου απαιτείται, → Ενεργοποίηση Push με φρέσκο BEFORE. Με επιτυχή συνδρομή, ο χρήστης κάνει μία ξεχωριστή μετρημένη LAB αποστολή από δεύτερο εξουσιοδοτημένο LAB λογαριασμό.

Τα foreground Apple, άλλο visible store, background ήχος/click, logout/login, QR iPhone, πρόσθετος εξοπλισμός και ασφαλές reconnect παραμένουν OPEN/NOT TESTED. Τα ήδη πραγματικά Android/Workforce/ετικέτα PASS δεν επαναλαμβάνονται. Η ίδια σελίδα κρατά την ανάθεση μέχρι ρητή μεταφορά· οδηγίες `docs/testing/task16-17-device-acceptance.md`. Δεν εστάλη μήνυμα και δεν έγινε read/upload/download/task/setting/stock/payment/OCR/TABLE_SERVICE πράξη. Δεν δηλώνεται συνολικό USER/LAB PASS.
