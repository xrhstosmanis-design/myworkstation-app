# Νο7 · Stage A πριν-source κλειστής security συμβατότητας

ASSIGNED /root, retained reports/lifecycle owner. Το StoreChatAccessRevocation security table είναι άγνωστο στον αυστηρό V3 κατάλογο και εμποδίζει το No14 installer. Αυτή η ανάληψη είναι αποκλειστικά προετοιμασία ανεξάρτητου compatibility primitive, όχι αλλαγή του installer ή εξουσιοδότηση hosted εφαρμογής.

Επαληθευμένη source DDL: source blob58452c8264dd7c7dbf0e6ed683a1e3fa8f0bd72b, server/src/chat-access.mjs γραμμές2–5. Live metadata συμφωνεί: τρεις ordered TEXT NOT NULL στήλες companyId/storeId/userId, χωρίς default/identity/generated, composite PK ίδιας σειράς και μόνο μοναδικό btree PK index. Μηδέν FKs και στις δύο κατευθύνσεις, user triggers, inheritance, RLS/forced RLS/policies, rules ή dropped columns. ACL/reloptions null, replica identity default, ordinary permanent table, owner ίδιος με Store. Τα rows είναι deny-state ασφαλείας και διατηρούνται όλα, σε κάθε εταιρεία/κατάστημα.

Μετά από root review και green claim merge επιτρέπονται μόνο νέα αρχεία

- ops/backup/lifecycle/report-security-compatibility.proposed.json: frozen closed definition/metadata semantics.
- server/src/services/automatic-report-security-compatibility.js: ανεξάρτητος strict read-only validator και ρητή standalone projection, χωρίς εγκατάσταση, DDL/DML ή production registration.
- server/test/automatic-report-security-compatibility.test.js και server/test/automatic-report-security-compatibility-postgres.test.js: ακριβές canonical schema, deny-row διατήρηση πολλών tenants, unknown/partial/drift/default/index/FK/trigger/owner/RLS άρνηση και standalone projection proof. Άγνωστες σχέσεις παραμένουν απορριπτέες· δεν υπάρχει γενικό filtering unknown metadata.

Δεν αλλάζουν ούτε εισάγουν τον helper shared manifest/executor/index/worker/Docker, άρα δεν επεκτείνεται No5 source closure σε αυτό το στάδιο. Τα παλιά profiles/V3 hash54ceb, No14 definition19f6/target75dd, V1 installer/route/UI και guards παραμένουν byte-identical. Η standalone projection δεν αλλάζει το default ή το ενεργό profile και δεν εγκαθίσταται σε hosted σύστημα.

Η πραγματική ενσωμάτωση θα χρειαστεί χωριστή ρητή versioned No14 V2 ανάληψη από τον retained No14 owner, με ακριβή source/target proof και νέα installer διαδρομή. Δεν λαμβάνεται σιωπηρά αυτή η αρμοδιότητα. Stage A BEFORE SOURCE / NOT TESTED. Καμία νέα email αποστολή, οικονομική/stock πράξη, security write ή backup/restore. Το παρόν docs PR σταματά πριν merge για root ανασκόπηση.
