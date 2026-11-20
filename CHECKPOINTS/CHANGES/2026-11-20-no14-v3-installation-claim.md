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
