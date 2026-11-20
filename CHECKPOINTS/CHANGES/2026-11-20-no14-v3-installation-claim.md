# Νο 14 — Ρητή μη καταστροφική εγκατάσταση από V3 / BEFORE SOURCE

20/11/2026 ώρα Ελλάδας. Owner /root της σελίδας 13–14, runtime βοηθός /root/suppliers, νέοι έλεγχοι/fixtures /root/cost και ανεξάρτητη ανασκόπηση /root/batch_review. Το παρόν καταγράφει πριν από κώδικα το νέο υποσύστημα εγκατάστασης, με συγκεκριμένα shared hooks και αναγκαία source-provenance ενημέρωση.

## Υπάρχουσα απόδειξη και συντονισμός

Το #4053 περιλαμβάνει την πηγή αναμενόμενων παραλαβών. Το #4057/361193e6 περιλαμβάνει το πρόσθετο αμετάβλητο compatibility contract, με PR CI 44486238567 και main CI 44488040952 SUCCESS. Το source main αυτής της ανάληψης είναι ac928ebc08e7b64d9a29577ca9c7af0aff2c6c78. Αναγνώστηκαν τα τρέχοντα AGENTS.md, COMMON_WORK_RULE.md και ACTIVE_WORK. Η πλήρης ανασκόπηση του authoritative tracker έγινε στο αμετάβλητο blob 84382675b117a7273dbc229e0e73eb4683066f16. Οι παλιές αναθέσεις προτάσεων, lifecycle/installer Νο 7–9 και Νο 5 διατηρούνται εκτός των ακριβών hooks αυτής της αναγκαίας ενσωμάτωσης.

Η hosted read-only SQL της 20/11/2026 11:09:40Z εξέτασε μόνο τα τρία to_regclass Νο 14, όλα NULL. Το τελευταίο κοινό τεκμήριο εγκατάστασης Νο 7 καταγράφει source profile MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3 και plan/fence hash 54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828. Αυτά χρειάζονται φρέσκια επιβεβαίωση από τον νέο προέλεγχο. Ο αμετάβλητος ορισμός Νο 14 παραμένει 19f6f2ab25445c8f9d84e95333623ea8b6d572a66374ab16604cbbcf4395e15a.

Ο έλεγχος εξαρτήσεων Νο 7 επιβεβαίωσε ότι η διαχείριση/email admission χρησιμοποιεί generation και flags. Το global environment παραμένει V2 και οι αναφορές πρέπει να συνεχίσουν να λειτουργούν μετά τη νέα explicit target μετάβαση, με ίδιο generation. Ο Python reports-only worker επιστρέφει disabled πριν από πρόσβαση DB. Αυτές οι διαδρομές παρέχουν υποχρεωτικά regressions, με ίδια πολιτική συμπεριφοράς.

## Συμβόλαιο νέας υλοποίησης

Η νέα factory επιλέγει μόνο με ρητό selector το MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_NO14_V1. Το global environment διατηρεί την υπάρχουσα τιμή. Τα παλιά BASE/CAPTURE/V1/V2/V3 profiles, οι τρεις COMPANY manifest/plan hashes και οι υπάρχοντες αλγόριθμοι/guards παραμένουν αυτούσιοι. Το νέο target έχει executionDisabled=true. Το hash του θα παραχθεί από τον πραγματικό νέο ορισμό και θα ανασκοπηθεί μετά την υλοποίηση.

Η εγκατάσταση απαιτεί επιλεγμένο κατάστημα ήδη εγγεγραμμένο στο ακριβές V3 και καθολικά ομοιόμορφα σχετικά V3 fences. Δεν προσθέτει εγγραφή καταστήματος ή νέο fence. Στη μία συναλλαγή επιτρέπεται μόνο δημιουργία των τριών νέων πινάκων Νο 14 και των δικών τους ακριβών PK/FK/check/index, μαζί με την αναγκαία atomic μετάβαση fence planHash. Το πλήθος fences, generation, flags και υφιστάμενο catalog/guard/control state διατηρούνται. Οι τρεις νέοι πίνακες ολοκληρώνονται κενοί.

