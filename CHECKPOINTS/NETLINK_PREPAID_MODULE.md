# CHECKPOINT — NETLINK_PREPAID_MODULE

Ημερομηνία: 2026-08-25
Branch: `agent/netlink-staging-current-main`
PR: #231
Legacy PR: #210

## Σταθεροί κανόνες
- Το Netlink είναι πληρωμένο πρόσθετο module: `NETLINK_PREPAID`.
- Δεν είναι ξεχωριστό ταμείο.
- Κάθε ολοκληρωμένη Netlink πώληση συνδέεται με κανονική `Sale` του ίδιου καταστήματος/εταιρείας.
- Ο τζίρος μετράει μία φορά στην κανονική POS πώληση.
- Κάρτα κινητής και παροχή υπηρεσίας είναι δύο ξεχωριστές γραμμές στην ίδια πώληση.
- Παράδειγμα: κάρτα 20,00€ + παροχή υπηρεσίας 0,50€ = σύνολο πελάτη 20,50€.
- Η προμήθεια MyWorkStation είναι 1% πάνω στην αξία της κάρτας, όχι πάνω στην παροχή υπηρεσίας.
- Στην παραγωγή η κάρτα/PIN εκδίδεται μόνο μετά από επιβεβαιωμένη φορολογική απόδειξη.
- Πριν συνδεθεί η ταμειακή επιτρέπεται staging TEST MODE, αυστηρά εκτός production.
- Τα πραγματικά Netlink credentials δεν αποθηκεύονται στο repository. Μόνο environment secrets.
- ΔΕΝ γίνεται merge χωρίς ρητή έγκριση.
- ΔΕΝ χαλαρώνουμε licensing, authentication ή fiscal/production safety gates.

## Staging στοιχεία που απαιτεί ο connector
- `NETLINK_TOKEN_URL`
- `NETLINK_API_BASE`
- `NETLINK_CLIENT_ID`
- `NETLINK_CLIENT_SECRET`
- `NETLINK_USERNAME`
- `NETLINK_PASSWORD`
- `NETLINK_STATION_ID`
- `NETLINK_TEST_MODE=true` μόνο στο staging
- `NETLINK_ENABLE_EXECUTE=false` μέχρι να επιβεβαιωθεί authentication/menu και να ολοκληρωθεί η ασφαλής δοκιμή

## CI / PR #231 diagnostic checkpoint — 2026-08-25
- PR #231 είναι `open`, `draft`, `merged=false`.
- Head branch: `agent/netlink-staging-current-main`.
- Head SHA που απέτυχε αρχικά: `3d05bb6567a44c5c3318817b51f0b1b397c6a3fc`.
- GitHub Actions run: `32779516528` / MyWorkStation CI run #647.
- Αποτυχία αποκλειστικά στο step: **Run security and licensing tests** (`npm test -w server`).
- Build, KAT production invariants και E2E δεν έτρεξαν επειδή κόπηκε νωρίτερα το server test suite.
- `pre-kat-structural-regression-v1.test.js` ελέγχθηκε: δεν περιέχει exact licensed/technical module expectation που να εξηγεί το Netlink failure.
- `rbs-technical-activation.test.js` ελέγχθηκε: προστατεύει technical activation και δεν πρέπει να χαλαρώσει.
- `module-catalog.test.js` ελέγχθηκε: δεν έχει exact module count και το νέο `NETLINK_PREPAID` δεν το σπάει από μόνο του.
- `module-access.test.js` ελέγχθηκε: δεν έχει expectation σχετικό με Netlink.
- `platform-license-route.test.js` ελέγχθηκε: κάνει μόνο import validation, χωρίς exact module expectation.
- `commercial-database-v1.test.js` ελέγχθηκε: αφορά τα 18 commerce tables και δεν συνδέεται με το Netlink module catalog.
- Το Netlink route στο `server/src/index.js` παραμένει πίσω από `auth + requireCompanyModule("NETLINK_PREPAID")`.
- Το `NETLINK_PREPAID` στο `module-catalog.js` είναι `commercialReady:false` και `requiresTechnicalActivation:true`.
- Άρα μέχρι εδώ **δεν πειράζουμε κανένα security/licensing/fiscal guard**.

