# Νο5 — Έξι εταιρικές αναφορές audit

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · ίδιο Draft PR #4007. Συνέχεια από remote `83b02754` / local `0d0475c`, ίδιο tree `397e0293902d31ecad5877381824aacd3026f4e1`. Πηγαίος κατάλογος: 59 STORE (41 αναγνώσεις, 18 ενέργειες) και 26 COMPANY δικαιώματα. Η συνολική ανάθεση Owner παραμένει ASSIGNED/OPEN.

## Ανεξάρτητες παραχωρήσεις

| COMPANY δικαίωμα | Εύρος / native όριο | Άδεια |
| --- | --- | --- |
| reports-deactivations.read | Απενεργοποιήσεις με ιστορικό όνομα/SKU, τιμή/stock, flags, αιτία και πρόσωπο/κατάστημα. Έως 10.000 και προειδοποίηση audit-from-activation. | Εταιρική άδεια, χωρίς πρόσθετο module |
| reports-logins.read | Ιστορικό συνδέσεων: ονόματα, email, ρόλοι, συσκευές και IP, έως 10.000. Ρητή περιγραφή αυτών των στοιχείων στο Owner checkbox. Δεν δέχεται storeId. | INVENTORY |
| reports-sale-deletions.read | Kiosk και POS διαγραφές καλαθιού, επιτρεπόμενα item/quantity/price/reason/actor/store πεδία, τελικό παράθυρο 10.000. | Εταιρική άδεια, χωρίς πρόσθετο module |
| reports-pos-sale-actions.read | Ακυρώσεις/επιστροφές και native ενέργειες POS, own sale/original facts και typed scalar αλλαγές τιμών/ποσοτήτων, έως 10.000. | Εταιρική άδεια, χωρίς πρόσθετο module |
| reports-destructions.read | Ο πραγματικά ενεργός POS PRODUCT_DESTRUCTION reader, με ποσότητες, τιμή/κόστος, προμηθευτή και σύνολα, έως 5.000. Δεν συγχωνεύεται με τον shadowed παλιό WASTE handler. | Εταιρική άδεια, χωρίς πρόσθετο module |
| reports-movements.read | Company κινήσεις, signed quantity/IN/OUT, κόστος/τιμή, προϊόν/κατηγορία/κατάστημα/operator, έως 10.000. Δεν ανοίγει γενικό source-object drilldown. | INVENTORY |

Τα τέσσερα native ελεύθερα reports δεν απέκτησαν αυθαίρετο INVENTORY gate. Το null module γίνεται δεκτό μόνο για την ακριβή γνωστή allowlist· άγνωστο/undefined module παραμένει άρνηση. Παραμένουν η πραγματική εταιρική άδεια, ενεργός λογαριασμός/session, ρητή COMPANY policy και επανέλεγχος revision πριν και μετά. STORE δικαιώματα δεν δίνουν εταιρική πρόσβαση.

Οι ακριβείς early GET readers παρακάμπτουν μόνο το γενικό role/DDL bootstrap, χωρίς impersonation. Δεν εκτελούν ensureSchema, writers, provider ή αλλαγή native Owner ροής. Υποχρεωτικά πραγματικά from/to Ελλάδας, bounded q και δηλωμένα owned-store φίλτρα. Όλα τα joins είναι company-scoped. Ξένες αναφορές sale/original/product αποκρύπτονται. Ιστορικό κείμενο ιδιόκτητου συμβάντος διατηρείται, ενώ raw details/cart JSON, session/actor IDs, user-agent ή tokens δεν επιστρέφονται.

Το cart περιορίζεται σε 250 items ανά event και 10.000 matching expanded POS γραμμές πριν από το τελικό merge. Μόνο δηλωμένα numeric πεδία δέχονται ιστορικά decimal strings έως 64 χαρακτήρες, με finite/safe magnitude έλεγχο. Κενά, bool, hex, exponent, Infinity και αυθαίρετα tokens απορρίπτονται. Το πραγματικό 0 παραμένει 0· άγνωστη τιμή ή κόστος παραμένει null και τα άγνωστα σύνολα δεν παρουσιάζονται ως μηδέν.

Η pure UI έχει έξι ανεξάρτητες προβολές, ακριβές DTO/envelope/interval validation, σαφή native windows και PII disclosure, χωρίς γενική reports suite, lookup ή actions. Η αλλαγή χρήστη/API/policy/ημερομηνιών/αναζήτησης κρύβει παλιές απαντήσεις και απορρίπτει καθυστερημένες ή malformed απαντήσεις.

## Τεκμήρια

