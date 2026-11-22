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

Οι owners Νο 7–9/5 θα ενσωματώσουν το πρόσθετο contract σε δική τους ελεγχόμενη έκδοση profile/installer, διατηρώντας τους παλιούς ορισμούς και hashes. Η μη καταστροφική εγκατάσταση των τριών απόντων πινάκων και η native αποδοχή του installer αποτελούν αυτοτελές επόμενο σκέλος. Το χειροκίνητο backup/restore έχει μετατεθεί για άλλη ημέρα, χωρίς ορισμένη ημερομηνία και χωρίς εκτέλεση στην παρούσα εργασία. Παραμένει χωριστό υπόλοιπο, ενώ οι ανεξάρτητες υλοποιήσεις και οι διαθέσιμοι έλεγχοι Νο 14 συνεχίζονται. Η πραγματική κατάσταση readiness και το συνολικό Νο 14 παραμένουν OPEN.

## Τοπικό τεκμήριο αυτής της παρτίδας

19/11/2026, Node 24.22.3. Οι 14 pure δοκιμές πέρασαν με 0 FAIL και 0 SKIP. Η ίδια εξαγόμενη native fixture function εκτελέστηκε επιπλέον σε απομονωμένο PGlite, με το ακριβές DDL του υπάρχοντος setup και πραγματικά catalog queries. Η baseline αντιστοίχιση schema πέρασε, δέκα πραγματικές αποκλίσεις metadata ανιχνεύτηκαν και ανακλήθηκαν με rollback, και οι έξι συνθετικές γραμμές μαζί με το schema παρέμειναν αμετάβλητες μετά τις read-only επικυρώσεις.

Η εκτέλεση αυτή εντόπισε πριν από CI την πραγματική μορφή του CHECK της lowercase quantity χωρίς περιττά εισαγωγικά και τα κανονικά PostgreSQL metadata των NOT NULL/PK/FK constraints. Ο νέος ορισμός και ο collector προσαρμόστηκαν στην παρατηρημένη metadata σημασία. Οι δέκα αποκλίσεις του native fixture διατηρήθηκαν. Το native Prisma/PostgreSQL CI, η ενσωμάτωση σε profile και η πραγματική scoped επαναφορά παραμένουν προς εκτέλεση και ανασκόπηση από τους αρμόδιους owners.

## Συνεπές snapshot πριν από ενσωμάτωση

Ο μελλοντικός adapter πρέπει να διαβάζει catalog, scoped rows, ιστορική authority και canonical postedReceiptSource μέσα στην ίδια έμπιστη συναλλαγή και συνεπές read-only snapshot. Ο αυτόνομος collector εκτελεί πολλαπλά SELECT για διάγνωση. Η ανεξάρτητη κλήση του δεν δεσμεύει την εγκατάσταση και δεν παγώνει μελλοντικές μεταβολές του schema. Η μελλοντική εγκατάσταση χρειάζεται δικό της έλεγχο φρεσκότητας, ταυτότητας και συναλλαγής από τους owners ενσωμάτωσης.


## 20/11/2026 — Πραγματική πηγή εγκατάστασης και επόμενο μη καταστροφικό σκέλος

Το main CI 44488040952 του source #4057 ολοκληρώθηκε SUCCESS. Στις 20/11/2026 11:09:40Z, δηλαδή 13:09:40 ώρα Ελλάδας, ο εξουσιοδοτημένος read-only hosted έλεγχος επέστρεψε NULL και για τα τρία to_regclass των SupplierExpectedReceiptLine, SupplierExpectedReceiptAllocation και SupplierExpectedReceiptOperation. Η συγχωνευμένη πηγή και ο ορισμός συμβατότητας είναι διαθέσιμα, ενώ η φυσική εγκατάσταση των πινάκων παραμένει το συγκεκριμένο τεχνικό εμπόδιο.

Η τρέχουσα παρατηρημένη έκδοση Render είναι beb5858f8b658ff40f3f89775e9ea712d691147c, deploy dep-dc00ks3rjlhs73fvu6u0, LIVE στις 20/11/2026 10:54:45 Ελλάδας. Το reports-only V3 του τελευταίου κοινού τεκμηρίου εγκατάστασης Νο 7 εξαιρεί τους τρεις πίνακες Νο 14. Στο CUA παρατηρήθηκε φόρμα σύνδεσης, χωρίς ενεργή εξουσιοδοτημένη συνεδρία. Δεν έγινε προσπάθεια σύνδεσης ή εναλλαγή ρόλου. Η κοινή τελική λειτουργική συνεδρία και η φόρμα Νο 14 παραμένουν NOT TESTED.

