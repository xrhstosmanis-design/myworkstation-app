# Νο 14 — Συμβατότητα αναμενόμενων παραλαβών / BEFORE SOURCE

19/11/2026 ώρα Ελλάδας. Owner /root της σελίδας 13–14, βοηθοί /root/suppliers και /root/cost. Συνέχεια της ρητής ανάθεσης Νο 14 και #4047/#4053. Νέο πρόσθετο πεδίο για ορισμό συμβατότητας, validator, απομονωμένα fixtures και τεχνική παράδοση.

## Τρέχουσα εγκατάσταση και εκκρεμότητα

Το #4053 συγχωνεύτηκε ως bee86c697cc0803d2f168ee9a646c34d25e0cefc. Το ακριβές main CI 44479344582 και η κανονική ελεγχόμενη εγκατάσταση 44481325403 ολοκληρώθηκαν SUCCESS. Render dep-dbvafm8u01pc73daau4g LIVE στις 19/11/2026 09:42 ώρα Ελλάδας. Αυτά αποτελούν τεχνική εγκατάσταση της πηγής.

Οι SupplierExpectedReceiptLine, SupplierExpectedReceiptAllocation και SupplierExpectedReceiptOperation χρειάζονται συμβατότητα με τις διαδρομές scoped εγκατάστασης/αντιγράφου/εκκαθάρισης/επαναφοράς. Η κανονική εφαρμογή διατηρεί έλεγχο readiness και 503 όταν οι πίνακες απουσιάζουν. Η παρούσα ανάληψη ετοιμάζει ελέγξιμη περιγραφή για παράδοση στους υπάρχοντες owners των lifecycle και installer.

## Ανάγνωση και ownership

Αναγνώστηκαν τα τρέχοντα AGENTS.md, COMMON_WORK_RULE.md, ACTIVE_WORK_2026.md, το πλήρες authoritative OPEN_WORK_TRACKER.md με τοπικό Git και οι δύο σχετικές καταγραφές Νο 14. Το tracker blob 84382675b117a7273dbc229e0e73eb4683066f16 διατηρεί task30 owner codex/task30-order-suggestions-20261005. Οι αναθέσεις lifecycle/εγκαταστάτη Νο 7–9 και 5 παραμένουν στις υπεύθυνες σελίδες τους. Η νέα εργασία περιορίζεται στα πρόσθετα αρχεία Νο 14 που αναφέρονται παρακάτω.

## Ακριβές πρόσθετο πεδίο

- Νέος αμετάβλητος, versioned ορισμός των τριών πραγματικών πινάκων Νο 14. Καταγράφει ακριβή ονόματα στηλών, τύπους NUMERIC και precision/scale, nullability/defaults, primary/unique/index/FK ταυτότητες, πεδίο company/store και σειρά εξαρτήσεων.
- Νέος read-only validator που συγκρίνει παρεχόμενο απομονωμένο catalog και δεδομένα με αυτόν τον ορισμό. Ελέγχει όρια εταιρείας/καταστήματος, ταυτότητες και συνδέσεις expected line/allocation, ποσότητες/version, actor/source identity και το operation receipt JSON. Κάθε άγνωστη στήλη/πεδίο/σχέση ή μη τεκμηριωμένη αντιστοίχιση δίνει συγκεκριμένο εύρημα.
- Νέα fixtures και pure/native PostgreSQL δοκιμές του ίδιου validator. Περιλαμβάνουν έγκυρο schema/γραφικές συνδέσεις, λάθος τύπο/precision/nullability/FK, ξένο tenant/store, orphan allocation, άγνωστα receipt keys, αλλοιωμένο result id/version/ποσότητα και αμετάβλητες πηγές πριν/μετά. Οι εγγραφές που συνδέονται με payloadDigest χρειάζονται ρητή περιγραφή διατήρησης ταυτότητας και replay στο handoff.
- Νέο κείμενο παράδοσης στους υπάρχοντες owners. Αναφέρει ακριβή ορισμό/hash, προϋποθέσεις, mapping company/store/product/supplier/order/actor/expectedLine/result JSON, σειρά restore/delete και τις αποφάσεις που απομένουν για ενσωμάτωση. Ο validator παράγει διάγνωση συμβατότητας, χωρίς να εκτελεί μετατροπή ή επαναφορά.

Τα νέα αρχεία πηγής και ελέγχων κλειδώνουν ως εξής.

