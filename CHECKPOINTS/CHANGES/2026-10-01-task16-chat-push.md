# Εργασία16 — Chat Push — 01/10/2026

**01/10/2026 — #16 ASSIGNED `fix/task16-chat-push-routing-20261001`; #17 ακολουθεί στην ίδια σελίδα κατόπιν εντολής ιδιοκτήτη. #15 δεν ξεκινά.** Διαβάστηκαν main/checkpoints Chat από11–13/09 και ιστορικό επηρεαζόμενων αρχείων. Παλιά πραγματικά PASS αναγνώσεων/αρχείων/δικαιωμάτων διατηρούνται. Ελέγχεται αποκλειστικά η δρομολόγηση Push μεταξύ καταστημάτων: πιθανή απορρόφηση push από ορατό άλλο POS, τοπική αναπαραγωγή εκκρεμεί. Background/ήχος και πραγματικό iOS/περιφερειακά NOT TESTED. Καμία πώληση, πληρωμή, stock, OCR ή TABLE_SERVICE αλλαγή. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-task16-chat-push.md`.

## Προστατευμένα αποτελέσματα

LAB11/09 αποστολή/μία εμφάνιση μετά refresh/αναζήτηση. LAB12/09 δύο λογαριασμοί, αναγνώστες StoreOperatorCredential, αδιάβαστο→άνοιγμα→read, αρχεία φωτογραφίας/PDF και tenant permissions, ολοκλήρωση και tasks. LAB13/09 ανακοίνωση acknowledgement, attachmentsettings και employeeDownloads. Τα νεότερα πραγματικά checkpoints υπερισχύουν των παλιών μη επιβεβαιωμένων pending bullets. Δεν επαναλαμβάνονται αυτές οι εγγραφές για να διορθωθεί η τεκμηρίωση.

## Αποδοχή νέου scope

Τοπική εκτέλεση πραγματικού service worker: incomingB με visibleA πρέπει να δείξει system notification, matching visibleB να λάβει εσωτερικό alert, hiddenB system alert, notification click να μην μετακινεί άλλο terminal. Πραγματικό background push/ήχος απαιτεί LAB παραλαβή από δεύτερη συσκευή· simulation/CI δεν είναι LAB PASS. #17 απαιτεί πραγματικό iPhone/εκτυπωτή/scanner. Δεν έχει σταλεί νέο μήνυμα ή μεταβληθεί δεδομένο.

## Απομονωμένη αναπαραγωγή / ελάχιστη διόρθωση

Πραγματικό sw.js εκτελέστηκε σε Node VM με WindowClient fixtures: πριν1/7PASS,6FAIL. PushB μεvisibleA δεν έδειχνε notification, και clickB μετέφερε το A. StorePosPanel ήδη απορρίπτει push διαφορετικού storeId, άρα η ειδοποίηση χανόταν. Μόνο sw.js αλλάζει: foreground μόνο ακριβές ίδιο store/origin, αλλιώς systemnotification με silent:false. Click εστιάζει μόνο το αντίστοιχο storepath ή ανοίγει νέα καρτέλα, χωρίς navigate άλλουPOS. Άκυρα/εξωτερικά destinations περιορίζονται στο origin.7/7 LOCAL PASS, Node24· απαιτείται Node20/full CI. Καμία αλλαγή API/δικαιωμάτων/DB/συνδρομών ή offlinefetch. Πραγματικό backgroundpush/ήχος AWAITING LAB.