## Main sync ολοκληρώθηκε — 2026-08-25
- Πριν το sync δημιουργήθηκε ασφαλές backup branch: `backup/pr231-before-main-sync-2026-08-25` στο SHA `7a6f853a30e9bddf8cedf8ce2e135809e843599e`.
- Το `main` ήταν στο SHA `64e2206b45dc3b1945b79f95bf584934c41b0ba1`.
- Ο έλεγχος compare έδειξε diverged branches αλλά οι νέες αλλαγές του `main` δεν αφορούσαν τα βασικά Netlink αρχεία.
- Δημιουργήθηκε merge-tree πάνω στο σημερινό `main` και διατηρήθηκαν ακριβώς τα 6 αρχεία του PR #231.
- Νέο sync commit: `e2e312fbb78cb4719e40456fcce9ab92f8c1d081`.
- Το branch `agent/netlink-staging-current-main` μετακινήθηκε με fast-forward στο παραπάνω commit.
- Δεν έγινε merge του PR #231 στο `main`.
- Δεν άλλαξε κανένα authentication/licensing/fiscal/production safety gate.

## Αρχιτεκτονική αλλαγή storage — 2026-08-25
- Αποφασίστηκε να μην δημιουργούνται πλέον Netlink tables/indexes κατά την εκτέλεση HTTP requests.
- Προστέθηκε versioned Prisma migration: `server/prisma/migrations/20260825130500_netlink_prepaid_storage/migration.sql`.
- Η migration είναι idempotent (`IF NOT EXISTS`) ώστε staging περιβάλλον που είχε ήδη δεχτεί το προσωρινό runtime bootstrap να διατηρήσει τα δεδομένα του.
- Το `server/src/routes/netlink.js` δεν εισάγει ούτε καλεί πλέον `ensureNetlinkSchema()`.
- Το προσωρινό `server/src/netlink-bootstrap.js` αφαιρέθηκε.
- Το route guard στο `server/src/index.js` ΔΕΝ άλλαξε: `auth + requireCompanyModule("NETLINK_PREPAID")`.
- Τα production fiscal gates και τα `NETLINK_TEST_MODE` / `NETLINK_ENABLE_EXECUTE` locks ΔΕΝ άλλαξαν.
- Commits υλοποίησης: migration `2f4a999f3548d3aa4375e22252d77cb63ab3f8cf`, route cleanup `42dd66c470291c1d945a8c2d9f7494891c55fb43`, bootstrap removal `b73700db7a11d33df309882e24280b9a63a00e71`.

## Επόμενο ακριβές βήμα — ΜΗΝ ΞΑΝΑΚΑΝΕΙΣ ΤΑ ΠΑΡΑΠΑΝΩ
1. Έλεγξε το νέο CI του head μετά την αφαίρεση runtime DDL.
2. Αν το `npm test -w server` αποτύχει, πάρε το πρώτο πραγματικό failing assertion από το job log.
3. Κάνε μόνο τη μικρότερη ασφαλή διόρθωση πάνω σε αυτό.
4. Μην αλλάξεις authentication/licensing/fiscal/production safety gates.
5. Μην κάνεις merge χωρίς ρητή έγκριση.
6. Γράψε νέο checkpoint με failing test, root cause, commit SHA και CI αποτέλεσμα.

## CI ολοκληρώθηκε — έτοιμο για staging δοκιμή (2026-08-25)
- Τελικό ελεγμένο head: `62190056a49c03947a929b078150d573b30a8c53`.
- GitHub Actions: **CI #701**, run `32849034816` — `success`.
- Πέρασαν security/licensing tests, build, όλα τα KAT safety invariants, isolated E2E database και όλα τα real HTTP E2E flows.
- Τοπικό server regression suite: **629/629 PASS**.
- Η multi-POS λογιστική κίνηση απομονώνεται πλέον στο σωστό `terminalPos`.
- Η canonical preparation route προηγείται της legacy route: η αποστολή στην παραγωγή δεν αφαιρεί stock και η κατανάλωση γίνεται μία φορά μετά το ολοκληρωμένο checkout.
- Η Online παραγγελία ολοκληρώνεται μόνο με την προστατευμένη ροή `READY → POS checkout → verified POS handoff → DELIVERED`.
- Το PR #231 παραμένει draft/open/unmerged.
- Το Netlink route παραμένει ακριβώς πίσω από `auth + requireCompanyModule("NETLINK_PREPAID")`.
- Δεν χαλάρωσε κανένα licensing, authentication ή fiscal/production safety gate.