| Ταυτότητα | Παρατηρημένη τιμή |
| --- | --- |
| Source profile του τελευταίου κοινού τεκμηρίου Νο 7, με identifier επιβεβαιωμένο στην τρέχουσα πηγή | MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3 |
| Τελευταίο κοινά καταγεγραμμένο installed-plan / fence hash Νο 7 | 54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828 |
| Τελευταία κοινά καταγεγραμμένη fence κατάσταση LAB | generation 0, maintenance false, retired false, operation null |
| Αμετάβλητος ορισμός Νο 14 | 19f6f2ab25445c8f9d84e95333623ea8b6d572a66374ab16604cbbcf4395e15a |
| Νέο profile / target hash Νο 14 | Προς παραγωγή και ανασκόπηση από τους owners εγκατάστασης |

Η SQL της 20/11/2026 11:09:40Z περιορίστηκε στις τρεις τιμές to_regclass. Τα παραπάνω plan/fence/generation στοιχεία προέρχονται από το τελευταίο κοινό τεκμήριο εγκατάστασης Νο 7. Ο επόμενος προέλεγχος πρέπει να τα επαναδιαβάσει και να επιβεβαιώσει την τότε πραγματική κατάσταση πριν από οποιαδήποτε εφαρμογή.

Η επόμενη μετάβαση πρέπει να οριστεί ρητά από το εγκατεστημένο V3 προς νέο target που περιλαμβάνει το Νο 14. Το παλιό capture δεν αποτελεί την παρατηρημένη πηγή αυτής της μετάβασης. Η υπάρχουσα παρατήρηση installer δέχεται μόνο την αναγνωρισμένη source ή την αναγνωρισμένη target κατάσταση και απαιτεί ομοιόμορφα fences. Η σημερινή πηγή V3 και το αρχικό capture συνεπώς δεν υποκαθιστούν το ένα το άλλο κατά τον προέλεγχο.

Οι owners Νο 7–9/5 διατηρούν τα runtime/lifecycle/installer αρχεία και την ενσωμάτωση. Το όνομα και το hash του νέου target θα προκύψουν από τον νέο ανασκοπημένο ορισμό. Τα υφιστάμενα V1/V2/V3 hashes και ο ορισμός Νο 14 παραμένουν αμετάβλητοι. Το παρόν είναι σχέδιο παράδοσης και δεν εφαρμόζει schema, profile, generation, permission ή module αλλαγή.

### Μη καταστροφική εγκατάσταση για υλοποίηση από τους owners

1. Ο νέος προέλεγχος διαβάζει το πραγματικό installed V3 catalog/plan και όλα τα σχετικά fences του υπάρχοντος installer στο ίδιο έμπιστο συνεπές snapshot. Επαληθεύει την ακριβή source ταυτότητα, το scope, την κατάσταση maintenance/retirement/operation και το uniform fence hash.
2. Η ρητή μετάβαση V3 προς νέο Νο 14 target προσθέτει μόνο τους τρεις απόντες πίνακες με το ακριβές ανασκοπημένο schema. Οι υπάρχουσες εμπορικές εγγραφές, ποσότητες, οικονομικά ποσά και ιστορικό παρέχουν ελέγχους αμετάβλητων δεδομένων.
3. Πριν από την εφαρμογή γίνεται νέα επαλήθευση της ίδιας source ταυτότητας και φρεσκότητας υπό τον υπάρχοντα μηχανισμό κλειδώματος. Μερικώς εγκατεστημένο ή αποκλίνον No14 catalog, μικτά fences, ξένο scope ή αλλαγμένο plan σταματούν τη μετάβαση με συγκεκριμένο εύρημα.
4. Η δημιουργία και η καταγραφή του ανασκοπημένου target ακολουθούν τους υπάρχοντες κανόνες συναλλαγής, generation, audit και idempotency του installer. Αποτυχία ενδιάμεσου βήματος πρέπει να επαναφέρει ολόκληρη τη μετάβαση στην ακριβή V3 source κατάσταση.
5. Η τελική read-only επαλήθευση διαβάζει πλήρες ακριβές target schema και ομοιόμορφα target fences πριν δώσει readiness. Η λειτουργική αποδοχή ακολουθεί στην κοινή τελική LAB συνεδρία με τους υπάρχοντες ρόλους.

### Native αποδοχή του νέου installer πριν από πραγματική εφαρμογή

