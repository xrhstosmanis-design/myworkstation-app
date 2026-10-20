# MyWorkStation App v0.11 — Platform Admin & Commercial Pilot

## 20/10/2026 08:52 Europe/Athens - WHOLESALE-OFFLINE-APP-E2E-01 / ASSIGNED BEFORE SOURCE

Retained owner codex/wholesale-suite-20261017; claim docs/wholesale-offline-app-e2e-claim-20261020, planned source test/wholesale-offline-app-e2e-20261020. Baseline c3756ba0132c3f8589d92c6dd897e60ee858d55c. User requested continue20Oct08:48Athens. Prior source PR2912/full CI/exact hosted delivery and receipt PR2914 remain protected; no repetition of accepted hosted financial transactions. Current supported browser entry once again returned native credential-state observation unavailable; no reset loop, new password, alternate credential/session workaround or LIVE claim.

Bounded next scope: actual built WholesaleApp/OfflinePanel through real isolated lab HTTP/Prisma routes, explicitly separate from installed-device/LIVE acceptance. Add only four exact public wholesale PWA assets to the disposable lab's existing static allowlist (compiled wholesale SW, dedicated manifest, existing192/512icons); no generic root static mount. Add a new independent Chromium E2E script and CI step/artifact to use actual screen controls: authorized online preparation, offline local draft/edit, complete fresh-browser restart with cached shell and phrase unlock, explicit online quote, lost-response UNKNOWN after exactly one actual isolated order acceptance, original-body/key replay confirming the same order. Record fresh before/after order list and complete virtual ledger plus other-store control; no new invoice, payment or fiscal/stock posting. Include desktop/mobile actual UI screenshots and cache privacy checks. Only test environment/synthetic data; the existing hosted pinned lab remains untouched and no service is created, reset or repointed.

Allowed source files: ops/wholesale-lab/runtime.mjs narrowly scoped static routes, new server/e2e/wholesale-offline-app-flow.mjs, .github/workflows/ci.yml additive isolated-lab step/artifact and focused lab static-route regression if necessary. Existing production session/auth/entitlement/quote/order/DB schema/startup and actual business components remain unchanged unless a specific demonstrated regression is separately recorded. Require exact full source PR and later main CI; retain all old lab acceptance assertions. Before-source status NOT TESTED; whole commercial/offline fiscal/real-device acceptance remains OPEN under same owner. Checkpoint CHECKPOINTS/CHANGES/2026-10-20-wholesale-offline-app-e2e.md. Next single action after this claim green merged: implement and execute the isolated actual-app offline E2E; never present CI as manual PASS.


## 20/10/2026 00:51 Europe/Athens - WHOLESALE COMMERCIAL OFFLINE / CI VERIFIED, INSTALLED LAB OPEN

Retained owner codex/wholesale-suite-20261017. Source PR #2912 head 18cd03a154c76608884e22067a3cfb26e5c7d557 green merged 24e138767089672d296189b6073e6601ff520d4e after claim PR #2904. Dedicated install entry, allowlisted public offline shell, encrypted per-user/company/store/role catalogue and editable LOCAL_DRAFT orders implemented. Explicit online current-rights/current-price acceptance precedes immutable persisted body/key and guarded send; unknown results never become a fresh request. Durable observed-denial fences, cross-tab exclusion, storage-failure and capacity checks included. No existing auth/entitlement/pricing/order core, schema, production startup, fiscal/stock/payment operation or pinned lab configuration changed.

