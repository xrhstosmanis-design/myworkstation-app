# Νο7 · Stage B πριν-source V4 metadata-only μετάβασης

ASSIGNED /root, retained No7/lifecycle owner. Stage A #4134 merged04aedfec98e8c95fc4897946e15b99a11df58287 μετά full CI44889918217 SUCCESS5/5,7058 server PASS/0 FAIL/4 optional SKIP+8 backup PASS· πραγματικά Prisma native/URL guards χωρίς SKIP. Η ανεξάρτητη Stage A απόδειξη παραμένει SNAPSHOT_ONLY και δεν εξουσιοδοτεί εφαρμογή installer. Η παρούσα νέα ανάληψη δημοσιεύεται πριν από Stage B source και σταματά για root review/green merge.

Σκοπός: νέο ρητό MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4, που προσθέτει την ακριβή security compatibility στο αμετάβλητο V3 hash54ceb. Security table global non-owning preserved, executionDisabled=true. Νέα UI/API επιλογή REPORTS_ONLY_V3_TO_V4 με source V3/54ceb και νέο target hash, όχι παλιά CAPTURE/59ca μετάβαση. Δεν επανεκτελείται capture DDL ή παλιό installCore και δεν εγκαθίστανται νέοι security guards.

Source preflight: Stage A strict metadata πρώτα και trusted projection συνδεδεμένη με ακριβές source manifest/schema. Unknown relations παραμένουν reject. Apply μόνο μέσα στο υπάρχον advisory και EXCLUSIVE NOWAIT παράθυρο όλων των reviewed σχέσεων, με νέα πλήρη source/security/target metadata επαλήθευση πριν από fence planHash-only transition. Διατήρηση generation/flags/security deny state, συμπεριλαμβανομένων νέων revocations πριν το apply. Ο production helper δεν διαβάζει, hashάρει, διαγράφει, μεταφέρει ή resetάρει security rows. Stale/partial/unknown/mixed/raced metadata απορρίπτονται ατομικά. Preflight δεν δηλώνεται lease.

Ακριβής No7 source/runtime αρμοδιότητα μετά merged claim

- Νέα server/src/services/automatic-report-security-transition.js και ops/backup/lifecycle/report-security-profile.proposed.json, εφόσον απαιτούνται για την versioned metadata composition. Παλιό frozen Stage A JSON/hash ανέπαφο.
- server/src/services/automatic-report-operational-profile.js, store-lifecycle-manifest.js, store-lifecycle-executor.js, automatic-report-event-installation.js και automatic-report-event-schema.js. Μόνο αναγκαία ρητά V4 hooks/assertions/source-target admission, χωρίς γενικό χαλάρωμα.
- server/src/routes/automatic-report-event-installation.js και client/src/components/platform/ReportEventInstallationManager.jsx, report-event-installation-context.mjs. Ίδια γνήσια central auth/session και exact request/packet binding, νέα ρητή επιλογή/χωριστή επιβεβαίωση, scope/identity/stale invalidation.
- server/test/report-operational-profile.test.js, automatic-report-event-installation.test.js, automatic-report-event-installation-routes.test.js, report-event-installation-context.test.js, report-event-installation-ui.test.js και νέο automatic-report-security-transition-postgres.test.js. Old hash invariance, πραγματική atomic transition/rollback/locks/revocation preservation και αρνητικά partial/unknown/stale/mixed/foreign fixtures.

Ρητός αναγκαίος συντονισμός No5 dependency closure, όχι runtime policy ανάληψη

- ops/backup/lifecycle/worker.py και test_worker_reports_only.py: μόνο νέο selector/parity, με scoped destructive operations OFF και ίδια υπάρχουσα worker activation.
- ops/backup/Dockerfile: μόνο COPY για νέα πραγματικά imports.
- ops/backup/lifecycle/backoffice-company-compatibility.proposed.json, backoffice_company_readiness.py και server/src/services/backoffice-company-compatibility.js: μόνο computed sourceHashes/sourcePaths/sourceCount της αναγκαίας νέας closure.
- server/test/backoffice-company-backup-package.test.js και backoffice-company-compatibility.test.js: ακριβής packaging/parity proof για αυτή τη closure. Όλα τα τρία COMPANY plan hashes/profiles/authority και υπάρχοντες guards/activation διατηρούνται. Δεν είναι ανάληψη των υπόλοιπων No5 λειτουργιών.

Κατανομή: /root/reports runtime/profile/manifest/executor/installer/UI/context/versioned JSON και docs· /root/daily μόνο νέο native test· /root/supplier Python parity/Docker/computed closure και τα δύο existing package parity tests. Root τελική ανασκόπηση/συγχρονισμός. Κανείς δεν αλλάζει No14 αρχεία.

Ρητά εκτός: No14 V1 profile/definition19f6/target75dd/installer/route/UI, άλλοι owners/security writers/Chat συμπεριφορά, default switch, environment, hosted apply/DDL, provider/mail ή οικονομική/stock πράξη και backup/restore. Ο παλιός No14 V1 installer δεν γίνεται συμβατός από μόνο του· retained No14 owner χρειάζεται χωριστό V2 claim. Stage B BEFORE SOURCE / NOT TESTED. Πρώτα root-approved green claim merge, μετά isolated tests/full CI/source review. Η παρούσα ανάληψη δεν εγκρίνει παραγωγική μετάβαση.
