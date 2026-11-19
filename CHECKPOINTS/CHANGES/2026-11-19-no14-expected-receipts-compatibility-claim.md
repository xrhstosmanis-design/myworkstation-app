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


## Source candidate — Draft / NOT READY

Claim #4056 merged868feb5d after docsCI44483364041 SUCCESS. The six locked new files are implemented. Pure14/14 PASS,0FAIL,0SKIP. The same native fixture helper executed against actual WASM PostgreSQL:10 catalog mutations detected and6 synthetic rows preserved. Native Prisma/PostgreSQL and full exact CI remain pending. Independent review continues. Schema/data/replay results are separate and mean supplied-evidence matching only; activationReady remains false. Existing lifecycle/installer/worker/profile sources remain unchanged. No hosted DDL, module activation, financial or stock write, manual dispatch, merge or deploy performed for this candidate. OverallNo14 remainsOPEN.