Μετά το νέο DDL και την αλλαγή planHash καλείται μόνο targetCore.inspectInTransaction. Η targetCore.installInTransaction επανεγγράφει παλιούς guard triggers και εξαιρείται από το νέο path. Native before/after catalog και fingerprints θα αποδείξουν τη διατήρηση παλιών tables, triggers, stock, οικονομικών εγγραφών και λοιπών controls. Μερική/αποκλίνουσα εγκατάσταση, mixed fences ή αστοχία τελικού inspect ακυρώνουν όλη τη συναλλαγή.

Ο executor αποκτά μόνο ρητό marker του νέου No14 profile και strict adapter για τον αμετάβλητο ορισμό. Η παλιά assertReportOperationalProfile ελέγχει την αντίστοιχη παλιά προβολή. Το raw knownTables/reviewedColumns descriptor περιλαμβάνει τους τρεις νέους πίνακες με τα ακριβή στοιχεία τους. Το source compatibility ή οι proxy διαδρομές Νο 7 διατηρούνται.

## Admission, επιβεβαίωση και αμφίσημη απόκριση

Τα νέα GET inspect και POST install επαναχρησιμοποιούν την ακριβή privileged auth/session/channel admission του εγκαταστάτη Νο 7. OWNER, MANAGER, staff ή scoped/store-support token που απορρίπτονται σήμερα θα απορρίπτονται και εδώ. Η πραγματική session authority επανελέγχεται στη συναλλαγή. Ένα role flag στην οθόνη δεν δίνει πρόσβαση σε global εγκατάσταση.

Το panel εμφανίζεται μόνο μετά από εξουσιοδοτημένο capability GET. Περιγράφει ρητά κοινό service/shared schema DDL, με κεντρική προέλευση και ρητή επιβεβαίωση του νέου packet. Η ενέργεια δεν περιγράφεται ως LAB-only αλλαγή schema.

Η επανάληψη είναι ασφαλής declarative αναγνώριση κατάστασης. Δεν προστίθεται τέταρτος πίνακας ή durable receipt/audit writer. Με νέα έγκυρη authority/session/scope, το ίδιο αρχικό source packet μπορεί να επιστρέψει alreadyInstalled μόνο όταν ακριβές πραγματικό target, ομοιόμορφα fences και η ίδια constructor source/target/revision ταυτότητα επαληθεύονται. Η ίδια περίπτωση αφήνει DDL και fence state αμετάβλητα. Αλλαγή sourceRevision απαιτεί ρητό νέο έλεγχο.

Με αμφίσημη POST απόκριση η UI κρατά το ίδιο packet και επιτρέπει μόνο ρητό GET inspect ή επανάληψη από τον χρήστη. Δεν εκτελεί αυτόματο νέο POST ούτε αλλάζει σιωπηρά την ταυτότητα αιτήματος. Η παλιά συμπεριφορά packet του Νο 7 διατηρείται στο δικό της path.

## Ακριβή νέα αρχεία

- server/src/services/supplier-expected-receipts-lifecycle-profile.js
- server/src/services/supplier-expected-receipts-lifecycle-inspection.js
- server/src/services/supplier-expected-receipts-installation.js
- server/src/routes/supplier-expected-receipts-installation.js
- server/scripts/sql/supplier-expected-receipts-installation.sql
- client/src/components/commerce/ExpectedReceiptInstallationPanel.jsx
- server/test/supplier-expected-receipts-installation.test.js
- server/test/supplier-expected-receipts-installation-postgres.test.js
- server/test/supplier-expected-receipts-installation-ui.test.js

## Ακριβή hooks υπαρχόντων αρχείων

- server/src/services/store-lifecycle-manifest.js — μόνο explicit factory/selector του νέου No14 profile.
- server/src/services/store-lifecycle-executor.js — μόνο ο νέος profile marker/descriptor και κλήση του νέου strict No14 inspection adapter, με αμετάβλητη παλιά διαδρομή.
- server/src/index.js — μόνο εξουσιοδοτημένη registration του νέου router.
- client/src/components/commerce/ExpectedReceiptsPanel.jsx — μόνο το own UI hook που ζητά την ίδια εγκεκριμένη capability πριν εμφανίσει installer.

Η ανασκόπηση διαπίστωσε ότι manifest/executor ανήκουν στα 49 καταγεγραμμένα source pins της Νο 5 provenance closure. Η ακόλουθη περιορισμένη ενημέρωση είναι αναγκαία για ακριβή byte provenance των νέων transitive imports. Δεν μεταφέρει τις λειτουργίες Νο 5 σε άλλη σελίδα.

