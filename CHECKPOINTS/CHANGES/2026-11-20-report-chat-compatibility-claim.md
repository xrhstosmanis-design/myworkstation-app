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