CI-only evidence: PR run 39327561161 all 5 jobs SUCCESS, server 3,580 PASS / 0 FAIL / 0 SKIP plus 8 recovery PASS; real isolated Chromium fully closed/restarted with unavailable server, reopened cached shell and encrypted saved order, rejected wrong phrase, verified real IndexedDB CAS, Web Locks, denial persistence/BroadcastChannel and no private API cache or business POST. Local Node20 focused 65 tests / 63 PASS / 0 FAIL / 2 infrastructure SKIP and frontend build passed. Exact source-main run 39328449945 was cancelled while pending after another owner's source merge; never called PASS. Later main revision f2a3b79a145f7f80331280384066ec78c29ec230 run 39328665510 all 5 jobs SUCCESS, server 3,594 PASS / 0 FAIL / 0 SKIP plus 8 recovery PASS, includes unchanged owned wholesale blobs and full acceptance. Normal guarded release workflow 39330143576 succeeded; Render dep-dbb8vvbncjis738veivg LIVE 2026-10-19T21:50:59.473712Z, exact revision verified by unauthenticated /api/health and HTTP 200 wholesale HTML/dedicated manifest/compiled SW at 21:51:23 UTC 19 Oct. Static delivery is not installed-device or business-flow acceptance.

Authoritative boundary: technical source/CI acceptance only; actual installed PC/mobile disconnected full UI use, offline invoice/payment/fiscal/stock execution and full commercial rollout remain OPEN/NOT TESTED. Browser observation remains platform-blocked after native credential-state refusal; no password request, credential workaround or old financial transaction replay. Existing LIVE/API/USER visual receipts PR #2891 / #2899 remain protected. No new manual PASS or whole-item closure. Technical guide docs/wholesale/COMMERCIAL_OFFLINE.md; evidence CHECKPOINTS/EVIDENCE/wholesale-commercial-offline-20261020/; detailed checkpoint CHECKPOINTS/CHANGES/2026-10-20-wholesale-commercial-offline-ci-receipt.md. Same owner retained; next bounded acceptance is a prepared installed device reopening and capturing a new local draft while disconnected when permitted browser observation is available, then one measured explicit online submission with a fresh baseline. No duplicate claim by another page.




## Κεντρική συνέχεια εργασιών

- Ενεργές εκκρεμότητες, Gate ownership και σειρά: `docs/roadmap/PENDING_WORK.md`
- Εκτυπώσιμο κεντρικό PDF: `output/pdf/MyWorkStation_Central_Pending_Roadmap_2026-09-23.pdf`
- Κανόνας: κάθε πραγματικό PASS διαγράφεται από την pending λίστα στο ίδιο PR και καταγράφεται στο αντίστοιχο `docs/manual/<module>/PASS.md`.

> **Συνέχεια εργασιών ΚΑΤ:** Κάθε νέα συνεδρία πρέπει να διαβάζει πρώτα το
> [`KAT_CONTINUATION_CHECKPOINT.md`](KAT_CONTINUATION_CHECKPOINT.md). Εκεί καταγράφονται
> όσα είναι ήδη LIVE, τι δεν πρέπει να επαναληφθεί και το ακριβές επόμενο βήμα.

## Ρόλοι εμπορικής πλατφόρμας

- **Platform Super Admin**: ο ιδιοκτήτης του MyWorkStation. Διαχειρίζεται όλους τους πελάτες, τα καταστήματα, τα πακέτα και τους λογαριασμούς ιδιοκτητών.
- **Customer Owner**: ξεχωριστός λογαριασμός `OWNER` για κάθε πελάτη. Βλέπει αποκλειστικά τη δική του εταιρεία και τα καταστήματά της.
- **Store Manager**: διαχειρίζεται το κατάστημα που του έχει ανατεθεί.
- **Employee / Store Operator**: εισέρχεται στο Store Mode με προσωπικό PIN ή κάρτα.

Ο Platform Super Admin δεν θεωρείται ιδιοκτήτης πελάτη. Κάθε εταιρεία πελάτη έχει δικό της λογαριασμό `OWNER`.

## Platform Admin

Μοναδικός σύνδεσμος που στέλνουμε για είσοδο Platform/Super Admin:

```text
https://myworkstation-app.onrender.com/platform-admin
```

Η αρχική διεύθυνση του Render, εσωτερικά `?supportPage=stores` και σύνδεσμοι `/store/<id>` δεν είναι σύνδεσμοι εισόδου Platform Admin. Οι σύνδεσμοι Store Mode δίνονται χωριστά, με σαφή σήμανση για το συγκεκριμένο κατάστημα και terminal.

Δυνατότητες:

- συνολική εικόνα πελατών, καταστημάτων, χρηστών και εργαζομένων,
- δημιουργία νέου πελάτη, ιδιοκτήτη και πρώτου καταστήματος,
- ορισμός ή αλλαγή ιδιοκτήτη υπάρχοντος πελάτη,
- αλλαγή προσωρινού κωδικού ιδιοκτήτη,
- πακέτα TRIAL / PILOT / BASIC / PRO / ENTERPRISE,
- ενεργοποίηση ή απενεργοποίηση πελάτη χωρίς διαγραφή δεδομένων.

## ΚΑΤ — πρώτος πιλοτικός πελάτης

- Εταιρεία/πελάτης: **Κυλικείο ΚΑΤ**
- Κατάστημα: **Κυλικείο ΚΑΤ**
- Ιδιοκτήτρια πελάτη: **Νίκη Ραζάτου**
- Ο λογαριασμός ιδιοκτήτριας χρειάζεται ορισμό προσωρινού κωδικού από το Platform Admin πριν από την πρώτη σύνδεση.

## Εγκατάσταση online με ένα πάτημα

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/xrhstosmanis-design/myworkstation-app)

Το Render διαβάζει αυτόματα το `render.yaml` και δημιουργεί:

- το MyWorkStation Web Service,
- τη βάση PostgreSQL,
- το `DATABASE_URL`,
- ασφαλές `JWT_SECRET`,
- αρχικό λογαριασμό Platform Super Admin,
- τους πίνακες και τα αρχικά πιλοτικά δεδομένα.

Περιοχή εγκατάστασης: **Frankfurt**.

Μετά το deployment:

1. Άνοιξε το Web Service στο Render.
2. Έλεγξε ότι το `/api/health` απαντά επιτυχώς.
3. Από **Environment** δες μόνο το `INITIAL_ADMIN_PASSWORD`.
4. Σύνδεση Platform Admin με email `admin@myworkstationapp.gr`.
5. Πρόσθεσε το `myworkstation.gr` από **Settings → Custom Domains**.

## Store Mode και εμπορική πιλοτική λειτουργία

- προσωπική είσοδος εργαζομένου με PIN ή κάρτα,
- άνοιγμα και κλείσιμο βάρδιας,
- Συρτάρι, Φύλαξη, Κέρματα και Χρηματοκιβώτιο,
- πωλήσεις μετρητών και καρτών,
- πληρωμές προμηθευτών, λοιπά έξοδα και μεταφορές ποσού,
- ημερήσια αναφορά πιλότου και εξαγωγή CSV,
- ονομαστικό audit ενεργειών.

Η πιλοτική web λειτουργία παραμένει παράλληλη και μη φορολογική έως την ενεργοποίηση του τοπικού Connector προς CapDriver και RBS.

## Αναβάθμιση

Κάθε αλλαγή στο branch `main` ενεργοποιεί αυτόματο deployment στο Render. Δεν απαιτείται τοπική εγκατάσταση PostgreSQL, Node.js ή Prisma στους υπολογιστές των χρηστών.

# Κοινός κανόνας δοκιμών MYWORKSTATION LAB

Το MYWORKSTATION LAB είναι εικονικό κατάστημα δοκιμών. Όλες οι σελίδες εργασίας δοκιμάζουν εκεί τις σχετικές λειτουργίες και ελέγχουν τα αποτελέσματα πριν από χρήση σε πραγματικά καταστήματα. Τα πραγματικά καταστήματα θα δημιουργηθούν χωριστά από την αρχή, με δικό τους κατάλογο, αποθήκη, υπαλλήλους, ταμεία και τερματικά. Οι λειτουργίες που παίρνουν LAB PASS καταγράφονται κεντρικά και ο κοινός διορθωμένος κώδικας διατίθεται στα νέα καταστήματα. Δεν μεταφέρονται δεδομένα, εικονικά υπόλοιπα ή ιστορικές κινήσεις του LAB σε νέο κατάστημα. Βλ. `AGENTS.md` για τον κοινό κανόνα PASS και τη διάκριση δοκιμής από εγκατάσταση.
