# Νο5 — Τέσσερις εταιρικές προβολές διαχείρισης

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · συνέχεια Draft PR #4007 από93707bcb. Σύνολο source:53STORE και7COMPANY capabilities, χωρίς παραγωγική ενεργοποίηση.

Προστέθηκαν χωριστές Owner-selected παραχωρήσεις για κατηγορίες εξόδων (CASH_CONTROL), κατηγορίες πελατών, επαγγέλματα και ενεργούς τρόπους αποστολής (CORE). Exact native GETs επιστρέφουν μόνο ασφαλή εταιρικά πεδία/πλήθη, με company predicates και στα joins, live account/session/policy/module και revision πριν/μετά. Διατηρείται η απαγόρευση query/body selectors και μικτού store header. Οι παλιές τρεις παραχωρήσεις παραμένουν ανεξάρτητες, οι4νέες δεν προστίθενται σε κανέναν αυτόματα.

Η εταιρική γέφυρα μπήκε πριν από τα management routers ώστε η προσωπική ανάγνωση να μη δημιουργεί πίνακες/defaults ούτε να αλλάζει mappings. Native Owner ροές συνεχίζουν στους αρχικούς handlers. Η καθαρή read-only παρουσίαση διατηρεί native πεδία/ελληνικές στήλες, με Χρήσεις/Πελάτες, χωρίς editor/sync/bank/POS hooks. Καθυστερημένα και ξένα/malformed αποτελέσματα απορρίπτονται. Δεν άλλαξε schema, installer ή target plan.

Το mandatory πραγματικό native BASE/CAPTURE fixture επεκτάθηκε σε company-only λογαριασμό με7παραχωρήσεις, own/foreign δεδομένα τεσσάρων master tables, ακριβή tenant-safe counts/ISOdates/nullcodes, active-shipping συμπεριφορά, no-write DB proxy, CORE/CASH_CONTROL/licence/revision/session revocation και Owner explicit[] ανάκληση. Παραλείπεται τοπικά χωρίς PostgreSQL· νέοCI απαιτείται.

Τελική τοπική συνδυασμένη εκτέλεση21σχετικών αρχείων, Node24:163PASS/5nativePGSKIP/0FAIL (168σύνολο). Build clientPASS, YAML parsePASS. Ο τοπικός Chromium launcher παραμένει γνωστό ιστορικό FAIL και εξαιρέθηκε ονομαστικά μόνο από τοπική εκτέλεση, όχι από CI. Περιλαμβάνονται και οι διορθώσεις optional recovery import/canonical ordering, οι πραγματικές προηγούμενες CI αποτυχίες και το PG16 prerequisite στο συνοδευτικό checkpoint2026-11-18-no5-company-legacy-runtime-isolation.md.

Πλήρης κάλυψη Owner OPEN: απομένουν επόμενες εταιρικές οικογένειες και τελική paired εγκατάσταση/readback/hosted acceptance. Δεν έγινε live migration/deployment ή νέα δοκιμή λογαριασμών. Οι ανθρώπινες δοκιμές συγκεντρώνονται στο τέλος στο υπάρχον LAB, σύμφωνα με την εντολή χρήστη.