- ops/backup/lifecycle/backoffice-company-compatibility.proposed.json — μόνο sourceHashes.
- server/src/services/backoffice-company-compatibility.js — μόνο exact sourcePaths και το αντίστοιχο ακριβές πλήθος.
- ops/backup/Dockerfile — μόνο COPY των νέων pinned JS με τις σωστές σχετικές διαδρομές.
- server/test/backoffice-company-compatibility.test.js — ακριβής closure/count και διατήρηση παλιών manifest/plan hashes.
- server/test/backoffice-company-backup-package.test.js — counts και πραγματικός έλεγχος relocated bytes.

Το νέο πλήθος pins θα προκύψει από τα πραγματικά νέα transitive imports profile/inspection και των δύο υφιστάμενων No14 compatibility modules. Δεν προδιαγράφεται αριθμός 49→Ν πριν από αυτή την αναγωγή. Installer/router μένουν έξω από τη shared closure εφόσον δεν εισάγονται από τα shared modules. Δεν αλλάζουν COMPANY algorithms, guards, activation, οι τρεις manifest/plan ορισμοί, ο Python worker ή τα current capture JSON. Μελλοντική συμφιλίωση θα διατηρήσει και τη χωριστή ενημέρωση Table-route pin της άλλης σελίδας Νο 15/#4051.

Το ίδιο νέο checkpoint, η υπάρχουσα εγγραφή Νο 14 της ACTIVE και το own handoff docs/testing/no14-expected-receipts-compatibility-handoff.md καλύπτουν τεχνική καταγραφή της παρτίδας.

## Απομονωμένη αποδοχή πριν από κοινό LAB

Η νέα native δοκιμή θα επαναχρησιμοποιήσει το υφιστάμενο No7 native V3 fixture helper χωρίς αλλαγή του παλιού fixture. Καλύπτει πραγματική V3 source εγκατάσταση, πλήρη μετάβαση στο No14 target, global uniform fences, ίδιο generation/count, ακριβείς τρεις κενούς πίνακες και αμετάβλητο παλιό catalog/control/guard state.

Προστίθενται αρνητικά σενάρια για παλιό capture αντί V3, μη εγγεγραμμένο κατάστημα, λάθος plan/revision/scope/actor/session, mixed fences, μερικούς ή αποκλίνοντες πίνακες, UNLOGGED operation journal, αποτυχία μετά το πρώτο DDL ή το target inspect, και σωστό rollback. Αμφίσημη απόκριση και ρητή επανάληψη του ίδιου packet πρέπει να καταλήγουν σε έγκυρη ήδη εγκατεστημένη κατάσταση με μηδενική πρόσθετη μεταβολή. Native No7 email/management admission με το παλιό V2 environment παραμένει επιτυχές μετά τη νέα target μετάβαση. Ελέγχονται και τα ακριβή παλιά No7 packet semantics.

Pure/UI tests εξετάζουν capability admission, αρνητικούς ρόλους/tokens, σαφές global schema scope, ρητή επιβεβαίωση και διατήρηση packet μετά από αμφίσημο POST. Οι No5 compatibility και actual backup package έλεγχοι επαληθεύουν ακριβή transitive closure, relocated source bytes και bit-identical παλιά hashes.

Τοπικά είναι διαθέσιμα user-owned Node 20.20.0 και native PostgreSQL 16.16. Η δοκιμή υποδομής δημιούργησε μόνο νέα loopback no14_installer_test βάση, επαλήθευσε version/διεύθυνση/τρεις απόντες πίνακες και σταμάτησε καθαρά. Το source της εφαρμογής παραμένει ανέπαφο μέχρι πράσινο CI και δημοσίευση αυτής της ανάληψης στο main.

Μία συγκεντρωμένη source δέσμη ακολουθεί μετά το claim. Η παρούσα παρτίδα δεν εξουσιοδοτεί hosted εφαρμογή schema, αλλαγή environment/permissions, αποστολή report, επιχειρησιακή εγγραφή ή activation. Το backup/restore έχει μετατεθεί για άλλη ημέρα, χωρίς ημερομηνία ή εκτέλεση. Η κοινή λειτουργική αποδοχή συγκεντρώνεται στο τέλος ανά ρόλο. Συνολικό Νο 14 OPEN, νέα υλοποίηση NOT IMPLEMENTED / NOT TESTED.