- server/src/services/supplier-expected-receipts-compatibility-definition.js
- server/src/services/supplier-expected-receipts-compatibility.js
- server/test/supplier-expected-receipts-compatibility.test.js
- server/test/supplier-expected-receipts-compatibility-postgres.test.js
- server/test/fixtures/supplier-expected-receipts-compatibility.json
- docs/testing/no14-expected-receipts-compatibility-handoff.md

Οι υπάρχουσες πηγές lifecycle executor, manifest και παλαιών profiles, ο Python worker και οι εγκαταστάτες Νο 7–9/5 μένουν στους υφιστάμενους owners. Η παρούσα δέσμη δεν περιλαμβάνει αλλαγή τους. Δεν περιλαμβάνει DDL σε hosted περιβάλλον, αυτόματη εγκατάσταση πινάκων από routes, ενεργοποίηση module ή επιχειρησιακή ενέργεια. Η έκδοση/hash των παλιών profiles διατηρείται αυτούσια και η εφαρμογή συνεχίζει να εμφανίζει την πραγματική κατάσταση readiness.

## Επόμενο βήμα και αποδοχή

Πρώτα ανασκόπηση, πράσινο docs CI και δημοσίευση αυτής της ανάληψης στο main. Έπειτα μία περιορισμένη δέσμη μόνο στα έξι νέα αρχεία, στο ίδιο checkpoint και στην υπάρχουσα εγγραφή Νο 14 της ACTIVE. Η πηγή παραμένει ανέπαφη μέχρι τότε. Ακολουθούν απομονωμένοι έλεγχοι του validator, πλήρες ακριβές CI και τεχνική παράδοση στους owners ενσωμάτωσης.

Κατάσταση NOT IMPLEMENTED / NOT TESTED για το νέο πρόσθετο πακέτο. Η τεχνική εγκατάσταση #4053 διατηρεί το δικό της εύρος. Η πραγματική εγκατάσταση πινάκων, λειτουργική ενεργοποίηση και κοινή τελική LAB αποδοχή Νο 14 παραμένουν OPEN. Δεν προστίθεται λειτουργικό PASS ή κλείσιμο roadmap.


## 19/11/2026 — Source merged / τεχνικό πακέτο παράδοσης

Η ανάληψη #4056 συγχωνεύτηκε ως 868feb5d μετά SUCCESS docs CI 44483364041 πριν από κώδικα. Το πρόσθετο source PR #4057 συγχωνεύτηκε ως 361193e60f39ab62005d3ace5124d8e4e5cd1d0c. Το ακριβές τελικό head 72365ddea5b50843ee50aa25271ccad680fbb1d1 πέρασε το πλήρες PR CI 44486238567 με 5/5 επιτυχή jobs. Η ανεξάρτητη ανασκόπηση εξέτασε τα ακριβή έξι νέα αρχεία και τα δύο έγγραφα της παρτίδας. Το main CI 44488040952 εκτελείται κατά την παρούσα καταγραφή.

Το build-and-test job 135430554491 και το βήμα Run security and licensing tests ολοκληρώθηκαν SUCCESS σε CI με διαμορφωμένο PostgreSQL 16. Η πλήρης έξοδος των επιμέρους named TAP δοκιμών δεν ήταν άμεσα παρατηρήσιμη λόγω του περιορισμού του επιστρεφόμενου prefix. Δεν συνάγεται επιμέρους πλήθος native tests ή νέα λειτουργική αποδοχή από αυτό το τεχνικό αποτέλεσμα.

Τοπικά οι 14 pure δοκιμές πέρασαν με 0 FAIL και 0 SKIP. Η ίδια εξαγόμενη fixture function εκτελέστηκε επιπλέον με πραγματικό schema/catalog σε απομονωμένο PGlite. Δέκα πραγματικές αποκλίσεις metadata, μαζί με UNLOGGED operation journal, ανιχνεύτηκαν και ανακλήθηκαν με rollback. Οι έξι συνθετικές γραμμές και το schema παρέμειναν αμετάβλητα μετά τις read-only επικυρώσεις. Η ξεχωριστή τοπική native Prisma εκτέλεση είχε infrastructure SKIP λόγω απουσίας DATABASE_URL και καταγράφεται χωριστά από το PGlite.

Ο τελικός αμετάβλητος ορισμός MWS_EXPECTED_RECEIPTS_COMPATIBILITY_V1 / version 1 έχει SHA-256 19f6f2ab25445c8f9d84e95333623ea8b6d572a66374ab16604cbbcf4395e15a. Το handoff είναι docs/testing/no14-expected-receipts-compatibility-handoff.md. Τα schema/data/replay status παραμένουν χωριστά, με evidenceBoundary SUPPLIED_EVIDENCE_MATCH_ONLY και activationReady=false.

