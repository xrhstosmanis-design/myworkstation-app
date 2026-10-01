# Εργασία17 — iOS Push / PWA και συσκευές — 01/10/2026

ASSIGNED ίδια σελίδα με#16, εντολή ιδιοκτήτη «16-17», #15 εκτός. Ανεξάρτητο TABLE_SERVICE και οι ανατεθειμένες barcode/Gates δεν αλλάζουν.

## Προστατευμένα PASS

AndroidPWA11/09, mobile responsive11/09, cameraQR/Code128/scannerWorkforce23/09 (συμπεριλαμβανομένωνΕΛ/ENG), φυσική ετικέτα→scanner USER27/09 διατηρούνται. Δεν επαναλαμβάνονται για τεκμηρίωση. iPhone/Safari πραγματική εγκατάσταση/Push/QR, άλλοι θερμικοί/συρτάρι/display/scanners παραμένουν NOT TESTED.

## Αποδεδειγμένο κενό συμβατότητας από πρωτογενή προδιαγραφή

https://webkit.org/blog/12945/meet-web-push/ : το WebKit απαιτεί ορατό NotificationsAPI αποτέλεσμα για κάθεPush και μπορεί να ανακαλέσει subscription αν παραβιάζεταιuserVisibleOnly. Ο υπάρχωνserviceworker επιστρέφει χωρίς showNotification όταν υπάρχειmatchingvisiblePOS. Αυτό είναι απόκλιση προδιαγραφής, όχι πραγματικό iPhoneLABFAIL.

Ελάχιστο ανεξάρτητο scope: ο server προσθέτει boolean requiresSystemNotification μόνο σε subscription με ακριβέςHTTPShostname push.apple.com ή subdomain. Worker για αυτό τοflag διατηρεί systemnotification ακόμη και μεvisiblematchingPOS. Άλλοι providers κρατούν την παλιάinapp ορατήειδοποίηση/ήχο. Δεν αλλάζουνsubscriptions/DB/ρόλοι/εικόνες/QR/εκτυπωτές/ΠΟΣ/stock/OCR.

## Αποδοχή

Τοπικάbehavioral tests του πραγματικούsendStoreChatPush καιserviceworker μεApple/άλλους endpoints/visible/hidden, spoofedhosts καιreallegacyrootpayload. CI ≠ LABPASS. ΜετάgreenCI/merge/exactdeploy απαιτείταιπραγματικήiOSHomeScreenεγκατάσταση (iOS/iPadOS16.4+), usergesture permission,έναελεγχόμενοLABmessage απόάλλονLABλογαριασμό,background καιforegroundπαραλαβή/ήχος/click. Χωρίς πραγματικόiPhone/OSnotificationcenter/περιφερειακά, παραμένειAWAITINGDEVICE LAB.

## Τοπικό αποτέλεσμα

Actualsender/worker fixtures πριν3/5PASS,2FAIL, μετά5/5PASS. Μαζίμε#16 routing8/8,13/13LOCALPASS Node24. AppleforegroundshowNotification αντίsilentpostMessage, strictendpoint URLhost αντιspoofing, tenant/company/store/sender bindings/TTL300/privacy διατηρούνται. Δεν είναιphysicaliOSLABPASS.

## PWA εικονίδιο — δεύτερη οριοθετημένη διόρθωση συμβατότητας

Προϋπάρχονmanifest/HTML είχεμόνοSVGicons από#679. ΗApple τεκμηριώνειPNG γιαπαλιότεραSafari, ενώSVGallinterface υποστήριξηαναφέρεταιμόλιςSafari26. Προστίθενται deterministicPNG του ίδιουυπάρχοντοςSVG:180appletouch,192/512manifest καιοήδηreferencednotification192. Καμίααλλαγήbrand/start_url/scope/display/AndroidSVG/manifestidentity ήappflow. Inkscape rasterization καιοπτικόςέλεγχος192PASS, dimensions PNG επιβεβαιώνονται180/192/512. ΠραγματικόiOSinstallation/icon NOTTESTED. Πηγές: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html και https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/.