## BEFORE-SOURCE προσθήκη ακριβούς metadata path — 20/11/2026

Η πραγματική εκτέλεση του relocated COMPANY package απέτυχε στο backoffice_company_readiness.verify_current_sources: η ανεξάρτητη SOURCE_PATHS tuple περιέχει ακόμη 49 διαδρομές, ενώ τα πραγματικά νέα shared imports απαιτούν 53. Οι τέσσερις πρόσθετες διαδρομές είναι supplier-expected-receipts-lifecycle-profile.js, supplier-expected-receipts-lifecycle-inspection.js, supplier-expected-receipts-compatibility-definition.js και supplier-expected-receipts-compatibility.js, όλες στο server/src/services/. Installer/router δεν ανήκουν στη shared closure.

Προστίθεται ως έκτο περιορισμένο No5 provenance path το ops/backup/lifecycle/backoffice_company_readiness.py, αποκλειστικά η SOURCE_PATHS tuple με αυτές τις τέσσερις ακριβείς εξαρτήσεις. Το ήδη δηλωμένο sourceHashes packet ενημερώνει και το πραγματικό hash αυτού του Python αρχείου. Δεν αλλάζουν αλγόριθμοι, guard/security συμπεριφορά, worker.py, activation, παλιά profiles, οι τρεις COMPANY hashes ή current-capture JSON. Η Python αλλαγή παραμένει ανέπαφη μέχρι πράσινο docs CI και δημοσίευση αυτής της προσθήκης στο main.

Ξεχωριστό μερικό τοπικό τεκμήριο: Node 20.20.0/native PostgreSQL 16.16 εκτέλεσε πραγματικό V3→No14 transition, preservation παλιού catalog/guard/rows και generation, δύο rollback fault points και zero-write current-target reconciliation επιτυχώς. Οι νέοι pure/mounted έλεγχοι πέρασαν. Αυτό δεν κλείνει το αποτυχημένο package test ούτε αποτελεί hosted εφαρμογή ή κοινή LAB αποδοχή. Το source WIP διατηρείται μόνο τοπικά στο commit f2498ae492fcc6e251546933cdf558db3ef9f5cf. Η δημόσια δημοσίευση του source απορρίφθηκε από τον αυτόματο έλεγχο έγκρισης και αναμένει ρητή έγκριση δημόσιας κοινοποίησης· δεν υπάρχει source Draft PR. Η παρούσα προσθήκη αλλάζει μόνο δύο docs και προηγείται της αλλαγής Python metadata.


## Πηγαία συνέχεια μετά το merged claim — Draft / NOT READY

Το claim #4089 δημοσιεύτηκε ως 200293e12eba01c32a3252c05dbee55134fad65b μετά SUCCESS docs CI44748498901. Υλοποιήθηκαν τα έξι νέα runtime/UI αρχεία και τα τέσσερα ακριβή hooks. Το V3 raw plan hash παραμένει 54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828. Το νέο target είναι 75ddba0584cc6a256bd0d97b6d4b8ad466229061da7329f72c07a068acc49183.

Η πρώτη πραγματική Node20/native PostgreSQL16 μετάβαση πέρασε: ίδιο generation και fence count, τρεις κενοί νέοι πίνακες, αμετάβλητα παλιά rows εκτός fence planHash, αμετάβλητο παλιό catalog/functions/triggers και επιτυχής read-only target reconciliation. Ο πραγματικός No7 lock boundary και το V2 event readiness παρέμειναν αμετάβλητα. Τα πρόσθετα αρνητικά/rollback/HTTP/mounted UI tests και τα No5 provenance/package checks συνεχίζονται· full CI και τελική ανασκόπηση εκκρεμούν.

Το νέο UI χρειάζεται την ίδια εξουσιοδοτημένη Super Admin capability. Επειδή το παλιό own GET επιστρέφει 503 πριν εγκατασταθεί το schema, προστέθηκε μόνο στο νέο router alias με ακριβές storeId και server-derived companyId μετά το privileged session gate. Δεν χρησιμοποιείται default εταιρεία ή διεύρυνση admission. Η εφαρμογή χρησιμοποιεί το υπάρχον AUTOMATIC_REPORT_EVENT_INSTALL_ENABLED gate χωρίς νέα ρύθμιση ή αλλαγή τιμής environment.