## Επόμενο ακριβές βήμα — staging TEST MODE
1. Ρύθμισε τα Netlink staging secrets στο staging environment, με `NETLINK_TEST_MODE=true` και `NETLINK_ENABLE_EXECUTE=false`.
2. Εφάρμοσε τις versioned Prisma migrations στο staging database.
3. Κάνε deploy το head του PR #231 σε staging, όχι σε production.
4. Επιβεβαίωσε authentication και ανάκτηση `/menu` χωρίς έκδοση κάρτας/PIN.
5. Μόνο μετά το PASS των παραπάνω, ενεργοποίησε προσωρινά `NETLINK_ENABLE_EXECUTE=true` στο staging και εκτέλεσε μία ελεγχόμενη TEST MODE συναλλαγή.
6. Επιβεβαίωσε ότι δημιουργήθηκαν μία `NetlinkTransaction`, μία κανονική `Sale`, οι σωστές γραμμές κάρτας/παροχής και ότι ο τζίρος μετρήθηκε μία φορά.
7. Επανέφερε αμέσως `NETLINK_ENABLE_EXECUTE=false` μετά τη δοκιμή.
8. Μην κάνεις merge ή production ενεργοποίηση χωρίς ρητή έγκριση.

## Επιβεβαίωση συμβολαίου execute από Netlink — 2026-08-26
- Η Netlink επιβεβαίωσε γραπτώς ότι για το προϊόν `164` η κλήση είναι `POST /164/execute`.
- Το ακριβές body είναι `{ "requestId": "...", "payload": {} }`. Το `payload` πρέπει να ακολουθεί το JSON schema του αντίστοιχου προϊόντος στο `/menu`.
- Απαιτείται `Authorization`; το `Accept-Language` είναι προαιρετικό.
- Το staging δεν δημιουργεί πραγματικές χρεώσεις, αλλά ισχύει όριο δοκιμών ανά client και τυχόν αύξηση ζητείται από τη Netlink.
- Ο connector και το regression test διορθώθηκαν ώστε να στέλνουν το παραπάνω wrapper και όχι γυμνό payload.
- Δεν εκτελείται νέα δοκιμαστική συναλλαγή πριν ολοκληρωθούν merge με το τρέχον `main`, security/licensing tests και CI.
- Τα `auth + requireCompanyModule("NETLINK_PREPAID")`, fiscal gates και production locks παραμένουν αμετάβλητα.

## CI #730 — main-sync regression correction (2026-08-26)
- Head `ca3c64331a06ef3f115c93cb925a7c27d4837d93` ήταν mergeable και `0` commits πίσω από το `main`.
- Το CI πέρασε checkout, dependencies και Prisma generate, αλλά το Step 7 είχε `630/633 PASS`.
- Τα τρία failures ήταν αποκλειστικά UI regression assertions από τη συγχώνευση: ετικέτα POS cancellation, απουσία πρόσθετου `MutationObserver` στο audit installer και ακριβής ετικέτα φύρας στην ενεργή βάρδια.
- Έγινε η ελάχιστη διόρθωση στα δύο UI αρχεία. Δεν άλλαξε Netlink auth/licensing/fiscal logic.
- Τα τρία failing tests και τα σχετικά Netlink/licensing/structural tests πέρασαν τοπικά: `24/24 PASS`.


## Isolated staging E2E window — 2026-08-27
- Branch created from current `main` solely to provision a Render PR preview.
- The preview must use the Netlink staging provider and an isolated preview database.
- `NETLINK_TEST_MODE=true` is preview-only.
- `NETLINK_ENABLE_EXECUTE=true` is allowed only for one controlled staging transaction and must be disabled immediately afterwards.
- Production execute remains disabled.
