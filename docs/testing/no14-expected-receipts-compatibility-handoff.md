# Νο 14 — Παράδοση ορισμού συμβατότητας αναμενόμενων παραλαβών

Η πρόσθετη δέσμη συνεχίζει την ανάληψη #4056, η οποία συγχωνεύτηκε ως `868feb5d76b3a8bff8f3caadb233a2631700531a`. Οι δύο μονάδες και τα τέσσερα αρχεία ελέγχου/παράδοσης είναι νέα αρχεία Νο 14. Οι υπάρχοντες owners lifecycle, εγκαταστάτη Νο 7–9/5 και Python worker διατηρούν το δικό τους πεδίο.

Το #4053 εγκαταστάθηκε τεχνικά ως `bee86c697cc0803d2f168ee9a646c34d25e0cefc`. Το main CI `44479344582` και η κανονική εγκατάσταση `44481325403` πέρασαν. Render `dep-dbvafm8u01pc73daau4g` LIVE στις 19/11/2026 09:42 ώρα Ελλάδας. Η διαθεσιμότητα των τριών πινάκων, η πραγματική scoped επαναφορά και η τελική λειτουργική αποδοχή LAB παραμένουν χωριστές εκκρεμότητες.

## Ορισμός και είσοδος

Το `supplier-expected-receipts-compatibility-definition.js` εξάγει τον βαθιά παγωμένο ορισμό `MWS_EXPECTED_RECEIPTS_COMPATIBILITY_V1`, έκδοση 1, και SHA-256 του canonical JSON. Ο ορισμός έχει `activation:false` και `executionDisabled:true`.

Τελικό SHA-256 ορισμού προς διασταύρωση πριν από τη δημοσίευση της παρτίδας

`19f6f2ab25445c8f9d84e95333623ea8b6d572a66374ab16604cbbcf4395e15a`

Ο `collectExpectedReceiptCatalog(db,{schema})` διαβάζει μόνο μεταδεδομένα PostgreSQL με παραμέτρους. Ο `validateExpectedReceiptCompatibility({catalog,rows,scope,entities,operationEvidence})` εξετάζει τις παρεχόμενες τιμές χωρίς μεταβολή τους. Ο caller επιλέγει ρητά schema, εταιρεία και κατάστημα.

| Είσοδος | Απαιτούμενη πληροφορία |
| --- | --- |
| `catalog` | Πραγματικοί τύποι, precision/scale, nullability/defaults, PK/check/FK/index/trigger και εισερχόμενες αναφορές των τριών πινάκων |
| `rows` | Και οι τρεις πίνακες με όλα τα ορισμένα πεδία, ακριβείς ποσότητες ως δεκαδικά strings και έγκυρες ημερομηνίες |
| `scope` | Ρητά `companyId` και `storeId` |
| `entities` | Αξιόπιστη ταυτοποίηση Store/Supplier/Product/PurchaseOrder και ιστορική authority actor μέσα στο συγκεκριμένο scope |
| `entities.sourceEvidence` | Ανά allocation το αρχικό στιγμιότυπο `{order,moves}` με το ακριβές hash του πραγματικού source reader |
| `operationEvidence` | Αρχικό actor/action/expectedId, ολόκληρο raw body, compound key εταιρείας/καταστήματος και το αμετάβλητο αποτέλεσμα κάθε operation |

Η παρεχόμενη απόδειξη εξετάζεται μέσα στο δηλωμένο όριο `SUPPLIED_EVIDENCE_MATCH_ONLY`. Ο validator επιβεβαιώνει αντιστοίχιση ορισμού και αποδείξεων. Η ανεξάρτητη ανάγνωση της πραγματικής πηγής πρέπει να γίνει από τον adapter του owner ενσωμάτωσης, με το κανονικό `postedReceiptSource` και τις σχετικές ταυτότητες μέσα σε ένα συνεπές read-only snapshot. Το στατικό fixture περιέχει συνθετική απόδειξη για τη δοκιμή αυτού του ορίου εμπιστοσύνης.

## Πίνακες και ταυτότητες

| Πίνακας | Κύρια ταυτότητα | Εξαρτήσεις και ακριβείς ποσότητες |
| --- | --- | --- |
| SupplierExpectedReceiptLine | `id` | Company/store/supplier/product, αρχικός actor και αμετάβλητη μονάδα. Invoice quantity και factor NUMERIC(24,6), expected/cancelled quantity NUMERIC(30,12). |
| SupplierExpectedReceiptAllocation | `id` | FK `expectedLineId` προς Line, ίδιο company/store/product, καταχωρισμένο order και source digest, actor. Quantity NUMERIC(30,12). |
| SupplierExpectedReceiptOperation | `(companyId,storeId,key)` | Actor, ακριβές `payloadDigest` και JSON `result` με line/allocation identity όπου υπάρχει committed αποτέλεσμα. |

