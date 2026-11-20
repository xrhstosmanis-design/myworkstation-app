# Νο5 — Χωριστές προβολές ρυθμίσεων προσωπικού καταστήματος

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · συνέχεια στο ίδιο Draft PR #4007 από remote22f8fffc / local885e3af, ίδιο tree708eeb3263fc0291ec20ee1632dcf8e6c729d511. Η συνολική κάλυψη παραμένει ASSIGNED/OPEN, όχι ολοκληρωμένη παραχώρηση όλων των Owner λειτουργιών.

## Προηγούμενη ακριβής έκδοση

Στο22f8fffc το Chat44288330990 πέρασε. Το κύριοCI44288331027 απέτυχε μόνο στον global Greek time policy: CompanyBusinessReadView date formatting έλειπε hour12:false. Τα actual nativeBASE/CAPTURE πλήρη backup/privateRestore/consume/install πέρασαν στις10:48:01/10:48:24UTC, μαζί με όλη τη δεκαπενταμελή COMPANY Owner policy, tenant/module/joins/counts/recipe-cost/παράθυρα/parent dependency/revision/revoke/session assertions. Το πραγματικό native15PASS δεν εξισώνεται με ολόκληρο πράσινοCI ή παραγωγική εγκατάσταση. Η συγκεκριμένη μορφοποίηση ώρας διορθώνεται στην παρούσα παρτίδα χωρίς αλλαγή δεδομένων.

Το ανεξάρτητοwallet44288331019 παραμένειFAIL στο hostprivatepg_restore πρινDocker, categoryUNKNOWN ακόμη και με20κατηγορίες· τα εργαλεία αποδείχθηκαν16.15. Δεν παρουσιάζεται ως λυμένο ή ως major mismatch. Προστίθεται αυστηρά επιτρεπόμενη διάγνωση από φρέσκο, bounded private log SQLSTATE και γνωστές file/resource κατηγορίες, χωρίς rawstderr/log/SQL/PII/secrets ή χαλάρωση restore acceptance. Αλλαγές δεσμευμένων20-source αρχείων απαιτούν ανανέωση packet hashes.

## Νέο περιορισμένο εύρος

Τέσσερις ανεξάρτητες STORE παραχωρήσεις: workforce-roles.read μόνο ρόλοι που αναφέρονται σε ορατούς εργαζομένους/πρότυπα του καταστήματος με τοπικά πλήθη· workforce-rules.read μόνο ορατοί εργαζόμενοι, typed rule values και απόκρυψη related εκτός scope· shift-templates.read μόνο πρότυπα και counts αναθέσεων του καταστήματος με redaction ξένου requiredRole· workforce-audit.read μόνο100πρόσφατα περιγραφικά συμβάντα με scoped namejoins, χωρίς πριν/μετά JSON/credentials. BASIC απαιτείται γιαρόλους/πρότυπα/audit, PRO γιακανόνες. Το πλήρες εταιρικό μητρώο ρόλων και οι αλλαγές/διαχείριση παραμένουνOPEN.

Ο κατάλογος έχει57STOREkeys=39reads+18actions, όλα ακριβώς μία φορά στις επιλογές, χωρίς αυτόματα grants ή profile ceilings. Οι15COMPANYkeys δεν αλλάζουν. Exact GET allowlist, εταιρεία/κατάστημα/header, query/body άρνηση, πραγματική άδεια/module/account/session/παραχώρηση και revision πριν/μετά· καμία broad workforce/bootstrap/DDL/native management mutation. Owner native path διατηρείται.

Η UI χρησιμοποιεί μία ακριβή ανάγνωση ανά δικαίωμα, αυστηρό DTO/envelope και clear/late-response suppression για αλλαγή store/account/API/capability. Native windows δηλώνονται, δεν παρουσιάζονται ως πλήρες ιστορικό. Το coverage ενημερώνει μόνο τα πραγματικά subsets, χωρίς κλείσιμο ανοιχτών οικογενειών.

Ο root έκανε επιπλέον read-only source audit των δύο πραγματικών O10 sales panes στο BACKOFFICE_SALES_EXTRA_READ_CONTRACT.md. Δεν προστέθηκαν ακόμη αυτά ταδύο δικαιώματα και δεν άλλαξε η native συμπεριφορά τους.

## Επαλήθευση και συνέχεια

Μετά το source freeze, τελική συνδυασμένη εκτέλεση29σχετικών αρχείων από canonicalservercwd:183σύνολο,175PASS/8SKIP/0FAIL σε51.77s. ΤαSKIPείναι7nativePG+1actualDocker επειδή δεν υπάρχουν τοπικά· δεν εμφανίζονται σανPASS. Το τελικόclientbuild πέρασε σε17.60s. Τα overlap counts προηγούμενων cohorts δεν αθροίζονται. Ο προηγούμενος ενδιάμεσος έλεγχος κατά την αλλαγή verify_restore απέτυχε σε6παλιά20-source hashes· η ανανέωση bytehashes και η τελική συνδυασμένη εκτέλεση πέρασαν χωρίς χαλάρωση ελέγχων. Η audit προβολή διατηρεί object-only before||after merge, ώστε ρητό null στοafter να καθαρίζει προηγούμενες αναφορές· προστέθηκε πραγματικό nativePG semantic test (τοπικόSKIP). Η UI εμφανίζει παλιό templatecategory ως τέτοιο, unavailable requiredrole και όρια1000/200/100.

Το σχέδιο μίας τελικής συνεδρίας βρίσκεται στο docs/roadmap/BACKOFFICE_FINAL_ACCEPTANCE_MATRIX.md, χωριστές σταθερές συνεδρίες ρόλων και μία συγκεντρωτική παραχώρηση/ανάκληση, με τεκμηριωμένες παλιές πράξεις που δεν επαναλαμβάνονται. Προστέθηκε ξεχωριστή nativefixture που καλείται και σταBASE/CAPTURE μετά την εγκατάσταση/COMPANY15: πραγματικό JWT/auth/indexbridge/DB για4προβολές, store-access/ξένα και κρυμμένα joins, counts, unavailable role, auditnullclear/PII, ανεξαρτησίαINVENTORY, BASIC/PRO, πραγματική μεταβολή account/grantrevision και explicit[] ανάκληση. Ο μηνιαίος negative fixture κατάλογος ενημερώθηκε ακριβώς σε57, χωρίς νέα προσωπική αρχή capture. Οι απαιτούμενες στήλες αντιπαραβλήθηκαν με το native metadata. Η actual4 εκτέλεση παραμένειNOTTESTED τοπικά και εκκρεμεί στο νέοCI· η νέαfixture πέρασε parse και ταframes παραλείφθηκαν ορθά χωρίς διαθέσιμηPG. Το source/index parse και checkpoint policy επαληθεύονται πριν τη δημοσίευση. Δεν έγινε παραγωγική migration, ενεργοποίηση, merge/deploy ή ανθρώπινη δοκιμή. POS/SuperAdmin/Owner δοκιμές συγκεντρωτικά στο τέλος στο υπάρχονLAB. Οι προηγούμενες επιβεβαιωμένες οικονομικές/stock πράξεις δεν επαναλαμβάνονται.