| Απομονωμένο σενάριο | Απαιτούμενο τεκμήριο |
| --- | --- |
| Ακριβές εγκατεστημένο V3, τρεις πίνακες απόντες, ομοιόμορφο source plan | Μία πλήρης μη καταστροφική μετάβαση προς το νέο ανασκοπημένο target |
| Παλιό capture προσφέρεται αντί του εγκατεστημένου V3 | Απόρριψη της λανθασμένης source ταυτότητας πριν από DDL |
| Αλλαγή plan/generation ή μικτά source/target fences μεταξύ inspect και apply | Απόρριψη stale ή αμφίσημου προελέγχου με αμετάβλητη κατάσταση |
| Μόνο ένας ή δύο πίνακες Νο 14, λάθος precision/default/PK/FK/index, UNLOGGED operation journal | Συγκεκριμένη ασυμβατότητα και αμετάβλητες εμπορικές πηγές |
| Αστοχία μετά την πρώτη δημιουργία πίνακα και πριν την ολοκλήρωση | Πλήρες rollback στην V3 source, μαζί με fences/audit/operation κατάσταση |
| Επανάληψη του ίδιου installation request | Το αρχικό αποτέλεσμα υπό την υφιστάμενη idempotency, χωρίς πρόσθετη μετάβαση |
| Ήδη πλήρες ακριβές target | Ορθή read-only αναγνώριση και επαλήθευση, με αμετάβλητες πηγές |
| Πλήρης επιτυχής μετάβαση | Ακριβείς τρεις ορισμοί, uniform target fences και αμετάβλητα fingerprints υπάρχοντος stock/χρημάτων/παραστατικών/ιστορικού |

Οι έλεγχοι αυτοί αφορούν νέα απομονωμένη installer υλοποίηση και παραμένουν NOT IMPLEMENTED / NOT TESTED στο παρόν handoff. Τα ήδη ολοκληρωμένα 14 pure και τα 10 catalog-mutation fixture cases διατηρούν το τεκμήριό τους. Η ανεξάρτητη πηγαία εργασία, ο προέλεγχος και οι απομονωμένες δοκιμές μπορούν να ολοκληρωθούν πριν από την ημέρα χειροκίνητου backup/restore.

Το backup/restore παραμένει ρητά μετατεθειμένο για άλλη ημέρα. Δεν έχει οριστεί ημερομηνία και δεν εκτελείται από αυτή την εργασία. Η μελλοντική πραγματική άσκησή του παραμένει χωριστή εκκρεμότητα των υπεύθυνων owners.

## Ρητός No14 installer — πηγαία συνέχεια #4089 / Draft

Η νέα factory `createExpectedReceiptInstallation` επιλέγει μόνο το ρητό `MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_NO14_V1`, με raw source V3 hash `54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828` και target `75ddba0584cc6a256bd0d97b6d4b8ad466229061da7329f72c07a068acc49183`. Δεν αλλάζει το process environment ή τα παλιά profile definitions/hashes. Η target δήλωση παραμένει reports-only, `executionDisabled=true`.

Το privileged API είναι `/api/platform/companies/:companyId/stores/:storeId/expected-receipt-installation`, με GET `describe`, GET `inspect` και ρητό POST `install`. Το own UI μπορεί να χρησιμοποιεί το αντίστοιχο store-only alias `/api/platform/expected-receipt-installation/stores/:storeId`. Το alias επιλύει μόνο το ακριβές επιλεγμένο Store.companyId μετά την ίδια privileged SA/session/channel admission του No7 installer. Δεν παρέχει εταιρικό fallback ή πρόσβαση απλού χρήστη. Το enable gate είναι το ήδη υπάρχον `AUTOMATIC_REPORT_EVENT_INSTALL_ENABLED`, χωρίς νέα ρύθμιση ή αλλαγή τιμής.

Η συναλλαγή κλειδώνει με το υπάρχον `mws:monthly-snapshot-install-v1`, fence-first και ταξινομημένα relation locks. Η source απαιτεί ήδη εγγεγραμμένο V3 κατάστημα και ομοιόμορφα παλιά fences. Μερική ή αποκλίνουσα εγκατάσταση απορρίπτεται. Επιτρέπονται μόνο οι τρεις νέοι πίνακες/δικοί τους indexes και η atomic αλλαγή fence planHash. Δεν καλείται targetCore.installInTransaction, δεν ξαναγράφονται παλιοί guards, δεν γίνεται νέο enrollment ή generation αλλαγή.

Η αναγνώριση ήδη εγκατεστημένου target είναι declarative επαλήθευση της τρέχουσας κατάστασης. Η απόκριση δηλώνει `verifiedCurrentTarget=true` και `originalOperationReceipt=false`. Δεν αποδεικνύει ότι ένα παλιό request εκτελέστηκε ούτε προσθέτει durable receipt/audit πίνακα. Η UI διατηρεί το αρχικό packet πριν από POST, σε actor/company/store namespace. Αμφίσημη απόκριση ή αποτυχία GET δεν διαγράφει το packet. Άλλη actor/scope/revision/plan ταυτότητα απαιτεί ανασκόπηση, χωρίς αυτόματο νέο POST ή σιωπηρή μετονομασία αιτήματος.