Η σειρά εισαγωγής είναι Line → Allocation → Operation. Η σειρά διαγραφής είναι Allocation → Operation → Line. Κάθε πρόσθετη εξωτερική FK, trigger, διαφορετική constraint/index ή άγνωστο πεδίο χρειάζεται νέα ανασκόπηση. Ο collector διαβάζει τις πραγματικές εισερχόμενες αναφορές, ώστε να φαίνονται και εξαρτήσεις άλλων πινάκων προς τους τρεις πίνακες.

Ο owner ενσωμάτωσης χρειάζεται πλήρη mapping εταιρείας/καταστήματος, προμηθευτή, προϊόντος/μονάδας, παραγγελίας, actor, expected line, allocation και των αντίστοιχων JSON ταυτοτήτων. Ένας παγκόσμιος SUPER_ADMIN μπορεί να έχει `companyId:null`. Η ιστορική authority του χρειάζεται ρητή απόδειξη για το συγκεκριμένο scope. Απουσία actor ή πηγής δίνει UNVERIFIED. Συγκεκριμένη αντικρουόμενη απόδειξη δίνει INVALID.

## Operation journal και replay

Το πραγματικό writer hash είναι SHA-256 του `JSON.stringify({actorId,action,expectedId,body:canonicalPayload(rawBody)})`. Η σειρά των τεσσάρων εξωτερικών πεδίων διατηρείται. Μόνο το body έχει αναδρομικά ταξινομημένα keys. Στο confirm το `expectedId` είναι `null`, επειδή το line id δημιουργείται μέσα στη συναλλαγή.

Το audit αποθηκεύει parsed body. Αριθμητική ποσότητα μπορεί αρχικά να ήταν number και τα `invoiceUnit`/`reason` μπορεί να είχαν περιφερειακά κενά πριν από τους κανονικούς μετασχηματισμούς του schema. Το parsed audit body συνεπώς δεν αρκεί γενικά για ανακατασκευή του raw request digest. Αν δεν υπάρχει η αρχική απόδειξη, το replay μένει UNVERIFIED.

Το journal πρέπει να περιέχει ακριβώς μία αρχική confirmation για κάθε line και ακριβώς μία σύνδεση για κάθε allocation, με συνεχείς committed εκδόσεις 0 έως την τρέχουσα. Η ακύρωση θετικού υπολοίπου συνδέεται με το σωστό actor και το καταγεγραμμένο cancelled quantity. Οι ιστορικές ποσότητες του result κρατούν τη σημασία τους στη συγκεκριμένη έκδοση. Το fixture έχει ιστορικό link remaining 8 και τελικό remaining 0 μετά την ακύρωση, και παραμένει έγκυρο. Τα rejected receipts έχουν μόνο `{rejected:true,message}` και δεν απαιτούν line/allocation id.

Αλλαγή ids ή company/store κατά scoped restore επηρεάζει τα operation keys, το raw body, τα JSON ids και τα hashes. Απλή αντικατάσταση ή νέο hash δεν αποδεικνύει διατήρηση του αρχικού replay. Ο owner lifecycle πρέπει να ορίσει και να δοκιμάσει τη διατήρηση αρχικού namespace/lineage και την αποτροπή παλαιών αιτημάτων πριν από ενεργοποίηση στο νέο πλαίσιο. Αυτή η απόφαση ενσωμάτωσης παραμένει εκκρεμής.

## Ερμηνεία αποτελέσματος

| Πεδίο | Ερμηνεία |
| --- | --- |
| `schemaStatus` | MATCH, UNINSTALLED ή INCOMPATIBLE για το πραγματικό catalog |
| `dataStatus` | NOT_PROVIDED, VERIFIED, UNVERIFIED ή INVALID για τις παρεχόμενες γραμμές και ταυτότητες |
| `replayStatus` | NOT_PROVIDED, VERIFIED, UNVERIFIED ή INVALID για τη διατήρηση των αρχικών operations |
| `compatible` | Αληθές μόνο όταν schema, data και replay ικανοποιούν τα ζητούμενα όρια απόδειξης |
| `activationReady` | Πάντοτε false σε αυτή την πρόσθετη δέσμη |
| `evidenceBoundary` | SUPPLIED_EVIDENCE_MATCH_ONLY |

