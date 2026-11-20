# No5 — οκτώ εταιρικές αρχικές και οικονομικές προβολές

18/11/2026 · CENTRAL-BACKOFFICE-ACCESS-01 · PR #4007.

Baseline remote `aac5fb26d8d3e6fc7f929f7076d3b032573b0073`, local `e4e0601833733cba1176bc5356214d3cb459162b`, tree `84a2f6ec506b3842ea1046bb54dd1c4269ae5114`, main `8a9c4333`.

## Συμπεριφορά

COMPANY61, STORE74 αμετάβλητο. Νέα dashboard.read, master-catalog.read, owner-shifts.read, owner-payments-report.read, business-picture.read, audit-events.read και δύο στενοί οικονομικοί κατάλογοι financial-store-options.read / financial-supplier-options.read. Οι οικονομικές αναφορές διατηρούν το πραγματικό CASH_CONTROL· οι στενοί γονείς εμφανίζουν μόνο ονόματα/IDs/ΑΦΜ, χωρίς επιπλέον απαίτηση INVENTORY ή στοιχεία επικοινωνίας. Audit metadata παραμένει native free με ενεργή εταιρική άδεια, χωρίς επινοημένο module. Ακριβείς GET μέσα στον υπάρχοντα BackofficeStaffRouter με πραγματικό STAFF JWT/auth μία φορά και επανέλεγχο grant/revision/module μετά την ανάγνωση.

Dashboard επαναχρησιμοποιεί τους τέσσερις native ORM μετρητές. Master αναζητά το πραγματικό κοινόχρηστο Owner catalogue έως100 αποτελέσματα, διατηρεί πραγματικό μηδέν/NULL/Prisma Decimal και αποκαλύπτει μόνο τη δική του εταιρική αντιστοίχιση. Δεν είναι platform maintenance ή activation.

Βάρδιες: native αναφορά έως1500 και ανάλυση ονομαστικά επιλεγμένης εγγραφής, χωρίς force-close. Εξήχθη ο ίδιος canonical reader και διατηρήθηκε αυτούσιο το εγκεκριμένο selectedSales SQL. Ιστορικά hashes ORIGINAL_SELECTION=e6b2e20d… και OUTSIDE_SELECTION=22478ad3… διατηρήθηκαν, μαζί με ανεξάρτητο original route fixture και εγκεκριμένο selection7f4b5557…. Το harness συγκρίνει πραγματικό exported reader με την ανεξάρτητη αρχική πηγή, όχι νέο mock υπολογισμό. Σύνολο γραμμών όλων των συναλλαγών έως10000, ελεγχόμενο πριν από flatMap, όχι10000 ανά συναλλαγή.

Πληρωμές: πλήρη native σύνολα/ομάδες της πηγής, τελευταίες1500 κινήσεις χωριστά και μόνο evidence metadata. Ξένοι supplier/document/product σύνδεσμοι καλύπτονται. Οικονομική εικόνα: ίδια canonical SQL/helpers για ημερολογιακές ημέρες Ελλάδας, εκπτώσεις/ΕΦΚ/αναστροφές/επιμερισμό εξόδων και διακριτές εκτιμήσεις≈/άγνωστα κόστη. Native Owner defaults και υπολογισμοί διατηρούνται· επιπλέον tenant predicates ενεργοποιούνται μόνο για την παραχωρημένη ανάγνωση.

Audit: ίδιο canonical πέντε πηγών χωρίς initializer, με πραγματικό READ ONLY RepeatableRead snapshot και5s statement timeout. Η παραχώρηση περνά μόνο κλειστή προβολή γνωστών scalar JSON πριν από τον native formatter, χωρίς raw JSON ή actor/session IDs. q/όνομα χειριστή αναζητούν μόνο τα τελικά επιτρεπόμενα πεδία του παραθύρου, χωρίς secret-match oracle. Δηλώνεται όριο10000 ανά πηγή/τελικό10000 και ότι online συγχώνευση, αναλυτικές γραμμές πώλησης και video δεν περιλαμβάνονται. Η αρχική canonical SQL/περιγραφές/οικονομικά έχουν ανεξάρτητο normalized SHA41177f1b2306689c4dd74c22c4a5bc52fb9d369397e95d952c07128dcb4862e2. Native Owner διατηρεί πλήρη enrichment και late video-access check· δεν έγινε CLIP/media αίτημα από delegated read.

Προστέθηκαν αναζήτηση πλοήγησης χωρίς αλλαγή πολιτικής, ανεξάρτητη κύλιση sidebar και σωστός τίτλος επιλεγμένης προβολής. Η κοινή υπάρχουσα εγγραφή οθόνης ανοίγει μόνο το δημόσιο τοπικό παράθυρο με ουδέτερη σήμανση. Δεν δημιουργήθηκε πλασματικό grant ή αυτόματη καταγραφή· η πραγματική εγγραφή απαιτεί τη χωριστή ενέργεια/συναίνεση του browser.

## Επαλήθευση

Τελική104fileσυγκεντρωτική σουίτα:542tests,517PASS/25PostgreSQL-or-imageSKIP/0FAIL,153.89s. Περιλαμβάνει όλα τα προηγούμενα No5 και τα σχετικά canonical owner-shift/payments/business-picture/master/audit/recorder tests. Canonicalservercwd, NODE_ENV=test, concurrency4, actualChromiumexcluded. ClientbuildPASS42.04s. Logs /tmp/no5-company61-final.log και /tmp/no5-company61-build.log. ΤαSKIPδενείναιPASS.

Προηγούμενο alignedCOMPANY53 main44321049438 πλήρεςSUCCESS:6417PASS/0FAIL/1SKIP, επόμενα8/8E2E, πραγματικάBASE724 στις14:12:44UTC καιCAPTURE725 στις14:13:46UTC μεόλα17configurationviews/μίαauth/expired-status-only/READONLYmissing-schema. Wallet44321049493καιChat44321049383SUCCESS. Το αρχικό7dd main44320435534 ακυρώθηκε από το νέο head και δεν προσμετράται ως native αποδοχή.

Νέος native61 helper44 rows σε17 πραγματικούς πίνακες, actual Owner policy/STAFF/auth/profile, source-equivalence και ξένες αναφορές, πραγματικά R/O snapshots/fresh revocation. Metadata preflight προσθέτει και πραγματικά enum labels. Αυτό δεν υποκαθιστά το υποχρεωτικό νέο BASE/CAPTURE CI61. Δεν αλλάζουν τα20 bound source αρχεία.

## Όρια

Η συνολική Owner κάλυψη παραμένει OPEN. Dashboard company switching, πλήρη evidence/media, audience-history/import/λοιπές καρτέλες και άλλες ανοικτές οικογένειες παραμένουν στην coverage λίστα. Δεν έγιναν merge σε main, παραγωγική δημοσίευση/COMPANY install, οικονομικές/stock πράξεις ή ανθρώπινη αποδοχή. Ενιαίο υπάρχον LAB στο τέλος, χωρίς επανάληψη ήδη τεκμηριωμένων ανθρώπινων PASS.
