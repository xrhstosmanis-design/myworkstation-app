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

## Επόμενο ακριβές βήμα — ΜΗΝ ΞΑΝΑΚΑΝΕΙΣ ΤΑ ΠΑΡΑΠΑΝΩ
1. Έλεγξε το CI του νέου head μετά το main sync.
2. Εντόπισε το πρώτο πραγματικό failing test/assertion από `npm test -w server`.
3. Κάνε μόνο τη μικρότερη ασφαλή διόρθωση πάνω σε αυτό.
4. Ξανατρέξε CI.
5. Γράψε νέο checkpoint με failing test, root cause, commit SHA και CI αποτέλεσμα.
