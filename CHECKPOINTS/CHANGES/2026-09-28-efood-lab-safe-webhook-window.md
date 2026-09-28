# efood / Pelican — ασφαλές προσωρινό LAB webhook

Ημερομηνία: 2026-09-28  
Ιδιοκτήτης εργασίας: παρούσα σελίδα — efood/Pelican Phase A  
Αρχικό branch: `feat/efood-lab-safe-webhook-window`  
PR: `#1514`

## Στόχος

Να μπορεί ο Super Admin να εκτελέσει το `Trigger Test Order` του efood αποκλειστικά στο `MYWORKSTATION LAB / ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ`, χωρίς να ανοίξει παραγωγική ροή και χωρίς δημιουργία παραγγελίας, πώλησης, κίνησης αποθήκης, πληρωμής ή φορολογικής εκτέλεσης.

## Υλοποίηση

- Προστέθηκε ξεχωριστό Authorization secret για το δοκιμαστικό webhook.
- Το secret δημιουργείται με 32 τυχαία bytes και εμφανίζεται μόνο μία φορά.
- Στη βάση αποθηκεύεται μόνο SHA-256 hash του secret.
- Προστέθηκε προσωρινό one-shot παράθυρο 1–15 λεπτών, με προεπιλογή 5 λεπτά.
- Η ενεργοποίηση επιτρέπεται μόνο σε SANDBOX, μόνο στο ακριβές LAB scope και μόνο όταν υπάρχει Test Vendor / Store ID.
- Το public webhook απαιτεί το μυστικό αποκλειστικά στο `Authorization` header και δεν δέχεται query-string secret.
- Η εγγραφή της διασύνδεσης κλειδώνεται με `FOR UPDATE`, ώστε δύο ταυτόχρονα events να μην περάσουν το one-shot όριο.
- Στο πρώτο έγκυρο νέο event:
  - αποθηκεύεται μόνο κρυπτογραφημένο dry-run event,
  - δεν δημιουργείται product mapping από το test event,
  - το παράθυρο σημειώνεται `CONSUMED`,
  - το webhook κλειδώνει αυτόματα.
- Στη λήξη το παράθυρο σημειώνεται `EXPIRED` και κλειδώνει.
- Ακριβές retry του ίδιου event παραμένει idempotent, ακόμη και μετά το αυτόματο κλείδωμα.
- Η παραγωγική efood εκτέλεση και τα outbound external calls παραμένουν κλειδωμένα.

## Super Admin UI

Προστέθηκαν:

- πλήρες Callback URL,
- αντιγραφή Callback URL,
- δημιουργία/περιστροφή ισχυρού secret,
- αντιγραφή secret,
- άνοιγμα 5λεπτου LAB webhook,
- ζωντανή αντίστροφη μέτρηση,
- άμεσο χειροκίνητο κλείδωμα,
- σαφής ένδειξη ότι Order / Sale / Stock / Payment / Fiscal παραμένουν `ΟΧΙ`.

## Έλεγχοι και συγχώνευση

Νέο test: `server/test/efood-lab-webhook-window-v1.test.js`

Καλύπτει:

- additive schema,
- hash-only secret,
- όρια TTL,
- ακριβές LAB/SANDBOX scope,
- header-only authentication,
- row locking,
- dry-run και μηδενικές λειτουργικές παρενέργειες,
- one-shot auto-lock,
- expiry auto-lock,
- idempotent retry,
- UI controls.

Μετά την παράλληλη πρόοδο του `main`, το branch επανατοποθετήθηκε καθαρά πάνω στο `52b205969aed6e1913e3640d08925b876886b1b6`, διατηρώντας και τις νεότερες αλλαγές της εγκατάστασης Διαδόχου Παύλου.

- PR CI `#3827`: **PASS**.
- PR `#1514`: **MERGED** ως `55f2a53c939cee230bab67b23645fd60555430bc`.
- Main CI `#3829` στο merge revision: **PASS**.
- Το επόμενο main `639944effe644d8709f5daefde18b33a428fa710`, που έχει γονέα το merge revision και συνεπώς περιλαμβάνει την αλλαγή, πέρασε επίσης main CI `#3830`: **PASS**.
- Η ενιαία ενεργή λίστα ενημερώθηκε με την πραγματική κατάσταση.

## Κατάσταση

`MERGED — CI PASS — AWAITING EXACT RENDER DEPLOY / REAL PARTNER LAB`

Δεν έχει τεκμηριωθεί ακόμη το ακριβές Render revision μέσω production health readback και δεν έχει εκτελεστεί πραγματικό `Trigger Test Order` από το efood Partner. Επομένως δεν δηλώνεται production ή LAB PASS. Παραγγελία, πώληση, stock, πληρωμή και φορολογική εκτέλεση παραμένουν κλειδωμένα από σχεδιασμό.
