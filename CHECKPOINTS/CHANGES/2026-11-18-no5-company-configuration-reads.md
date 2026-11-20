# No5 — δεκαεπτά δικαιώματα εταιρικών ρυθμίσεων

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · PR #4007.

Baseline remote `bc98004e6e1bac85b241db6648d4f4ef64f4cca5`, local `a9d6f2b4bf1a31713314d3f0350be7cc88bf991d`, tree `c41b748349374837fc9f64379c5b91437ad2ff74`.

## Συμπεριφορά

COMPANY53 και STORE74 αμετάβλητο: δεκαεπτά νέα ανεξάρτητα εταιρικά δικαιώματα. Τερματικά POS, ομάδες/είδη modifiers, κατάλογος παρασκευής, κατάσταση άδειας, τιμές modifiers από επιλεγμένο κατάστημα, ρυθμίσεις/συνταγή παρασκευής προϊόντος, κατανάλωση υλικών modifier και δέκα χωριστές ενότητες παραμέτρων: επιχείρηση, τράπεζες, eDelivery, POS, BackOffice, βάρδιες, πελάτες, email, λοιπά και αγορές.

Οι επιλεγμένες οντότητες προέρχονται από ονομαστικούς, ρητά παραχωρημένους γονικούς καταλόγους. Τα store-linked prices απαιτούν stores.read+modifiers.read, η παρασκευή προϊόντος company-products.read και η κατανάλωση modifiers.read+preparation-catalog.read. Εταιρεία/header/query/οντότητα/module/policy/revision ελέγχονται πριν και μετά. Δεκαοκτώ ακριβείς GET διαδρομές `/api/backoffice-staff/company/configuration/...` για τα δεκαεπτά δικαιώματα, χωρίς native GET initializers ή αλλαγή native Owner writer συμπεριφοράς. Τερματίζουν μέσα στον υπάρχοντα BackofficeStaffRouter μετά από έναν μόνο έλεγχο authentication, όπως το εταιρικό μητρώο ρόλων. Αφαιρέθηκαν από τη δεύτερη πρώιμη γέφυρα ώστε να μη γίνεται διπλή επαλήθευση JWT/συνεδρίας. Το πραγματικό router και ο native helper ελέγχουν ακριβώς μία κλήση auth ανά αίτημα.

Μόνο το γνωστό license-status.read μπορεί να προβάλλει ληγμένη/ανεσταλμένη άδεια. Παραμένουν υποχρεωτικά η ενεργή εταιρεία, πραγματικός εγκατεστημένος COMPANY protocol, προσωπικό grant και ανάκληση. Καμία Super Admin παράκαμψη, ενεργοποίηση module ή πρόσβαση άλλης λειτουργίας μέσω της εξαίρεσης.

Οι παράμετροι καλύπτουν 176 γνωστά πεδία, ελεγμένα ανεξάρτητα έναντι των δέκα πραγματικών native Zod schemas μέσω Babel AST. Οι τέσσερις είσοδοι password/PIN αντικαθίστανται από configured booleans. Άγνωστα JSON keys, encrypted credentials, URLs με διαδρομές/query/userinfo και αυθαίρετα helper πεδία δεν προβάλλονται. URL εμφανίζει μόνο δημόσια προέλευση και ένδειξη ρύθμισης. Στοιχεία επικοινωνίας/IBAN/παραλήπτες/ονόματα λογαριασμών δηλώνονται στις επιμέρους παραχωρήσεις.

Απουσία εγγραφής/ενότητας/πεδίου παραμένει χωριστή από false/0/null, χωρίς INSERT ή υποθετικές προεπιλογές. Διατηρείται η πραγματική native fallback επωνυμίας/ΑΦΜ/πόλης/τηλεφώνου από Company και businessEmail από Company.email, με χωριστό companyDefaults μόνο της επιτρεπόμενης ενότητας και ένδειξη προέλευσης. Μόνο η απουσία PreparationProductSettings δίνει τις τέσσερις συγκεκριμένες native προεπιλογές. Ξένες αναφορές προϊόντων/υλικών/ομάδων/τραπεζών προβάλλονται ως μη διαθέσιμες χωρίς ξένο ID/όνομα.

## Επαλήθευση

Τελική συγκεντρωτική σουίτα74αρχείων:411tests,393PASS/18PostgreSQL-or-imageSKIP/0FAIL,165.83s. Canonicalservercwd, NODE_ENV=test, concurrency4, actualChromiumexcluded. ClientbuildPASS38.69s· μεταγενέστερη διόρθωση αφορά μόνο server routing, χωρίς αλλαγή client. Logs /tmp/no5-company53-final.log και /tmp/no5-company53-build.log. ΤαSKIPδενείναιPASS.

Προηγούμενο headbc98004e: main44315071956, wallet44315072022 καιChat44315072010 ολοκληρώθηκαν SUCCESS. Πραγματικά COMPANY36 BASE724 PASS στις13:37:49UTC καιCAPTURE725 PASS στις13:38:48UTC. Security6396PASS/0FAIL/1SKIP και επόμενα8/8PASS. Wallet9/9PASS με matching16.16 καιδεύτερηPG18full/selectiverecovery. Δεν άλλαξαν τα20 core backup/install source-bound αρχεία.

Οι καθαρές προβολές περιορίζουν το DOM σε100γραμμές ανά πίνακα και10ομάδες παρασκευής ανά σελίδα, με τοπική πλοήγηση χωρίς πρόσθετα GET. Ελέγχονται επαναφορά σε μικρότερο αποτέλεσμα και διαγραφή δεδομένων μετά από ανάκληση.

Νέος πραγματικός native helper για όλα17 σεBASE/CAPTURE, με30seed rows/updates και κοινό metadata preflight. Ελέγχει πραγματικό STAFF JWT/router, έλλειψη παραμέτρων χωρίς INSERT, typed projections/secret canaries, ανάκληση/module, ληγμένη/ανενεργή εταιρεία και έλλειψη optional schema σε πραγματική READ ONLY συναλλαγή με κενό search_path. Metadata preflight5PASS, όχι native εκτέλεση. Νέο πραγματικόCI53 απαιτείται.

## Όρια

Πλήρης Owner κάλυψη παραμένει OPEN. Αυτό το checkpoint αφορά τις συγκεκριμένες προβολές/πεδία, όχι writers, raw credentials, δοκιμή τερματικού, εκτύπωση, παραγωγή, stock μεταβολή ή συνδρομητική ενέργεια. Καμία παραγωγική εγκατάσταση, merge/deploy ή ανθρώπινη δοκιμή. Μία κοινή συνεδρία χρήστη στο υπάρχον LAB στο τέλος.
