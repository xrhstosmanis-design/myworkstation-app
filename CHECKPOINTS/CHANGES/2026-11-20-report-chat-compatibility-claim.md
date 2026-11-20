# 7–9 · Προ-source ανάληψη συμβατότητας εγκαταστάτη με υφιστάμενο Chat

ASSIGNED /root, ίδια ανάληψη 7–9 και κεντρικού lifecycle/automatic dispatch. Συνέχεια fix/report-chat-compatibility-20261120, μετά τα #4000/#4021/#4035/#4067. Η ρητή εντολή συνέχισης 20/11 καλύπτει τη διόρθωση του πραγματικού εμποδίου και την ενιαία τελική αποδοχή. Δεν πρόκειται για δεύτερη ανάληψη Chat.

Μετά από γνήσια κεντρική είσοδο και 2FA στις 20/11 περίπου 07:34 UTC, το πραγματικό LAB V2 inspect επέστρεψε 503, όχι 403. Δεν στάλθηκε install POST. Ανεξάρτητος έλεγχος μόνο ανάγνωσης του πραγματικού καταλόγου έναντι main 502862af βρήκε ακριβώς τέσσερις άγνωστους πίνακες, StoreChatGroup, StoreChatGroupMember, StoreChatGroupMessage και StoreChatMutedTopic. Οι στήλες των ήδη γνωστών πινάκων συμφωνούν. Ο κλειστός κατάλογος lifecycle απορρίπτει την πρώτη άγνωστη σχέση και η διαδρομή καλύπτει το μη τυποποιημένο σφάλμα με γενικό 503. Αυτή είναι διάγνωση, όχι επιτυχής εγκατάσταση.

Ακριβές επόμενο source scope μετά το green merge της παρούσας ανάληψης

- Νέο αμετάβλητο reports-only V3 profile, με αμετάβλητα υπάρχοντα BASE/CAPTURE/V1/V2 hashes.
- Ανεξάρτητη ακριβής επαλήθευση τεσσάρων υπαρκτών πινάκων, στηλών, defaults, constraints, indexes, owned FKs και triggers πριν από περιορισμένο source inspection adapter. Άγνωστη απόκλιση παραμένει αποκλεισμένη.
- Target καταγραφή ως διατηρούμενων non-owning operational relations, χωρίς νέους guards ή αλλαγές Chat writers. Οι απαγορεύσεις scoped destructive lifecycle και scoped restore διατηρούνται σε JS/Python. Το κανονικό full database backup παραμένει ανέπαφο.
- Ρητή επιλογή V3 στο υπάρχον installer/UI και ίδιες server-side εξουσιοδοτήσεις, packet/revision/catalogue binding και ατομικό rollback.
- Strict drift tests, αμετάβλητα παλιά profiles, JS/Python parity και native install/data-preservation/rollback έλεγχοι πριν από κανονικό CI/release και πραγματικό LAB.

Συντονισμός αρχείων. Ο βοηθός /root/supplier κατέχει μόνο το νέο automatic-report-chat-compatibility module, immutable JSON και focused tests. Ο /root/daily κατέχει το πρόσθετο native scenario. Ο /root/reports ενσωματώνει profile/executor/installer/UI/Python και parity. Ο /root κρατά τελική ανασκόπηση, release και πραγματική UI ενέργεια. Η υφιστάμενη ανάθεση Νο16 codex/store-chat-photo-read-swipe και CENTRAL-BACKOFFICE-ACCESS-01 Νο5 παραμένουν ανέπαφες. Οι μελλοντικοί τρεις πίνακες Νο14 δεν περιλαμβάνονται.

Κατάσταση BEFORE SOURCE / NOT TESTED. Καμία αλλαγή schema, hosted configuration, grants, emails, stock, οικονομικών ή προηγούμενων αποδεκτών πράξεων. EventConsent παραμένει απόν, fence generation 0 στο παλιό plan59ca6571 και delivery slots0 κατά το σημερινό read-only baseline. Η χωριστή αναβολή backup/restore δεν είναι προϋπόθεση 7–9 και δεν δημιουργεί automation ή αλλαγή jobs.

## Παραλαβή πηγής μετά την ανάληψη

Το docs-only #4079 πέρασε CI44696525812 SUCCESS και συγχωνεύτηκε ως e23eaa110b867ccee90c02848dde32244457d71a πριν από οποιαδήποτε source αλλαγή. Η υποψήφια συνέχεια προσθέτει ρητά CAPTURE_REPORTS_ONLY_V3 / MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3, με target plan54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828. Τα παλιά BASE/CAPTURE/V1/V2 hashes παραμένουν ακριβώς ίδια. Οι τέσσερις πίνακες παραμένουν non-owning χωρίς νέους lifecycle guards, η ακριβής metadata evidence δεσμεύεται στο packet και source/target preflight, και οι scoped καταστροφικές πράξεις παραμένουν αποκλεισμένες. Η UI εκθέτει ξεχωριστή επιλογή, διατηρώντας identity/scope/packet ακύρωση και ρητή έγκριση.

Στοχευμένοι διαφορετικοί τοπικοί έλεγχοι25 PASS χωρίς FAIL στις εκτελεσμένες σουίτες. Περιλαμβάνουν12 profile/context,2 mounted UI,1 mounted HTTP authorization/mock με V3 και sanitized409 drift,4 Python worker/restore/cleanup-continuation,2 υφιστάμενους installation-core και4 strict-validator tests με20 πραγματικές απομονωμένες WASM DDL αποκλίσεις. Ο strict κατάλογος συγκρίθηκε μόνο ανάγνωσης με hosted και είχε0 διαφορές. Η πραγματική issueSession/auth σουίτα συνάντησε τοπικό μη generated PrismaClient cache και δεν δηλώνεται επιτυχής· θα εκτελεστεί με τις κανονικές εξαρτήσεις CI. Το πρόσθετο native PostgreSQL transition/data-preservation/atomic-rollback scenario έχει γραφτεί, όχι ακόμη εκτελεστεί με πραγματικό PostgreSQL. Απαιτούνται πλήρες τελικό CI, κανονικό release, αναγκαία μόνο web-profile επιλογή και πραγματική UI αποδοχή. Δεν άλλαξε cron profile ή backup job και δεν εκτελέστηκε backup/restore.

Ο root συντονίζει την αναγκαία αναδέσμευση source provenance του υπάρχοντος No5 company backup package, λόγω των νέων imports. Αυτό δεν δίνει authority εταιρικού manifest στο reports-only V3 και δεν αλλάζει τις συμπεριφορές ή τα company manifest hashes. Παραμένουν εκκρεμή install, event grants/consents και πραγματική παράδοση/history/Message-ID/inbox.
