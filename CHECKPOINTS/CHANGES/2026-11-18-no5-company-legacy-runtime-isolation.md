# Νο5 — Απομόνωση προαιρετικού recovery package και canonical restore ordering

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · ίδιο PR #4007, συνέχεια remote93707bcb. Πλήρης κάλυψη OPEN, καμία παραγωγική μεταβολή.

Το CI44269735183 απέτυχε στην εκκίνηση του ανεξάρτητου wholesale image: η νέα αλυσίδα import προσωπικών δικαιωμάτων φόρτωνε eager τον lifecycle executor, ο οποίος χρειάζεται optional recovery αρχεία που το συγκεκριμένο image δεν περιέχει. Η readiness φορτώνει πλέον executor/worker δυναμικά μόνο μετά από ρητή επιλογή COMPANY profile. Οι τέσσερις παλιές επιλογές/default μένουν αδρανείς χωρίς recovery package ή DB ανάγνωση. Ελλιπές explicit COMPANY package αποτυγχάνει κλειστά ως unavailable. Δεν προστέθηκαν προαιρετικά αρχεία ή δικαιώματα στο wholesale image.

Ξεχωριστή ανασκόπηση βρήκε μη ντετερμινιστική ταξινόμηση catalogue identifiers μεταξύ source locale και C private restore. Το canonical observer χρησιμοποιεί πλέον COLLATE C για text identifiers, διατηρώντας τη σημασιολογική numeric enum/column σειρά. Το native fixture ελέγχει πραγματική binary type ordering μαζί με unused enum drift. Ανανεώθηκαν τα18 δεσμευμένα source hashes. Το protocol doc διευκρινίζει το όριο locale/query-behaviour της ιδιωτικής επαναφοράς.

Προστέθηκε πραγματικό fresh-process minimal-package regression χωρίς ops, executor, worker ή node_modules: αρχικά1PASS. Απαιτούνται οι τελικοί targeted έλεγχοι/νέοCI στο ακριβές source. Η προηγούμενη πλήρης τοπική σουίτα156PASS/5PGSKIP/buildPASS αφορά το93707bcb candidate· δεν αναιρεί το πραγματικό CI packaging FAIL. Δεν έγιναν λογαριασμοί/LAB/deployment. Οι ανθρώπινες δοκιμές παραμένουν στο τέλος.

Συμφιλίωση ολοκληρωμένου CI44269735183: εκτός wholesale startup, τα δύο native installer fixtures απέτυχαν πριν από backup επειδή το setup παρείχε actor χωρίς id· χρησιμοποιούν πλέον την υπάρχουσα γνήσια SA fixture ταυτότητα. Ένα analytics fixture επέστρεφε store για κάθε req.get και έτσι προσποιούνταν και εταιρικό header· διορθώθηκε σε keyed header getter. Κανένα πραγματικό native backup/install PASS δεν προέκυψε σε εκείνο το run. Το AI-wallet recovery44269735243 απέτυχε στο prerequisite PG16 binary, πριν τις δοκιμές· το workflow απέκτησε τον ίδιο περιορισμένο apt fallback που ήδη χρησιμοποιεί το κοινό CI, χωρίς νέα jobs/permissions.

Τελική ευρύτερη εκτέλεση στην παρτίδα των επόμενων τεσσάρων εταιρικών προβολών:163PASS/5nativePGSKIP/0FAIL, client buildPASS, workflowYAML parsePASS. Τα επιμέρους overlap counts δεν αθροίζονται. ΝέοCI απαιτείται στην ακριβή δημοσιευμένη πηγή.