Η πρώτη πραγματική Node20/native PostgreSQL16 δοκιμή πέρασε με αμετάβλητο παλιό catalog/functions/triggers και εμπορικές γραμμές, εκτός του ρητού fence planHash. Generations/counts διατηρήθηκαν και οι τρεις νέοι πίνακες ολοκληρώθηκαν κενοί. Το No7 lock boundary/V2 readiness και η read-only target συμφιλίωση πέρασαν. Οι διευρυμένοι έλεγχοι, No5 package provenance και full CI συνεχίζονται. Hosted schema εφαρμογή δεν εξουσιοδοτείται ή εκτελείται σε αυτή την παρτίδα· backup/restore και κοινή λειτουργική αποδοχή παραμένουν OPEN.


## Τελική ιδιωτική τοπική επαλήθευση — 20/11/2026

Η docs-only συμπληρωματική ανάληψη #4091 δημοσιεύτηκε ως 688026a6bc8608af9117dce08082ae88cfeef8f1 μετά CI44751858924 SUCCESS. Ενσωματώθηκε το δημόσιο main τοπικά, με ακέραιη τη Νο15 πηγή και το νεότερο Table-route pin. Η ανεξάρτητη Python SOURCE_PATHS tuple προσθέτει μόνο τα τέσσερα πραγματικά No14 shared dependencies και το provenance packet καταγράφει το αντίστοιχο νέο Python hash. Όλα τα 53 source pins και τα παλιά COMPANY manifest hashes επαληθεύτηκαν. Η προηγούμενη package αστοχία 53/49 διορθώθηκε χωρίς χαλάρωση ελέγχου.

Πραγματική συνδυασμένη Node20.20.0 / native PostgreSQL16.16 εκτέλεση: 20 tests,19 PASS,0 FAIL,1 SKIP σε12,37s. Πέρασαν το νέο native V3→No14 fixture, pure/HTTP/mounted UI, No5 native και πραγματικό relocated53-file package. Μόνο το actual production recovery Docker image test παραλείφθηκε επειδή το image δεν είναι διαθέσιμο τοπικά. Το νέο integrated native test περιλαμβάνει δύο enrolled stores, ίδιο generation/count, uniform μετάβαση, τρεις κενούς πίνακες, αμετάβλητα παλιά catalog/functions/triggers/εμπορικές γραμμές, τρία rollback στάδια, αρνήσεις scope/session/stale/mixed/partial/unknown/UNLOGGED, παλιά No7 packet semantics και V2 admission. Δεν μετατρέπουμε τα υποσενάρια σε πρόσθετο αριθμό tests. Η PostgreSQL ξεκίνησε σε νέο loopback test database και σταμάτησε καθαρά.

Το UI διατηρεί το αρχικό packet μετά από αμφίσημη απόκριση, δεν εγκλωβίζεται μετά από αλλαγή καταστήματος και αρνείται νέα υποβολή με αλλαγμένη actor/scope/revision/plan ταυτότητα. Με απενεργοποιημένο το υπάρχον installation flag, inspect παραμένει διαθέσιμο και eligible=false, ενώ POST απενεργοποιείται. Ρητό GET που επαληθεύει το ίδιο πλήρες context/enrollments και πραγματικό target μπορεί να συμφιλιώσει το αποθηκευμένο packet χωρίς POST. Επίσημο Node20 production frontend build και TABLE_SERVICE bundle check PASS.

Δημόσια δημοσίευση της νέας πηγής δεν πραγματοποιήθηκε: automatic approval review απέρριψε το git push λόγω μη ρητής άδειας δημόσιας κοινοποίησης νέου κώδικα. Δεν έγινε retry ή εναλλακτικό upload. Η υλοποίηση και το ιδιωτικό patch παραμένουν τοπικά για ανασκόπηση πριν από τυχόν ρητή άδεια. Full remote CI της ιδιωτικής πηγής και το πραγματικό production-image test παραμένουν εκκρεμή. Καμία hosted DDL, env/grant μεταβολή, report αποστολή, backup/restore ή επιχειρησιακή πράξη. Συνολικό Νο14 και κοινή λειτουργική αποδοχή OPEN.

Τελικός έλεγχος μετά την τοπική ενσωμάτωση main και τις τελευταίες UI αλλαγές: επίσημο Node20 npm run build PASS (13,93s), TABLE_SERVICE bundle check PASS και έξι υπάρχοντες production-safety source invariant έλεγχοι PASS. Το git diff --check πέρασε. Αρχικές ελλείψεις sparse paths αντιμετωπίστηκαν μόνο με ανάγνωση των υφιστάμενων δημόσιων αρχείων· δεν άλλαξε υφιστάμενος invariant έλεγχος.
