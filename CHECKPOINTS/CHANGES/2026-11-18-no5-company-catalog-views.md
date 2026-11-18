# Νο5 — Κατηγορίες, ΦΠΑ, εταιρείες προϊόντων και τραπεζικές ρυθμίσεις

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · ίδιο Draft PR #4007 από remoted90dcd52 / localbee98af (ίδιο source tree90b7ca15). Source53STORE (35reads+18actions) και11COMPANY capabilities· όχι64ολοκληρωμένες οθόνες. Πλήρης κάλυψη OPEN.

## Έγινε

Προστέθηκαν categories.read, vat-departments.read, product-companies.read (INVENTORY) και banks.read (CORE), με native ασφαλή πεδία/αθροίσματα και πραγματικό επιλεγμένο εταιρικό scope. Μόνο οι κατηγορίες δέχονται προαιρετικό single own categoryId· ξένα/άγνωστα IDs, arrays, επιπλέον query/body selectors και mixed store header απορρίπτονται. Categories/subcategories/total/selection δημοσιεύονται ατομικά μετά από πλήρη scope/field validation. Περιλαμβάνονται native counts/percentages/exemptions και καθαρή ενεργή τραπεζική λίστα λογιστικών πεδίων. Δεν προβάλλεται IBAN ή POS configuration.

Οι προσωπικές αναγνώσεις δεν εκτελούν ensure/default/mapping/product updates και δεν αποκτούν writers ή product-drilldown APIs. Ο native Owner δρόμος διατηρείται· οι υπάρχουσες εξαιρέσεις ΦΠΑ μεταφέρθηκαν αυτούσιες σε purelib που χρησιμοποιούν και οι δύο δρόμοι. Επικοινωνία/ρόλοι/per-store πολιτικές δεν αναβαθμίζονται. Αλλαγές επιλογής/εταιρείας/revision/API κρύβουν άμεσα παλιά children και απορρίπτουν late αποτελέσματα.

Δημιουργήθηκε BACKOFFICE_OWNER_VIEW_COVERAGE.md:105μοναδικές οικογένειες πραγματικών entry/pane/report σημείων, με exact source/API, υπάρχουσες παραχωρήσεις, aliases, partial και finite OPEN remainder. Ελέγχθηκαν και τα dynamic report bootstraps. Δεν μεταφέρεται ownership ή ιστορικό PASS.

## CI συμφιλίωση / diagnostics

Το d90 κύριο CI44275409646 απέτυχε μόνο στα2native installer cases στην αρχή των CORE runtime checks: η fixture δεν είχε ενεργοποιήσει CORE. Η πραγματική πλήρης λήψη/private restore/εγκατάσταση, account/epoch retention/audit replay/readiness και πρώτες4εταιρικές αναγνώσεις είχαν ήδη εκτελεστεί επιτυχώς πριν το failure· δεν χαρακτηρίζεται συνολικό nativePASS. Το actualDocker20source/profile/auditor test716 πέρασε, όπως και wholesale/browser/offline και τα υπόλοιπα security tests. Το ίδιο κύριο run πέρασε το native wallet host+Docker test165.

Η ξεχωριστή wallet44275409570 πέρασε πλέον prerequisite setup αλλά απέτυχε σε hostprivatepg_restore πριν τοDocker. Η ακριβής αιτία παραμένει υπό διάγνωση· δεν παρουσιάζεται ως ήδη διορθωμένη. Το walletjob απαιτεί πλέον matching PG16 initdb+client και τυπώνει μόνο toolversions. Ο PrivatePostgres helper ταξινομεί αποτυχίες με αυστηρές σταθερές/exitcode/whitelisted command, χωρίς rawstderr/SQL/rows/paths/secrets. Ο producer/installer μεταφέρουν μόνο allowlisted typed JSON diagnostic, με genericfallback. Νέες redaction/canary δοκιμές επιβεβαιώνουν ότι δεν διαρρέουν στοιχεία. Δεν άλλαξαν restore commands ή acceptance checks. Ανανεώθηκαν τα20 hashes.

Η actualinstalled fixture έχει πλέον σωστό COREseed, paid-off που διατηρείCORE και ξεχωριστά CORE-off negatives, μαζί με τις11παραχωρήσεις/own-foreign counts/category selection/VAT metadata/brand totals/bank fields/no-writes/revision/session revocation. Οι runtime module κανόνες δεν χαλάρωσαν.

## Επαλήθευση / επόμενο

Τελική συνδυασμένη εκτέλεση25σχετικών αρχείων από το canonical servercwd, Node24:186PASS/6SKIP/0FAIL (192σύνολο). Skips5nativePG+1actualDocker λόγω τοπικού περιβάλλοντος. ClientbuildPASS, diffcheckκαθαρό. Τα overlap επιμέρους batch δεν αθροίζονται· το γνωστό τοπικό Chromium launch limitation παραμένει ιστορικό και εξαιρείται μόνο τοπικά, όχι από CI. Ένα προηγούμενο τοπικό VAT command είχε λάθοςcwd/ENOENT· το canonicalservercwd rerun πέρασε χωρίς αλλαγή runtime.

ΝέοCI στην ακριβή δημοσιευμένη πηγή απαιτείται για πλήρες native11acceptance και wallet διάγνωση. Παραμένουν οι υπόλοιπες τεκμηριωμένες Owner οικογένειες και ελεγχόμενη paired εγκατάσταση/hosted acceptance. Δεν έγινε productionmigration/deployment ή νέα ανθρώπινη δοκιμή. Όλες οι POS/SuperAdmin/Owner δοκιμές συγκεντρώνονται στο τέλος, στο υπάρχον LAB.