Η ενσωμάτωση σε profile/installer, η πραγματική scoped επαναφορά, η εγκατάσταση πινάκων και η ενεργοποίηση παραμένουν OPEN στους υπάρχοντες owners Νο 7–9/5. Ο μελλοντικός adapter πρέπει να διαβάζει catalog, scoped rows, authority και canonical postedReceiptSource σε ένα συνεπές έμπιστο read-only snapshot. Οι υπάρχουσες lifecycle/executor/worker/profile πηγές διατηρήθηκαν αυτούσιες. Δεν εκτελέστηκε hosted DDL, ενεργοποίηση, χρηματική ή stock πράξη από την πρόσθετη δέσμη.

Το συνολικό Νο 14 και η κοινή τελική LAB αποδοχή παραμένουν OPEN. Η παρούσα καταγραφή ενημερώνει μόνο την υπάρχουσα εγγραφή Νο 14 της ACTIVE και το ίδιο checkpoint. Δεν προστίθεται νέα πηγή, λειτουργικό manual PASS ή κλείσιμο roadmap.


## 20/11/2026 — Εντοπισμένο εμπόδιο εγκατάστασης και οριοθετημένη συνέχεια

Το main CI 44488040952 του #4057 είναι πλέον SUCCESS. Η πραγματική hosted read-only εξέταση στις 20/11/2026 11:09:40Z επιβεβαίωσε ότι και τα τρία to_regclass Νο 14 επιστρέφουν NULL. Το τελευταίο κοινό τεκμήριο εγκατάστασης Νο 7 καταγράφει profile MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3 με source installed-plan/fence hash 54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828, με LAB generation 0, maintenance false, retired false και operation null. Η SQL της 20/11/2026 11:09:40Z έλεγξε μόνο τα τρία to_regclass. Το plan/fence/generation και τα σχετικά flags χρειάζονται φρέσκια επαλήθευση στον επόμενο προέλεγχο. Ο identifier V3 επιβεβαιώθηκε στην τρέχουσα πηγή.

Το handoff ενημερώθηκε με μη καταστροφική ρητή μετάβαση από αυτό το εγκατεστημένο V3 προς νέο No14 target, του οποίου το όνομα/hash θα προκύψουν από την ανασκόπηση των owners. Η υπόθεση παλιού capture ως source αντικαθίσταται από την πραγματική V3 πηγή για το επόμενο σχέδιο. Παραμένουν οι υπάρχοντες κανόνες αναγνωρισμένης source/target κατάστασης και ομοιόμορφων fences.

Η οριοθετημένη native αποδοχή περιγράφει ακριβές V3/τρεις απόντες πίνακες, stale/mixed fences, μερικό ή αποκλίνον schema, rollback ενδιάμεσης αστοχίας, επανάληψη request και πλήρη target αναγνώριση με αμετάβλητες εμπορικές πηγές. Πρόκειται για επόμενη υλοποίηση/δοκιμή από τους owners Νο 7–9/5 και παραμένει NOT IMPLEMENTED / NOT TESTED.

Το χειροκίνητο backup/restore έχει μετατεθεί για άλλη ημέρα, χωρίς ημερομηνία ή εκτέλεση. Η πηγαία εργασία και οι ανεξάρτητοι απομονωμένοι έλεγχοι Νο 14 συνεχίζονται μέχρι την κοινή τελική συνεδρία. Στο CUA παρατηρήθηκε φόρμα σύνδεσης χωρίς ενεργή εξουσιοδοτημένη συνεδρία. Δεν έγινε προσπάθεια σύνδεσης ή εναλλαγή ρόλου. Η κοινή λειτουργική αποδοχή και η φόρμα Νο 14 παραμένουν NOT TESTED. Ο αμετάβλητος ορισμός 19f6f2ab25445c8f9d84e95333623ea8b6d572a66374ab16604cbbcf4395e15a και οι παλιοί ορισμοί profiles διατηρούνται.

Η παρούσα αλλαγή είναι μόνο τρία υπάρχοντα έγγραφα της ίδιας ανάθεσης. Runtime, lifecycle/installer, schema, permissions και επιχειρησιακά δεδομένα μένουν στην υφιστάμενη κατάσταση. Το συνολικό Νο 14 παραμένει OPEN.