Το προηγούμενο `83b02754` έχει **main CI44297500073 SUCCESS**, Chat44297500474 SUCCESS και όλα τα jobs πράσινα. Actual BASE723/CAPTURE724 στις 11:47:36/11:48:05 UTC πέρασαν και τις τέσσερις προηγούμενες εταιρικές αναφορές. Security: 6.338 tests, 6.337 PASS / 0 FAIL / 1 SKIP, και επόμενη σουίτα 8/8 PASS. Η προηγούμενη stale προσδοκία του journal διορθώθηκε χωρίς runtime αλλαγή. Αυτό είναι απομονωμένο CI acceptance, όχι παραγωγική εγκατάσταση ή ανθρώπινο PASS.

Τελική συνδυασμένη εκτέλεση **50 σχετικών αρχείων: 256 tests, 244 PASS / 12 native PG-or-Docker SKIP / 0 FAIL**, canonical server directory, concurrency 4, 62,69 δευτερόλεπτα. Client build PASS σε 29,69 δευτερόλεπτα. Οι επικαλυπτόμενοι αριθμοί δεν αθροίζονται.

Προστέθηκε actual native helper και στα BASE/CAPTURE, με πραγματικό Owner company-only policy έξι δικαιωμάτων, χωρίς StoreGrant, πραγματικά JWT/auth/index/DB και own/sibling/foreign/global/NULL/0/cross-reference δεδομένα. Ελέγχει τις τέσσερις ελεύθερες αναφορές με INVENTORY off, τις δύο paid αρνήσεις, εταιρική άδεια off, revision/revoke, απόκρυψη raw JSON και πραγματικό historical cart '2' × '5.00' = 10. Στήλες/defaults/counts ελέγχθηκαν ανεξάρτητα. Η actual εκτέλεση των νέων έξι παραμένει NOT TESTED τοπικά και απαιτεί νέο CI.

## Ακριβής αντιστοίχιση της ιδιωτικής επαναφοράς

Το ξεχωριστό wallet44297500054 απέτυχε. Τα πραγματικά logs επιβεβαίωσαν **source server_version_num=160016**, ενώ postgres/pg_dump/pg_restore/initdb/pg_ctl στον host παρέμεναν **16.15**, ακόμη και μετά το apt, που θεωρούσε το 16.15 νεότερο διαθέσιμο. Η ασφαλής κατηγορία είναι SQLSTATE_22023_PARAMETER_OPERATION_CREATE_TABLE. Το ακριβές άγνωστο όνομα δεν αποκαλύφθηκε. Η απόκλιση εκδόσεων πλέον παρατηρήθηκε, αλλά η επιτυχία με συμβατό target εκκρεμεί.

Το dedicated CI χτίζει επιπλέον private recovery image από το **ίδιο production Dockerfile**, με POSTGRES_IMAGE=postgres:16-alpine. Η πρώτη επαναφορά εκτελεί το ίδιο verify_archive και όλες τις ίδιες full/selective digest και source-control assertions μέσα σε πραγματικό container, χωρίς δίκτυο, με readonly fixture και όρια memory/pids. Ελέγχει πραγματική source version και έκδοση του private postgres: ίδιο major και minor όχι παλαιότερο από την πηγή. Το pure version regression απορρίπτει το 16.15 έναντι 160016, άλλο major, beta/unknown και μη ασφαλή components.

Μετά παραμένει **υποχρεωτική η δεύτερη πραγματική επαναφορά στην παραγωγική PG18 εικόνα** με τα ίδια assertions. Το main CI, χωρίς matching-image flag, διατηρεί την ανεξάρτητη host επαναφορά με την pinned πηγή του. Δεν αγνοήθηκε SQL ή σφάλμα, δεν αφαιρέθηκαν tests και δεν υποβαθμίστηκε η πηγή. Η αλλαγή αφορά μόνο workflow/test backend, όχι εφαρμογή ή restore acceptance. Τα 20 δεσμευμένα αρχεία, τα 140 fixed diagnostics και τα target plans δεν άλλαξαν σε αυτή την παρτίδα. YAML/syntax και οι τοπικοί unit έλεγχοι πέρασαν. Το νέο πραγματικό CI πρέπει να αποδείξει και τις δύο επαναφορές.

Καμία παραγωγική migration, COMPANY activation, merge/deploy ή ανθρώπινη δοκιμή. Τα υπόλοιπα Owner panes παραμένουν OPEN. Μία τελική συγκεντρωτική POS/SuperAdmin/Owner συνεδρία στο ίδιο LAB, χωρίς επανάληψη παλιών οικονομικών/stock PASS.