Δεν εκτελέστηκε hosted DDL, νέο enrollment, παλιό guard DDL, environment/grant αλλαγή, report αποστολή, backup/restore ή εμπορική πράξη. Συνολικό Νο14 και hosted εγκατάσταση/λειτουργική αποδοχή OPEN.


### Πρόωρο durable source checkpoint / NOT READY

Η διευρυμένη πραγματική native δοκιμή πέρασε επιπλέον rollback δεύτερου CREATE και τελικού inspect μετά τη μετάβαση fences, session/scope/stale-control αρνήσεις και μηδενικές πρόσθετες εγγραφές σε target reconciliation. Οι αρχικοί pure/mounted έλεγχοι πέρασαν. Ο πραγματικός No5 relocated package έλεγχος εντόπισε συμπληρωματικό metadata εμπόδιο: ο JS source closure είναι 53 αρχεία ενώ το ανεξάρτητο Python SOURCE_PATHS tuple αναμένει 49. Το Python αρχείο δεν άλλαξε. Η συμπληρωματική docs-only ανάληψη #4091 δημοσιεύτηκε ως 688026a μετά CI44751858924 SUCCESS, επιτρέποντας πλέον μόνο τα τέσσερα tuple paths/αντίστοιχα self-hash pins. Το παρόν durable Draft είναι NOT READY με γνωστή package αστοχία και pending scope amendment. Δεν παρακάμφθηκε κανένας έλεγχος.


## Τελική ιδιωτική τοπική επαλήθευση — 20/11/2026

Η docs-only συμπληρωματική ανάληψη #4091 δημοσιεύτηκε ως 688026a6bc8608af9117dce08082ae88cfeef8f1 μετά CI44751858924 SUCCESS. Ενσωματώθηκε το δημόσιο main τοπικά, με ακέραιη τη Νο15 πηγή και το νεότερο Table-route pin. Η ανεξάρτητη Python SOURCE_PATHS tuple προσθέτει μόνο τα τέσσερα πραγματικά No14 shared dependencies και το provenance packet καταγράφει το αντίστοιχο νέο Python hash. Όλα τα 53 source pins και τα παλιά COMPANY manifest hashes επαληθεύτηκαν. Η προηγούμενη package αστοχία 53/49 διορθώθηκε χωρίς χαλάρωση ελέγχου.

Πραγματική συνδυασμένη Node20.20.0 / native PostgreSQL16.16 εκτέλεση: 20 tests,19 PASS,0 FAIL,1 SKIP σε12,37s. Πέρασαν το νέο native V3→No14 fixture, pure/HTTP/mounted UI, No5 native και πραγματικό relocated53-file package. Μόνο το actual production recovery Docker image test παραλείφθηκε επειδή το image δεν είναι διαθέσιμο τοπικά. Το νέο integrated native test περιλαμβάνει δύο enrolled stores, ίδιο generation/count, uniform μετάβαση, τρεις κενούς πίνακες, αμετάβλητα παλιά catalog/functions/triggers/εμπορικές γραμμές, τρία rollback στάδια, αρνήσεις scope/session/stale/mixed/partial/unknown/UNLOGGED, παλιά No7 packet semantics και V2 admission. Δεν μετατρέπουμε τα υποσενάρια σε πρόσθετο αριθμό tests. Η PostgreSQL ξεκίνησε σε νέο loopback test database και σταμάτησε καθαρά.

Το UI διατηρεί το αρχικό packet μετά από αμφίσημη απόκριση, δεν εγκλωβίζεται μετά από αλλαγή καταστήματος και αρνείται νέα υποβολή με αλλαγμένη actor/scope/revision/plan ταυτότητα. Με απενεργοποιημένο το υπάρχον installation flag, inspect παραμένει διαθέσιμο και eligible=false, ενώ POST απενεργοποιείται. Ρητό GET που επαληθεύει το ίδιο πλήρες context/enrollments και πραγματικό target μπορεί να συμφιλιώσει το αποθηκευμένο packet χωρίς POST. Επίσημο Node20 production frontend build και TABLE_SERVICE bundle check PASS.