Ο caller διαβάζει και τα τρία επιμέρους status και τα συγκεκριμένα issues. Μια αντιστοίχιση του schema μπορεί να συνυπάρχει με άκυρα δεδομένα ή ελλιπή απόδειξη replay.

## Έλεγχοι και παράδοση στους owners

Η pure δοκιμή χρησιμοποιεί ανεξάρτητο καταγεγραμμένο catalog, πλήρη ακολουθία confirm/link/cancel/rejected, ακριβές writer digest και αλλοιωμένες παραλλαγές. Η native δοκιμή καλεί το υπάρχον setup μόνο σε νέο απομονωμένο schema loopback test βάσης, διαβάζει πραγματικά PostgreSQL μεταδεδομένα, εισάγει συνθετικά fixtures και επιβεβαιώνει ότι ο validator και ο collector διατηρούν τις πραγματικές πηγές. Δέκα προσωρινές αποκλίσεις τύπου/default/nullability/στήλης/index/FK/incoming relation/RLS/constraint/UNLOGGED operation journal ανιχνεύονται και ανακαλούνται με rollback.

Το PGlite ελέγχει την ίδια fixture function με πραγματική SQL και μεταδεδομένα WASM PostgreSQL. Το native CI ελέγχει την πραγματική Prisma/PostgreSQL διαδρομή. Τα δύο τεκμήρια καταγράφονται χωριστά. Το αποτέλεσμα αυτών των ελέγχων συμπληρώνεται στο checkpoint της κοινής παρτίδας μετά την πραγματική εκτέλεση.

Οι owners Νο 7–9/5 θα ενσωματώσουν το πρόσθετο contract σε δική τους ελεγχόμενη έκδοση profile/installer, διατηρώντας τους παλιούς ορισμούς και hashes. Πριν από hosted εφαρμογή χρειάζονται δοκιμές πραγματικού scoped backup/restore, λειτουργικών FK/identity, replay/generation και ελεγχόμενης εγκατάστασης. Η τρέχουσα δέσμη αφήνει τις υπάρχουσες lifecycle/profile/worker πηγές ανέπαφες και την πραγματική κατάσταση readiness ορατή. Δεν προστίθεται λειτουργικό LAB PASS ή κλείσιμο του συνολικού Νο 14.

## Τοπικό τεκμήριο αυτής της παρτίδας

19/11/2026, Node 24.22.3. Οι 14 pure δοκιμές πέρασαν με 0 FAIL και 0 SKIP. Η ίδια εξαγόμενη native fixture function εκτελέστηκε επιπλέον σε απομονωμένο PGlite, με το ακριβές DDL του υπάρχοντος setup και πραγματικά catalog queries. Η baseline αντιστοίχιση schema πέρασε, δέκα πραγματικές αποκλίσεις metadata ανιχνεύτηκαν και ανακλήθηκαν με rollback, και οι έξι συνθετικές γραμμές μαζί με το schema παρέμειναν αμετάβλητες μετά τις read-only επικυρώσεις.

Η εκτέλεση αυτή εντόπισε πριν από CI την πραγματική μορφή του CHECK της lowercase quantity χωρίς περιττά εισαγωγικά και τα κανονικά PostgreSQL metadata των NOT NULL/PK/FK constraints. Ο νέος ορισμός και ο collector προσαρμόστηκαν στην παρατηρημένη metadata σημασία. Οι δέκα αποκλίσεις του native fixture διατηρήθηκαν. Το native Prisma/PostgreSQL CI, η ενσωμάτωση σε profile και η πραγματική scoped επαναφορά παραμένουν προς εκτέλεση και ανασκόπηση από τους αρμόδιους owners.

## Συνεπές snapshot πριν από ενσωμάτωση

Ο μελλοντικός adapter πρέπει να διαβάζει catalog, scoped rows, ιστορική authority και canonical postedReceiptSource μέσα στην ίδια έμπιστη συναλλαγή και συνεπές read-only snapshot. Ο αυτόνομος collector εκτελεί πολλαπλά SELECT για διάγνωση. Η ανεξάρτητη κλήση του δεν δεσμεύει την εγκατάσταση και δεν παγώνει μελλοντικές μεταβολές του schema. Η μελλοντική εγκατάσταση χρειάζεται δικό της έλεγχο φρεσκότητας, ταυτότητας και συναλλαγής από τους owners ενσωμάτωσης.