Δημόσια δημοσίευση της νέας πηγής δεν πραγματοποιήθηκε: automatic approval review απέρριψε το git push λόγω μη ρητής άδειας δημόσιας κοινοποίησης νέου κώδικα. Δεν έγινε retry ή εναλλακτικό upload. Η υλοποίηση και το ιδιωτικό patch παραμένουν τοπικά για ανασκόπηση πριν από τυχόν ρητή άδεια. Full remote CI της ιδιωτικής πηγής και το πραγματικό production-image test παραμένουν εκκρεμή. Καμία hosted DDL, env/grant μεταβολή, report αποστολή, backup/restore ή επιχειρησιακή πράξη. Συνολικό Νο14 και κοινή λειτουργική αποδοχή OPEN.

Τελικός έλεγχος μετά την τοπική ενσωμάτωση main και τις τελευταίες UI αλλαγές: επίσημο Node20 npm run build PASS (13,93s), TABLE_SERVICE bundle check PASS και έξι υπάρχοντες production-safety source invariant έλεγχοι PASS. Το git diff --check πέρασε. Αρχικές ελλείψεις sparse paths αντιμετωπίστηκαν μόνο με ανάγνωση των υφιστάμενων δημόσιων αρχείων· δεν άλλαξε υφιστάμενος invariant έλεγχος.


## Δημόσια έγκριση, πραγματικό CI και στενή UI διόρθωση — 20/11/2026

Ο ιδιοκτήτης ενέκρινε ρητά τη δημοσίευση του συγκεκριμένου ιδιωτικά παραδομένου patch στο ήδη δημόσιο repository. Draft #4105 δημοσιεύτηκε αρχικά f4e1c0fb057d08f166237a5770b1a82667623ed9 με tree199bc254d8875729003fee90ae2fa49b21358301 ίσο με το ελεγμένο a3cb. Με καθαρή ενσωμάτωση main613894fa, τελικό head670252f16e293abd2aadd757a13e138d8bce9dfc/tree411ee6c1d8133ce76dead8dddd48b25aa0bfc257. Ανεξάρτητη ανασκόπηση:22ακριβή paths, δικές μας non-doc πηγές αμετάβλητες, καμία χαμένη peer αλλαγή,53pins/παλιάCOMPANYhashes/No15pin διατηρημένα.

Native-full-schema44785031504 SUCCESS. MainPRCI44785031440: τέσσερα άλλα jobs SUCCESS μαζί με wholesale Chromium, αλλά build-and-test FAIL. Πραγματικά server logs:6980tests/6975PASS/1FAIL/4optionalSKIP. Μοναδική αποτυχία supplier-expected-receipts-ui.test.js:8, TypeError reading installed στο νέο ExpectedReceiptInstallationPanel. Η παλιά fixture απαντά με generic receipt report σε κάθε GET, άρα ο installer έθετε inspection χωρίς packet πριν προσπελάσει installed. Δεν πρόκειται για υποδομική αποτυχία και δεν επανεκκινείται το ίδιο αποτυχημένο source.

Διορθώνεται μόνο το own panel: το initial, explicit refresh και post-install inspection ελέγχονται πριν από οποιοδήποτε state update/clear. Απαιτούνται boolean eligibility/installed, μη κενά context strings και enrollments array. Invalid initial response δεν εμφανίζει installer controls· invalid refresh/verification διατηρεί το αρχικό pending packet και εμφανίζει σφάλμα, χωρίς αυτόματο POST ή default packet. Το έγκυρο eligible=false παραμένει read-only, ώστε να διατηρείται η υπάρχουσα GET reconciliation με flag OFF. Προστίθενται στην own mounted UI δοκιμή malformed initial/refresh/post-verification περιπτώσεις και έλεγχος μηδενικού πρόσθετου POST. Η υπάρχουσα supplier-expected-receipts-ui.test.js παραμένει αμετάβλητη ως πραγματικό regression control.

Η επιλεγμένη τοπική εκτέλεση απέτυχε να ξεκινήσει (executor provisioning failure). Δεν δηλώνεται τοπικό PASS της νέας διόρθωσης. Η ανασκόπηση κώδικα και νέα exacthead CI εκτέλεση γίνονται μέσω της συνδεδεμένης GitHub πρόσβασης. Η κοινή MD ενημέρωση αναμένει λειτουργικό περιβάλλον για τον προβλεπόμενο shared-file writeback· το παρόν checkpoint διατηρεί ακριβώς τη νέα τεχνική κατάσταση. Δεν έγινε merge/deploy/hostedDDL, email/env/grant ή επιχειρησιακή μεταβολή. Overall13–14OPEN.
