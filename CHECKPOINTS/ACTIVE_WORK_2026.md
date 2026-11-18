## 18/11/2026 — Νο2 — verified ordinary posting projection / ASSIGNED BEFORE SOURCE

Owner `/root` Νο2, συνέχεια ρητού αιτήματος πραγματικών εκκρεμοτήτων. Στενό ordinary derived view για ρητά αποδεδειγμένα source/projection pairs, μοναδική πλήρη posting/stock απόδειξη και raw provenance. Ο C classifier code, D1, writers και email διατηρούνται. [Checkpoint](CHANGES/2026-11-18-no2-ordinary-posting-projection.md). NOT STARTED/NOT TESTED πριν merged claim, καμία οικονομική/stock πράξη.

### Νεότερη κατάσταση 18/11/2026 — Νο2 — ενιαία διόρθωση πραγματικών εκκρεμοτήτων και clickable counters / AWAITING FULL CI

Owner `/root`, branch `feat/no2-counter-reconciliation`, μετά merged claims #4032/e90b29c1 και #4033/e05cd112. Ενοποιεί την πράσινη #4031 payment proof με ordinary-only proven posting projection και φίλτρα ολόκληρου μήνα πριν pagination. Κρατά raw provenance/fingerprint, scoped cursors, C classifier/D1/email/writers αμετάβλητα και άλλους owners.83pure/reader/D1 PASS,22mounted PASS, frontend build PASS· τοπική Chromiumstartup ECONNRESET και nativePG SKIP δεν αποκρύπτονται, απαιτείται actual PG/browser full CI. Καμία νέα πληρωμή/καταχώριση/stock πράξη. Το παλιό limited LIVE δεν μετατρέπεται σε πλήρη μήνα/ρόλους PASS. [Counters](CHANGES/2026-11-18-no2-monthly-counter-drilldown.md), [Projection](CHANGES/2026-11-18-no2-ordinary-posting-projection.md). Επόμενο source/main CI, exact deploy και read-only hosted επανέλεγχος· κοινές δοκιμές στο τέλος.

## 18/11/2026 — Νο2 — summary counter drill-down / ASSIGNED BEFORE SOURCE

Νέο ρητό αίτημα ιδιοκτήτη: εμφάνιση αντίστοιχων παραστατικών όταν πατά κάθε σύνολο· πρώτα οι μη καταχωρισμένες αγορές. Owner `/root` Νο2, branch `feat/no2-monthly-counter-drilldown`, μόνο ordinary GET filter/UI και regressions. Όλο το month subset πριν pagination, bound cursors και αμετάβλητα global totals. Άλλοι owners/C/D1/email/classifier/writers διατηρούνται. [Checkpoint](CHANGES/2026-11-18-no2-monthly-counter-drilldown.md). NOT STARTED / NOT TESTED, source μετά merged claim, καμία οικονομική/stock πράξη.

## 18/11/2026 — Νο 15 — Μερική πληρωμή φόρμας POS / AWAITING CI AND LAB

Η κανονική φόρμα CASH έστελνε payments:null και απορριπτόταν από το υπάρχον checkout schema πριν από συναλλαγή. Μονογραμμική διόρθωση του caller και regression πραγματικού callback/serializer/schema. [Checkpoint](CHANGES/2026-11-18-table-service-partial-cash-form.md). Ίδια ανάθεση TABLE_SERVICE, πλήρες CI και επαναδοκιμή υπάρχοντος LAB εκκρεμούν.

## 18/11/2026 21:31 Αθήνας — CENTRAL-WAREHOUSE-FILTER-PARITY-01 — ASSIGNED /root / BEFORE SOURCE

Νέο αίτημα ιδιοκτήτη της 18/11/2026 με δύο εικόνες: ίδια επάνω φίλτρα στην αποθήκη της Κεντρικής Διαχείρισης όπως στην αποθήκη από POS. Branch `feat/central-warehouse-filter-parity-20261118`, base `0a45f48d6`. Ανεξάρτητο στενό scope εμφάνισης/αναζήτησης, χωρίς ανάληψη δικαιωμάτων, επεξεργασίας προϊόντων, imports, merges ή αποθέματος άλλων σελίδων.

Before-source scope: μόνο `client/src/components/commerce/InventoryArchivePanel.jsx` για κοινά φίλτρα/κουμπί μετάβασης και `client/src/components/commerce/inventory-archive.css` για το αντίστοιχο responsive πλαίσιο. Επαναχρησιμοποίηση υπαρχόντων VAT department και marginMin/marginMax controls, state και selected-store GET query, χωρίς νέο API ή server αλλαγή. Κατηγορία, υποκατηγορία, Περιγραφή/SKU/Barcode, ενεργά/όλα/ανενεργά, Τμήμα ΦΠΑ/χωρίς τμήμα και Margin από–έως παραμένουν στο ίδιο κατάστημα και επαναφέρουν τη σελιδοποίηση κατά την εφαρμογή. Τα POS capabilities/readOnly/staff permissions, writers, ποσότητες/τιμές, stock/financial/fiscal και οι λοιπές αναθέσεις παραμένουν ανέπαφα.

Έγινε ανάγνωση τρέχοντος AGENTS/COMMON_WORK_RULE, tracker, pending roadmap, ενεργών/ιστορικών checkpoints, αριθμημένης λίστας, εγχειριδίου inventory και σχετικών warehouse checkpoints της 14/11. Το source επιβεβαιώνει ότι το ίδιο component ήδη έχει τα δύο νέα φίλτρα μόνο υπό operatorMode. Το POS layout παρέχεται από το scoped overlay CSS. Το existing USER PASS του POS κουμπιού Φίλτρα προστατεύεται, δεν επαναλαμβάνεται. Δεν βρέθηκε ξεχωριστή τρέχουσα ανάθεση για αυτήν τη γενική parity επέκταση.

Κατάσταση BEFORE SOURCE / NOT TESTED. Η καταγραφή πρέπει να δημοσιευτεί στο main πριν τη συγκεκριμένη αλλαγή κώδικα. Έλεγχοι: υφιστάμενες στοχευμένες δοκιμές archive/filters και build, με συνθετική μη οικονομική επαλήθευση ότι Κεντρική και POS στέλνουν τα ίδια scoped φίλτρα. Καμία παραγωγική αλλαγή δεδομένων, νέα άδεια ή οικονομική δοκιμή. Πραγματική αποδοχή Κεντρικής παραμένει για την κοινή συνεδρία στο τέλος. Source publication/deployment προς τελική έγκριση μετά από συγκεκριμένο ελεγμένο PR.

Checkpoint: `CHECKPOINTS/CHANGES/2026-11-18-central-warehouse-filter-parity.md`.

## 18/11/2026 — NETLINK explicit-store E2E caller correction / AWAITING FINAL CI

Corrected source head `bd0e268f27ea2c5d39a97397e3ad426130fff5cc`, CI `44322976065` / job `134866723229`: full server suite **6178 tests / 6177 PASS / 0 FAIL / 1 optional PGlite SKIP**, plus **8/8 backup-monitor tests PASS**. Native PostgreSQL credentials/migration/HTTP and legacy EFOOD SQL checks passed. Node20 client build, browser pointer/geometry checks, production safety invariants, full isolated archive import and the other four jobs passed. This is CI evidence, not a LAB or deployed feature PASS.

The real HTTP E2E batch reached `netlink-prepaid-flow.mjs` and correctly rejected the old owner catalogue call without storeId: HTTP400 / NETLINK_STORE_REQUIRED, formerly expected200 at line70. Causal correction updates the E2E caller's status/menu URLs to the fixture's explicit selected store, asserts the returned storeId and adds a retained missing-store400/code assertion. Runtime source and all existing auth/licensing/fiscal/idempotency/settlement assertions are unchanged. No global-store fallback or production guard is relaxed. The retained POS header browser fixture also recognizes the selected-store status query when simulating a disabled Netlink module; its prior disabled-module geometry intent is preserved.

Next: exact-head full CI including the corrected existing mock-provider E2E, then review/approved installation and the final common LAB session. No real store, credential, transaction, source merge or production deployment was changed. Same /root owner and source PR #4016.

## 18/11/2026 — NETLINK source CI correction, still AWAITING FULL CI / LAB

First source head `2e2a1054a258c6563d7a0f5941671559b0cfe169`, CI run `44320432551`, full server suite **6176 PASS / 1 FAIL / 1 SKIP**. New native PostgreSQL migration/HTTP/atomic-audit test and ordinary selected-store HTTP test both passed with no skip. All new credential/mounted/scoped tests passed. Existing Windows checks and isolated wholesale browser/offline job passed.

Only failure: retained `store-installation-terminals-v1.test.js` rejects a direct Netlink label in the general PlatformAdminApp installation surface. Causal fix: keep the generic selected-store launcher named «Διασυνδέσεις»; the credential form remains inside its existing integrations dialog. The protective installation test is unchanged. Review also scoped the new transport deadline/redirect restriction to authentication/read-only catalogue calls: existing prepare/execute transport behavior remains intact, with an explicit retained execute assertion. No financial flow was run.

Corrected local Node20 validation: **46 tests / 44 PASS / 0 FAIL / 2 local SQL skips**, including the unchanged installation test; Node20 frontend build PASS (Vite 27.03s, TABLE_SERVICE verifier PASS). The earlier remote native SQL PASS is separate evidence for the first head.

The first head's full suite failure is not hidden by its native SQL PASS. New exact-head full CI/build/E2E is required. No production change, LAB/manual PASS or owner testing requested. Same owner and source PR #4016.

## 18/11/2026 — NETLINK-STORE-CREDENTIALS-01 — SOURCE CANDIDATE / AWAITING CI AND LAB

Owner /root; source branch `codex/netlink-store-connection-source-20261118`. Documentation claim PR #4015 passed its documentation checks and merged `8a9c433329e224011fe5a352ec4057e85a78a4b9` before source edits. This source does not transfer Netlink certification or another page's cash/report work.

Implemented per-store encrypted username/password and Station ID within existing `StoreIntegrationCredential` kind NETLINK. Versioned migration expands the existing kind constraint, preserves MYDATA/VAT_LOOKUP/EFOOD, handles legacy kind-check names and is repeatable. Existing integration bootstrap retains NETLINK on later EFOOD initialization. No new table/columns or ownership/backup layout. Existing lifecycle RESET value guard is deliberately unchanged: configured NETLINK stores remain blocked from an unreviewed fresh-store reset; no destructive credential/reset scope is silently expanded.

Platform Super Admin: existing selected-store integration dialog now includes Netlink save, explicit enable/disable and authentication/catalogue check. Fresh saved connections default disabled. Admin can explicitly run the read-only check while disabled; normal POS requests cannot use disabled/missing connections. Username/password never return in response/status/audit. Saving and its credential audit are one DB transaction. Current `INTEGRATION_CREDENTIALS_KEY` or `PARAMETERS_ENCRYPTION_KEY` is required; do not enter real credentials in chat/repository. Provider app URL/client credentials stay in server environment; no user-supplied outbound URL.

Connector resolves encrypted credentials for the authorized company/store on every operation; no global-credential fallback and no cross-request singleton/token cache. Ordinary status/menu use explicit selected store; STORE_OPERATOR cannot request another store. Same-store refresh, store changes and unmount discard late UI catalogue/report/form responses. Save is serialized; form secrets clear after success. Authentication/catalogue checks have bounded requests and reject redirects; prepare/execute request timeout/redirect behavior remains unchanged. Invalid access tokens are rejected.

Only documented Netlink authentication and GET catalogue are used by the check. It explicitly returns `storeIdentityVerified:false`: no provider report API contract is available in source. MyWorkStation reports remain its own ledger. Before real store activation, compare the requested Station ID to the store's Netlink report as recommended by the provider. No invented report endpoint, prepare/execute, PIN, real charge, production secret/configuration, migration or deployment has been performed.

Protected: ordinary auth/licensing/module mount, demo outbound fence, required issued fiscal receipt, execute lock, fee/product mapping, commission/idempotency and old LAB/USER PASS. Test assertions changed only where the deliberate selected-store string, additive NETLINK kind or extra non-nested form changed; prior behavioral coverage remains.

Validation on Node 20.20.2: targeted Netlink, ordinary selected-store HTTP, mounted React store/unmount/save tests, customer-demo and retained efood suites: **42 tests / 40 PASS / 0 FAIL / 2 SKIP**. The two skips are native PostgreSQL connection/migration/HTTP and legacy EFOOD SQL checks; local environment has no isolated PostgreSQL server, so these remain pending the full CI environment. Frontend `npm run build` PASS on Node20 (Vite 34.93s, TABLE_SERVICE bundle verifier PASS). `git diff --check` PASS. Full exact-head CI/native PostgreSQL/E2E remains pending. No manual/LAB/live functional PASS is claimed.

Remaining: full exact-head CI and native migration/HTTP tests, review/approved source installation with the versioned migration, verify deployed revision, then grouped acceptance in existing MYWORKSTATION LAB. Actual Αχαρνών 309 / Ριζαρείου–Χασόγια credentials, provider report identity, printers and production acceptance remain NOT TESTED. Do not replay real transactions or ask owner to reopen multiple roles for partial tests.

## 18/11/2026 — NETLINK-STORE-CREDENTIALS-01 — ASSIGNED / NOT TESTED

Owner /root, branch `codex/netlink-store-credentials-20261118`. Explicit owner request: implement separate Netlink connection credentials for each selected store, with safe configuration and a non-issuing connection check. Scope does not transfer provider certification, cash reconciliation or another page's work.

Read-only baseline main `31c8c46a221fc465d02c9fb55378d0d11497a690`: NetlinkStoreConfig contains POS product/fee mapping only; client singleton uses global environment credentials. No per-store credential form or provider identity/report verification exists. Existing reports read MyWorkStation's ledger, not a provider statement. Existing Netlink checkpoint and current tracker show provider certification/production acceptance BLOCKED EXTERNAL; no new LAB PASS.

Bounded implementation: encrypted store-bound username/password/Station ID in a versioned migration; Platform Super Admin form within existing selected-store integrations; scoped provider resolution with no global credential fallback for scoped calls; selected-store status/menu requests; safe authentication/catalogue check. Provider report API contract is not present in the repository, so catalogue authentication must not be described as provider-store identity verification. No invented report endpoint, card issuance or charges during checks.

Preserve existing licensing/authentication, demo outbound block, fiscal receipt gates, execute lock, POS product/service mapping, commission, idempotency and all old LAB PASS. Save/disable and check require authorized company/store context; secrets never returned. No production migration, configuration, credentials, transaction, merge/deploy of source or actual store check authorized by this documentation claim.

Acceptance: isolated crypto/storage isolation and HTTP route tests; cross-company/store/operator denials; fresh connection after credential replacement/disable; no token reuse across tenants; UI store-change stale-response protection and build; full exact-head CI. Existing shared LAB and physical provider/store checks remain NOT TESTED until observed. Final user tests are grouped at the end.

This small continuation preserves the oversized historical tracker/roadmap unchanged. Prior tracker: [OPEN_WORK_TRACKER.md](OPEN_WORK_TRACKER.md). Prior roadmap: [PENDING_WORK.md](PENDING_WORK.md). Companion checkpoint: `CHECKPOINTS/CHANGES/2026-11-18-netlink-store-credentials.md`.

## 17/11/2026 — SHIFT-CLOSE-INVOICE-MOBILE-01 — TECHNICALLY LIVE / AWAITING COMMON LAB

Owner approved source merge and publication on 17/11/2026. PR #4011 exact head `0c4f97cc7ea83cc6d1a4d15d3e173351d60c67fa` passed full Node20 CI `44169632000` (all five jobs SUCCESS). Expected-head squash merged `1af6d3173a462cf1f610307db14af5202a5cbf04`. Main retains the unrelated #4010 table-service documentation; runtime source matches the reviewed candidate. Full combined-main CI `44172996676` also passed all five jobs. No required check was bypassed or manually replaced.

Ordinary guarded deploy workflow `44174787012` SUCCESS triggered the existing Render service `srv-d9isenfavr4c73bdh52g` in confirmed workspace `tea-d9ie26vaqgkc739uudqg`. Deploy `dep-dbubvtl6e07s73f5m69g`, trigger deploy_hook, became LIVE exact `1af6d3173a462cf1f610307db14af5202a5cbf04` at 17Nov2026 21:00:08.487877 UTC / 23:00:08 Athens. Previous healthy revision `e4210cf93987596cb0ec59cb4daefd1f399fc386` was independently observed before release. No manual redeploy, service/plan/configuration change, rollback, credential change or financial action.

Independent no-cache GET /api/health at 21:00:43.905797 UTC and 21:02:59.144401 UTC returned HTTP200 / ok=true / exact new revision. The public application HTML also responded and references `/assets/main-g2A23gbV.js`. This proves technical installation, not authenticated invoice/POS/device acceptance.

Post-live observation: the new instance emitted connection-pool/transaction timeouts during its first minute, including cash-control/auth/FTEXT and the existing invoice worker. These were real observations, not ignored successes. An initial follow-up log query from 21:01:30 UTC returned zero error-level entries. A later query showed only the separately retained TABLE_SERVICE/Online module-denial messages already present before rollout; no new database timeout was observed in that follow-up window. HTTP 21:02 bucket had 8x500, 11x503, 13x499; the 21:03 bucket had 0x500, 1x503 and 0x499, with 220x200 (partial/latest measurement); 1x503 per minute also existed before rollout. CPU/memory showed no process resource exhaustion. Recovery was observed, but the cause is NOT DIAGNOSED and a long-term performance claim is not made. No pool-size/timeout/role/module settings or business records were changed for diagnosis.

Scope installed: QR mobile photo transfer and camera capture on both missing-invoice acquisition paths; safe selected-store/payment/fingerprint fencing and exact retry; NFD normalization of stored invoice numbers in existing payment lookup, preserving all supplier/company/store/type/reversal/full-number/amount guards and the 0.05 EUR tolerance.

Remaining acceptance belongs in the owner's final shared session on the existing LAB: physical phone QR multi-page transfer, camera photo, connection to one existing unpaid-document obligation/original payment, refreshed pending close state, and retained no-double-payment behavior. No actual supplier invoice/payment/shift-close replay, new stock/fiscal operation or new LAB/USER/PASS manual claim occurred. Source implementation and technical release are complete; functional acceptance remains NOT TESTED. Keep original invoices/payments; do not repay the real invoice to test recovery.

Evidence: PR https://github.com/xrhstosmanis-design/myworkstation-app/pull/4011 · main CI https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44172996676 · guarded release https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44174787012 · Render https://dashboard.render.com/web/srv-d9isenfavr4c73bdh52g/deploys/dep-dbubvtl6e07s73f5m69g .

## 17/11/2026 — SHIFT-CLOSE-INVOICE-MOBILE-01 — source candidate / AWAITING CI AND LAB

Approved assignment #4008 merged `0a1e6f4`; causal amendment #4009 merged `be6c767` before their source edits. Source candidate is based on `be6c767`. Owner remains /root. No deployment or live financial operation performed.

Implemented shared QR mobile-photo reception, camera capture and page management in both the plain pending-invoice panel and the upper FAST_PAYMENT_WITHOUT_DRAFT close recovery form. Each acquisition is fenced to store, API, selected original payment and fingerprint; cancellation, replacement and unmount reject late uploads/streams. Preserve one PDF or up to five photos and existing 6.5 MB total limits. Submission is explicit, serialized and reuses prepared original bytes after an uncertain response. Confirmed handoff refreshes close pending state; plain capture remains without AI, existing fast recovery retains its guarded AI/draft semantics.

Root cause reproduced in isolated PostgreSQL: JavaScript invoiceToken deaccented Greek, but the SQL lookup discarded the accented letter itself. Synthetic number `ΆνευΧ-12345` could not find its own payment. SQL now applies NFD normalization before uppercase/filtering, matching JavaScript. The before regression had 6 failures; the corrected native Unicode suite and retained pending-invoice fixture all pass. Company/supplier/store/type/reversal/full-number/amount guards and the existing 0.05 EUR tolerance remain unchanged. No production repair, re-payment, historical replay, stock/fiscal action or shift-close bypass.

Local validation (Node 24.22.1):
- 67/67 protected tests PASS, 0 failed, 0 skipped: invoice-payment-reuse-v1, pos-fast-handoff-recovery-v1, pos-pending-invoices, pos-pending-invoices-ui and new pos-pending-invoices-mobile-ui.
- 33/33 isolated native PostgreSQL 18.6 tests PASS, 0 failed, 0 skipped: new invoice-payment-unicode-postgres plus retained pos-pending-invoices-postgres.
- Initial retained native fixture ran with the embedded server's Europe/Athens timezone and had three dependent assertion failures. The unchanged fixture passed when the isolated server was configured to UTC, matching its expected test environment. No assertion, timeout or skip was relaxed.
- `npm run build` PASS, Vite 10.64s; TABLE_SERVICE bundle verification PASS. `git diff --check` PASS.

Hosted LAB and physical mobile/camera acceptance remain NOT TESTED, to join the user's final common test session. Source merge/deployment requires the owner's approval; only documentation claims have been approved for merge so far. Next: full exact-head Node20 CI, review the source PR, then approved installation and the final shared LAB session. Do not ask the user to repeat the real supplier payment.

## 17/11/2026 — SHIFT-CLOSE-INVOICE-MOBILE-01 — causal amendment before source

User screenshot reports paid invoice recovery rejected by fast-handoff despite the pending close row. The upper FAST_PAYMENT_WITHOUT_DRAFT recovery form is distinct from the plain pending panel. Read-only source diagnosis: invoiceToken removes NFD combining marks, while findInvoicePayment SQL currently uppercases then drops non-range characters, losing precomposed accented Greek letters. Synthetic reproduction target: ΆνευΧ-12345. This is a suspected cause pending native PostgreSQL proof, not a repair of live data.

Same /root owner and branch; extend the bounded source scope to `client/src/components/store/StoreShiftClosePanel.jsx` (FastPaymentDraft acquisition and stale response guards only), `server/src/lib/invoice-payment-reuse.js` (lookup normalization only), new `server/test/invoice-payment-unicode-postgres.test.js`, and existing `server/test/invoice-payment-reuse-v1.test.js` (normalization regression only). Retain originally claimed pending panel and new mobile UI test. Reuse the same acquisition UI in both close attachment paths, without changing close/PIN guards, payment identity, supplier/store/type/reversal/amount checks, AI route semantics or financial state. Existing invoice/payment and shift owners retain all other scope.

Required before completion: native accented/decomposed Greek lookup matching and rejection boundaries, protected payment reuse/handoff/pending tests, mounted QR/camera scenarios on both close paths, build and full CI. One original payment, no duplicate charge, no live financial repair, no historical replay, no close bypass. This amendment must merge before the newly added source paths are edited. Final functional LAB remains in the common session and NOT TESTED.

## 17/11/2026 22:08 EET — SHIFT-CLOSE-INVOICE-MOBILE-01 — proposed independent assignment /root

Branch `fix/shift-close-expense-mobile-20261117`, base `e4210cf`. User requests QR photo transfer from mobile and camera acquisition when attaching a missing invoice at shift closure, matching the existing POS payment flow. Status: CLAIM PREPARED; source and hosted LAB NOT TESTED. Claim must land on main before source edits under AGENTS.md. Existing invoice, cash, PIN, scanner, myDATA and role owners remain retained.

Bounded proposed source scope: `client/src/components/store/StorePendingInvoicePanel.jsx` and new `server/test/pos-pending-invoices-mobile-ui.test.js` only. Reuse existing `useMobileDocumentPhotos`, `MobileDocumentPhotosQr`, camera acquisition helpers and document photo bundling unchanged. Do not edit shared close/PIN, backend routes, payments, AI/OCR, mobile upload service or other assigned files. Bind each mobile/camera session to the selected store/payment/fingerprint; cancel on selection, store/API change, cancellation, unmount and submission. Preserve up to five pages, current attachment limits, plain capture, original payment identity, durable confirmation and safe exact retry. Automatic pending-list/close refresh only after confirmed attachment.

Acceptance preparation: mounted component checks for mobile multi-photo reception and upload against original pending payment, camera capture, stale async responses after store/payment switch, cancellation, limits, duplicate-submit suppression and failed-upload retry. Run existing pending UI/service regressions and client build. Hosted existing LAB acceptance belongs in the final shared session; no repeated payment or unmeasured shift close. No implementation, deployment, new functional PASS or financial action is claimed here.

Checkpoint: `CHECKPOINTS/CHANGES/2026-11-17-shift-close-invoice-mobile.md`.

## 17/11/2026 — POS-PACK-STOCK-01 / POS-SCAN-RETURN-01 — DEPLOYED / AWAITING GROUPED LAB

Owner /root; source branch `feat/pos-packs-cash-returns`; PR #4006. Claims #4001/#4005 are merged. Distinct store-priced package sale products consume linked base units (24/6), and direct scanned customer returns atomically restore stock and reduce only current-terminal cash, with audit/replay/cancel protection. Original card totals and existing fiscal/return/permission gates are preserved. No production data or fiscal/provider action was run.

Node 20.20.2 / isolated PostgreSQL 18.6: **25 PASS / 0 FAIL / 0 SKIP**, including the complete 26,656-product read-only catalog and existing cancellation/baking controls. Frontend build PASS. PR CI 44170419099 passed (6,113/0/0). Approved PR #4006 merged as a7bb1c4c00662118dc0c5e794172ca6e3817b0d2; main CI 44183245449 attempt 2 passed (6,170 PASS / 0 FAIL / 1 SKIP + 8 backup-monitor PASS). Guarded Render deployment 44188819828 succeeded; public health confirms the exact merged revision. Real LAB remains pending. User acceptance is one grouped Owner → POS → final Owner review session at the end; no repeated role switching requested now.

Release checkpoint: `CHECKPOINTS/CHANGES/2026-11-17-pos-packs-cash-returns-release.md`. Implementation and complete validation history: `CHECKPOINTS/CHANGES/2026-11-17-pos-packs-cash-returns-implementation.md`. Foundation history remains in `CHECKPOINTS/CHANGES/2026-11-17-pos-package-cash-return-foundation.md`. Scope/pending acceptance: `docs/roadmap/POS_PACKS_RETURNS_2026-11-17.md`; evidence `CHECKPOINTS/EVIDENCE/pos-packages-cash-return-20261117/local-validation.json`. Other owners remain unchanged. This update edits only this module's existing row so independent pages may continue prepending their own updates without a shared-prefix conflict.

- 2026-11-17 · Νο 15 TABLE_SERVICE · Κινητό, μεταφορά, ένωση και διαίρεση λογαριασμού · [Checkpoint](CHANGES/2026-11-17-table-service-account-operations.md) · #3998 / e4210cf · main CI 6105 PASS + 8 recovery, guarded LIVE 22:26 Αθήνας · κοινή φυσική αποδοχή LAB εκκρεμεί.

# MyWorkStation — Μικρό ενεργό μητρώο βοηθών

- 2026-11-17 · 13–14 · Διόρθωση ιστορικού κόστους και επισκόπηση εκκρεμών αγορών · [Checkpoint](CHANGES/2026-11-17-no13-no14-batch-source.md) · Τοπικοί έλεγχοι, CI και κοινή αποδοχή LAB σε συνέχεια.

- 2026-11-17 · Νο 13 · LAB PASS για CSV και εκτυπώσιμη προβολή «Χωρίς ΦΠΑ» στο c19e099 · [Checkpoint](CHANGES/2026-11-17-no13-csv-vat-scope.md) · PDF, φυσική εκτύπωση και υπόλοιπο 13–14 ανοιχτά.

- 2026-11-17 · Νο 7 CASH-UNIFIED-AUDIT-15 · Ημερήσια αυτόματη αναφορά με ελεγμένα ευρήματα · [Checkpoint](CHANGES/2026-11-17-daily-cash-delivery-evidence.md) · 43 τοπικοί έλεγχοι PASS, CI και LAB εκκρεμούν.

- 2026-11-17 · Νο 27 · Κεντρική Διαχείριση και σελίδα Ιδιοκτήτη · [Checkpoint](CHANGES/2026-11-17-no27-central-owner.md) · Τοπική υλοποίηση στο `work/no27-central-owner`, 96 συνδυασμένοι τοπικοί έλεγχοι και build PASS · CI και LAB εκκρεμούν.

- 2026-11-17 · #23 TABLE_SERVICE · Ενιαίο συνθετικό HTTP E2E · [Checkpoint](CHANGES/2026-11-17-table-service-combined-ci.md) · CI και hosted LAB εκκρεμούν.

- 2026-11-17 · [Ιστορικό κόστος από αρχική γραμμή αγοράς](CHANGES/2026-11-17-sales-report-original-pack.md) · Εκκρεμούν CI και LAB.

- 2026-11-17 · #23 TABLE_SERVICE · Μερική πληρωμή μετρητών LAB · [Checkpoint](CHANGES/2026-11-17-table-service-partial-cash-lab.md) · CI PASS στο f572ff9, λειτουργική δοκιμή εκκρεμεί.

- 2026-11-16 · #23 TABLE_SERVICE · Χρέωση επιλογών στον γύρο · [Checkpoint](CHANGES/2026-11-16-table-service-modifier-prices.md) · Draft, CI PASS στο 4a45dd39, μερική πληρωμή και LAB εκκρεμούν.

- 2026-11-17 · Ιστορικό κόστος Στατιστικών Πωλήσεων · [Checkpoint](CHANGES/2026-11-16-sales-report-pack-cost.md) · PR #3969 · LAB NOT TESTED.

- 2026-11-16 · #23 TABLE_SERVICE · Αλλαγή σερβιτόρου σε ανοιχτό τραπέζι · [Checkpoint](CHANGES/2026-11-16-table-service-waiter-assignment.md) · CI/LAB εκκρεμούν.

- 2026-11-16 · #28 · Μικτή επιλογή αποθήκης από εξουσιοδοτημένο χειριστή · [Checkpoint](CHANGES/2026-11-16-backoffice-staff-stock-line-exclusions.md) · AWAITING LAB.

- POS εσωτερική διακίνηση · Διόρθωση αναγνωριστικού χειριστή στην κίνηση αποθέματος · [Checkpoint](CHANGES/2026-11-16-pos-transfer-minimize-lab.md) · LAB επαναδοκιμή εκκρεμεί.

- 2026-11-17 · Νο 9 · Αυτόματα email προσφορών και απογραφής · [Checkpoint](CHANGES/2026-11-17-promotion-result-email.md) · Προσφορές CI 5/5, προστέθηκαν απογραφή και lifecycle, ενιαίο CI και τελικό LAB εκκρεμούν.
- 2026-11-18 · 7–9 · Κεντρική οθόνη προετοιμασίας αναφορών · /root · fix/report-event-installation-ui-20261118 · [Checkpoint](CHANGES/2026-11-18-report-event-installation-ui.md) · Συνέχεια #4000/#4021: UI και reports-only συμβατότητα εννέα πραγματικών πινάκων, strict hosted preflight PASS, native εγκατάσταση/CI σε εξέλιξη· hosted SQL/profile και επιχειρησιακή αποδοχή OPEN.
- 2026-11-18 · 7–9 · Canonical session installer · /root · fix/report-installer-backoffice-session-20261118 · [Checkpoint](CHANGES/2026-11-18-report-installer-backoffice-session.md) · Real central preflight403 λόγω BACKOFFICE_USER, περιορισμένη διόρθωση τύπου συνεδρίας με ίδιους role/session ελέγχους· hosted SQL ακόμη OPEN.
- 2026-11-18 · 7–9 · Strict έξι στήλες εγκαταστάτη V2 · /root · fix/report-installer-column-compatibility-20261118 · [Checkpoint](CHANGES/2026-11-18-report-installer-column-compatibility-v2.md) · Νέο αμετάβλητο προφίλ,8 Node+14 Python+3 strict/WASM+4 native PASS χωρίς FAIL/SKIP· hosted κατάλογος συμφωνεί· CI/εγκατάσταση/αποστολή OPEN.

**Κατάσταση:** ΕΝΕΡΓΟ ΜΙΚΡΟ ΜΗΤΡΩΟ CI από το merge #3719 — το OPEN_WORK_TRACKER.md παραμένει authoritative για ownership/PASS.

- Εσωτερική διακίνηση POS · Συμβάντα · [Checkpoint](CHANGES/2026-11-15-pos-internal-transfer.md) · LAB NOT TESTED. Καρτέλα POS με ελαχιστοποίηση σε προετοιμασία.

- 2026-11-15 · Εσωτερική διακίνηση POS · [Checkpoint](CHANGES/2026-11-15-pos-internal-transfer.md) · LAB NOT TESTED.

Σκοπός: σύντομες, συχνές ενημερώσεις ανά εργασία χωρίς συνεχή επεξεργασία του μεγάλου `CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md`.

- 2026-11-16 · Υπόλοιπα προμηθευτών · [Checkpoint](CHANGES/2026-11-16-supplier-balance-payment-review.md) · PR #3921 · LAB εκκρεμεί.

- 2026-11-15 · BackOffice τιμολόγηση με όλα τα είδη στην αποθήκη · [Checkpoint](CHANGES/2026-11-15-backoffice-invoice-stock-selection.md).

- 2026-11-14 · Επιλογή δικαιωμάτων BackOffice ανά κατάστημα · [Checkpoint](CHANGES/2026-11-14-backoffice-store-permission-selection.md).

- 2026-11-14 · Δικαίωμα επαναφοράς οριστικοποιημένου τιμολογίου · [Checkpoint](CHANGES/2026-11-14-staff-invoice-reopen.md).

- 2026-11-14 · Πλήρης καρτέλα υπευθύνου · [Checkpoint](CHANGES/2026-11-14-staff-full-product-card.md).

| Προτεραιότητα | Εργασία | Υπεύθυνος | PR / issue | Τρέχουσα κατάσταση | Επόμενο βήμα |
| --- | --- | --- | --- | --- | --- |
| 1 | Προσθήκη γραμμής από υπεύθυνο | /root | #3828 | Ενεργό στο Render · LAB PASS για προσθήκη σε πρόχειρο | [Αποτέλεσμα δοκιμής](CHANGES/2026-11-12-staff-invoice-add-line.md) |
| 1 | POS-MYDATA-QR-LEARNING-01 | Ενεργός χειρισμός τιμολογίων POS / myDATA | #3823 | [Κεντρική εκμάθηση επαληθευμένου QR ανά εταιρεία, ΑΦΜ προμηθευτή και τύπο παρόχου](CHANGES/2026-11-11-pos-mydata-qr-learning.md) · source candidate, όχι εγκατεστημένο / LAB NOT TESTED | Πλήρες CI, επαλήθευση στο υπάρχον LAB και δοκιμή πραγματικού scanner χωρίς νέα πληρωμή |\n| 1 | Επιμερισμός ΕΦΚ ανά τεμάχιο | Τιμολόγια προμηθευτών | #3820 | [Τοπικός έλεγχος προεπισκόπησης, καταχώρισης και περιθωρίου](CHANGES/2026-11-11-invoice-excise-per-piece.md) | Πλήρες CI και φιλοξενούμενη δοκιμή |
| 0 | POS shift close with invoice draft recovery | Current POS work | — | [Local candidate](CHANGES/2026-11-10-pos-shift-invoice-draft-guard.md), focused 19 PASS and isolated native PostgreSQL 24 PASS | CI and existing LAB validation |
| 0 | INVOICE-OWNER-FINALIZATION-01 (#28) | Εγκεκριμένη υλοποίηση / παράλληλος πιλότος Claude | #2705, #3715, #3725, #3726, #3727, #3728, #3729 | [Υλοποίηση #3727](CHANGES/2026-11-08-invoice-owner-posting.md), 81 τοπικοί έλεγχοι. Χωριστός πιλότος Claude | 5.959 δοκιμές server πέρασαν. Διορθώθηκε το fixture του καταλόγου. Νέο CI και LAB πριν από πραγματικό παραστατικό; Claude preview lineAudit #3731 merged (CI PASS); BackOffice lineAudit UI #3737 merged (CI PASS, LAB NOT TESTED); Claude workflow scope fix #3741 MERGED (CI PASS); [server cancel step](CHANGES/2026-11-08-invoice-owner-finalization-cancel.md) Claude native-DB 11/11 on initial commit; coordinator added terminal CANCELLED guards and tests; #3743 exact-head CI #9501 PASS; LAB NOT TESTED; BackOffice owner cancel dialog UI #3746 Draft, exact-head CI/LAB pending |
| 0 | INVOICE-OWNER-FINALIZATION-01 / Two-page assistant reopen | Retained #28 owner | #3727 | [Isolated test 2/2 PASS](CHANGES/2026-11-08-invoice-assistant-reopen-two-page-isolated.md) | Hosted LAB pending |
| 0 | INVOICE-OWNER-FINALIZATION-01 / BackOffice multi-photo intake | Retained #28 owner | #3775 | [Dispatch correction](CHANGES/2026-11-09-backoffice-multi-photo-dispatch-fix.md) | Hosted selector and same draft reopen passed; second photo missing in Assistant; loader deployed; hosted replay exposed legacy create interceptor; [#3790 hosted: 2/2 read, draft creation rejected](CHANGES/2026-11-10-backoffice-invoice-reviewed-source.md); [#3804 hosted: draft and return verified, second photo missing](CHANGES/2026-11-10-backoffice-invoice-page-transport.md); [#3807 hosted LAB PASS: both originals after return](CHANGES/2026-11-10-backoffice-invoice-two-page-lab-pass.md); [repeated-code price correction](CHANGES/2026-11-10-invoice-repeated-code-line-prices.md) [LAB preview PASS](CHANGES/2026-11-12-invoice-repeated-code-lab-pass.md) |
| 1 | AUTO-REPORT-OBSERVABILITY-01 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #2704 | Preview verified; email delivery NOT TESTED | Verify recipients and controlled send |
| 1 | OCR-CONFIDENCE-01 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #3706, #3709 | Code merged; hosted LAB NOT TESTED | LAB confidence and multipage checks |
| 2 | INVOICE-HEADER-LATENCY / σύγκρουση ποσών σε φωτογραφίες | /root | #3688, #3732, #3733 | Hosted LAB PASS for payable order and review prompt | Physical POS, real-photo repeatability, invoice number and issuer VAT remain open |
| 2 | INVOICE-HEADER-LATENCY / μοναδικό ανεπιβεβαίωτο πληρωτέο | /root | #3688, #3777, #3787 | VAT table payable check implemented and tested locally | Awaiting CI and real-photo LAB retest |
| 2 | INVOICE-HEADER-LATENCY / αριθμός από πολλαπλές φωτογραφίες | /root | #3688, #3739, #3740 | Hosted LAB PASS for number agreement and conflict review | Single candidate proof, real-photo accuracy, issuer VAT and physical POS remain open |
| 2 | INVOICE-HEADER-LATENCY / ΑΦΜ προμηθευτή από φωτογραφίες | /root | #3688, #3748, #3750 | Hosted LAB PASS for VAT agreement and conflict review | Lone candidate, real photos and physical POS remain open |
| 2 | INVOICE-HEADER-LATENCY / ΑΦΜ εκδότη και παραλήπτη | /root | #3688, #3755, #3756 | Hosted LAB PASS for same-VAT review and distinct-VAT control | Unknown or unrelated VAT misread, real photos and physical POS remain open |
| 2 | AI-WALLET-HISTORY-02 | υπάρχουσα ανάθεση — επιβεβαίωση tracker | #3713 | Draft; LAB NOT TESTED | Scoped LAB acceptance |
| 0 | FTEXT-STATUS-ORPHAN-01 / CMD option 9 | retained FTEXT recovery owner | #3695, #3721, #3724 | Source d6fc7958 CI 6/6 PASS; source branch rebased, exact-head CI pending; physical NOT TESTED | Verify native PS5.1 and full PR CI; merge approved by owner; separate approval required for PC install |
| — | Claude automation | Συντονιστής | #3714, #3716, #3717, #3718, #3719 | Compact registry merged in #3719; isolated policy tests PASS in #3718; old central CI #9416 FAIL | Read-only Claude pilot #2 PASS per owner screenshot; invoice write pilot #3725 merged; run #42504018843 Claude step succeeded, git push auth failed; auth fix #3726 merged; push trigger merged #3728 but run not observed; issue-comment trigger proposed; line-audit step on owner reopen added (CI/LAB NOT TESTED, see CHANGES/2026-11-08-invoice-owner-finalization-line-audit.md) |
| 1 | CASH-UNIFIED-AUDIT-15 | retained cash owner | #3708, #3711, #3712, #3736 | Personal preview, one native send and inbox delivery PASS; financial HOLD | [Delivery receipt](CHANGES/2026-11-08-cash-personal-test-delivery.md) · [Layout #3745: production preview PASS; new-layout delivery NOT TESTED](CHANGES/2026-11-09-cash-owner-email-layout-preview.md) · [Readable evidence candidate](CHANGES/2026-11-09-cash-owner-report-readable-evidence.md) · [Return evidence candidate](CHANGES/2026-11-10-cash-return-evidence.md) · [Return preview PASS; paper scope candidate](CHANGES/2026-11-10-cash-paper-report-scope.md) · [Complete evidence claim](CHANGES/2026-11-10-cash-complete-evidence-claim.md) · [Reading reasons candidate](CHANGES/2026-11-10-cash-paper-reading-reasons.md) · [EFTPOS slip difference](CHANGES/2026-11-10-cash-eftpos-slip-difference.md) · [Netlink shift ledger](CHANGES/2026-11-10-cash-netlink-shift-ledger.md) · [Netlink slip comparison](CHANGES/2026-11-10-cash-netlink-slip-comparison.md) · [Selected paper preparation](CHANGES/2026-11-10-cash-selected-paper-preparation.md) · [Automatic cash search UI candidate](CHANGES/2026-11-14-automatic-cash-search.md) |
| — | PLATFORM-COMPANY-LAYOUT-02 | Συντονιστής | #3734 | Chromium layout fixture PASS στα 1920, 1024 και 390 px. `wholesale-isolated-lab` PASS στο CI #9481 | Πλήρες CI στο νέο commit και έλεγχος με σύνδεση πριν από δημοσίευση. [Checkpoint](CHANGES/2026-11-08-platform-company-layout-compact.md) |

| 1 | INVENTORY-RECONCILIATION-01 | retained /root | #3693, #3696, #3645 | FREE/FREE two-code comparison, PDF and XLSX: scoped LAB PASS | Cross-code identity, physical warehouse/time and verified originals remain open |
| — | Invoice stock selection after stocktake | Συντονιστής | #28 | Δύο απομονωμένα σενάρια τιμολόγησης και ακύρωσης πέρασαν | Πλήρες CI και λειτουργικός έλεγχος στο υπάρχον LAB. [Checkpoint](CHANGES/2026-11-10-invoice-stock-selection.md) |
| — | Invoice stock exclusion email | Συντονιστής | #3785 | Local queue and retry simulation | Full CI and LAB SMTP pending. [Checkpoint](CHANGES/2026-11-10-invoice-stock-exclusion-email.md) |
| — | INVENTORY-CATALOG-XLSX-01 | /root | #3798, #3801 | [Ανάθεση](CHANGES/2026-11-10-inventory-catalog-xlsx.md) · Υλοποίηση σε branch, LAB NOT TESTED | CI και δοκιμή XLSX όλων/επιλεγμένων στο υπάρχον LAB |
| — | STORE-CATALOG-APPEND-XLSX | /root | #3811, #3813 | Hosted LAB PASS · 1 νέο είδος · επαλήθευση και με τα δύο barcode | [Τεκμήριο](CHANGES/2026-11-10-store-catalog-append.md) |
| — | OWNER-SHIFT-TIME-FILTER | /root | #3872 | Hosted LAB PASS · 3→1 | [Τεκμήριο](CHANGES/2026-11-10-owner-shift-time-filter.md) |
| 1 | Email delivery history | /root · feat/email-delivery-history | #3793 | IN REVIEW · SMTP evidence and store history | [Checkpoint](CHANGES/2026-11-12-email-delivery-history.md) |

## Κεντρικός συντονισμός σελίδων — 13/11/2026

Η παρούσα σελίδα συντονισμού αναλαμβάνει τη συνέχεια του «Ελέγχου αναθέσεων εκκρεμοτήτων». Οι υπεύθυνοι των ήδη ανατεθειμένων εργασιών παραμένουν στις εγγραφές τους στο OPEN_WORK_TRACKER.

**Υποχρεωτικό για όλες τις ανατεθειμένες σελίδες:** Κάθε σελίδα καταγράφει την πρόοδο στο `CHECKPOINTS/ACTIVE_WORK_2026.md` στον κλάδο εργασίας της και τη συμπεριλαμβάνει στο PR της. Μετά από κάθε ουσιαστικό βήμα γράφει σύντομη ενημέρωση με ώρα Ελλάδας, όνομα σελίδας, εργασία, υπεύθυνο και branch, αποτέλεσμα ανά δοκιμή (PASS / FAIL / NOT TESTED), σύνδεσμο και ακριβές commit για CI ή LAB, εκκρεμότητα και επόμενο βήμα. Τα αναλυτικά τεκμήρια συνδέονται από `CHECKPOINTS/CHANGES/`. Ο συντονιστής διασταυρώνει τις ενημερώσεις και επιλύει επικαλύψεις. Αλλαγή υπευθύνου απαιτεί ονομασμένη παράδοση και ενημέρωση του OPEN_WORK_TRACKER. Ένα PASS καλύπτει το σενάριο που δοκιμάστηκε.

| Ομάδα από την προηγούμενη σελίδα | Επιβεβαιωμένη κατάσταση | Επόμενο βήμα |
| --- | --- | --- |
| Τιμολόγια και POS | [#3844](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3844) merged, 3/3 τοπικοί έλεγχοι αντιστοίχισης. [#3822](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3822) merged για κενά πρόχειρα myDATA. | Επιβεβαίωση του QR POS σε υπάρχον LAB με επαληθευμένο παραστατικό και τεκμήριο. |
| Απογραφή | [#3841](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3841) draft, CI 4/5 με αποτυχίες PostgreSQL restore. [#3771](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3771) CI PASS στο `81afd657`, εκκρεμεί συγχρονισμός με main. [#3858](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3858) draft με τεκμήριο LAB για κίνηση αγοράς +2. | Απομόνωση αποτυχιών, συγχρονισμός, δοκιμές στο υπάρχον LAB. Full Audit: επαλήθευση πρωτοτύπου myDATA και πραγματικής ώρας φυσικής παραλαβής. |
| Email και απόδοση | [#3793](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3793) και [#3834](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3834) merged. [#3827](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3827) ανοικτό για polling, SQL και μετρήσεις HTTP. | Τεκμήριο πραγματικής παραλαβής email και μετρήσεις πριν/μετά στο υπάρχον LAB. |

### Πρώτος έλεγχος συντονισμού — 13/11/2026 22:18 ώρα Ελλάδας

- Κεντρικός συντονισμός · [PR #3860](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3860): [CI #9823 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43499363517) στο `ee6627a0`. Εκκρεμεί ενσωμάτωση του κοινού κανόνα στο main και επιβεβαίωση ενημερώσεων από τους υπεύθυνους.
- Απογραφή · #3841: [CI #9770 FAIL](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43300522469) στο `3acf060c`, με αποτυχίες PostgreSQL restore. Το GitHub τώρα το δείχνει mergeable. #3771: [CI #9573 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/42631870100) στο `81afd657`, παραμένει μη mergeable. #3858: τεκμήριο LAB στο branch, εκκρεμεί CI στο `83619dd0`.
- Email και απόδοση · #3827: [CI #9735 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43104586861) στο `9fd6067e`, η εγγραφή του branch αναφέρει ακόμη CI PENDING. Παραμένει μη mergeable. Εκκρεμούν οι μετρήσεις LAB και το τεκμήριο παραλαβής email.
- Τιμολόγια και POS · Ο κλάδος του #3844 έχει το ενεργό μητρώο. Εκκρεμεί εγγραφή του ελέγχου QR POS με τεκμήριο LAB.

### Διασταύρωση νεότερων τεκμηρίων — 13/11/2026

- Τιμολόγια · Το [#3853](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3853) είναι merged. [CI #9805 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43485507790) στο `d815bee1`. Η διαγραφή του κωδικού προμηθευτή κατά την αποθήκευση barcode τεκμηριώνεται στο [checkpoint](CHANGES/2026-11-13-invoice-clear-supplier-code.md). Για τα τρία είδη χρειάζεται έλεγχος της πραγματικής αντιστοίχισης και του αποθηκευμένου barcode ανά γραμμή. Η συγχώνευση του κώδικα δεν τεκμηριώνει τις τρεις καταχωρίσεις.
- Συντονισμός · [CI #9824 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43500322685) στο `98ae7b95`. Ο έλεγχος ταξινόμησης και οι δύο έλεγχοι Windows πέρασαν. Τα `build-and-test` και `wholesale-isolated-lab` παραλείφθηκαν. Η καταγραφή στο main και οι ενημερώσεις από τις υπόλοιπες σελίδες παραμένουν προς επιβεβαίωση.

### Οριστικοποίηση τιμολογίου και διάγνωση CI — 13/11/2026

- Τιμολόγια · Ο ιδιοκτήτης επιβεβαίωσε από τη σελίδα «διορθώσεις τιμολογίων κτλπ» ότι οριστικοποίησε το τιμολόγιο και είναι ΟΚ. Η οριστικοποίηση κλείνει ως επιβεβαίωση χειριστή. Δεν υπάρχει ανεξάρτητο τεκμήριο για τις τρεις τιμές barcode ανά γραμμή.
- Απογραφή · Η διασταύρωση των workflow στο `3acf060c` (#3841) και στο `main` έδειξε διαφορά στο βήμα recovery: το branch χτίζει το image από το προεπιλεγμένο Dockerfile, ενώ το main περνά σταθερό digest PostgreSQL 18 και σταθερό digest για την υπηρεσία PostgreSQL 16. Ο επόμενος έλεγχος είναι CI με το workflow του main ώστε να διαπιστωθεί αν υποχωρούν οι αποτυχίες restore του #9770, πριν από την αποδοχή στο LAB. Η αιτία δεν έχει επιβεβαιωθεί με εκτέλεση.
- Συντονισμός · [CI #9825 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43500654258) στο `34896706` του #3860. Το PR έχει mergeable status και παραμένει draft.

## Κανόνας ενημέρωσης

10/11/2026 — #3786 store-only editor and two-store POS catalog CI pass carried onto current main. New exact-head CI and complete LAB pending.

1. Κάθε βοηθός αλλάζει μόνο τη δική του γραμμή και προσθέτει μικρό checkpoint στο `CHECKPOINTS/CHANGES/`.
2. Διατηρείται το `docs/roadmap/OPEN_WORK_TRACKER.md` ως authoritative πηγή για ownership, acceptance και τελικό PASS, μέχρι ρητή και ελεγμένη αλλαγή των οδηγιών.
3. Το μεγάλο `KAT_ACTIVE_LIST_2026-09-05.md` **δεν διαγράφεται, δεν συμπτύσσεται και δεν αντικαθίσταται**.
4. Με το merge #3719 ενημερώθηκαν validator, tests και AGENTS.md: το CI απαιτεί πλέον το μικρό μητρώο και νέο checkpoint για αλλαγές κώδικα/ρυθμίσεων.
5. Όλοι οι έλεγχοι και τα τεκμήρια παραμένουν υποχρεωτικά· το μικρό μητρώο δεν αποτελεί παράκαμψη checkpoint gate.

Ενημέρωση: 2026-11-08 — αρχικό μικρό μητρώο / migration draft.

Τεκμήριο #28 / test-only PR #3749 (2026-11-08): απομονωμένη HTTP + PostgreSQL ακύρωση BackOffice εκτελέστηκε PASS στο CI #9526 (old SHA `2421d979`, 5/5 jobs, 5.978 server tests, 0 skipped). Απαιτείται νέο exact-head CI μετά τη συμφιλίωση. Hosted LAB: NOT TESTED· #28: OPEN.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / QR/PIN Enter and +1 per scan. Retained owner /root. [Scope and next steps](CHANGES/2026-11-09-inventory-link-scan.md). Separate LAB acceptance pending.
09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / #3702 same-draft product attachment: main CI and scoped staff LAB PASS. Owner confirmed temporary create-grant removal.

Source `5cfa4d9d` published on the scoped branch. Synthetic handler check verified repeated and alternate barcode, different-item protection, one save on repeated Enter, additive total and reset. Exact PR CI and physical scanner LAB remain pending.

QR/PIN count correction implemented in `5099e0dc`. Focused arithmetic check passed for 7 → 5, 7 → 9, 7 → 0 and additive 7 + 5 → 12. Full CI and live acceptance pending.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / exact existing barcode store assignment implemented through `eff05d16`. Explicit assignment, scoped active grant and draft lock, existing records preserved. CI and live Rizareio verification pending.

09/11/2026 — QR/PIN product creation checks exact barcode duplicates within the stocktake company. Production read-only diagnosis confirmed two outside-company matches and no same-company match for 52016165. CI and live acceptance pending.

## 09/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01

Personal inventory detail pages and stocktake-wide exact barcode/SKU lookup. Frontend build, 28 mounted UI tests and local HTTP/Express + PGlite integration passed. Exact CI and authenticated LAB acceptance pending. Retained ownership and all-functions scope stay open.

09/11/2026 — INVENTORY-SCAN-WORKFLOW-01 / QR/PIN finalization opt-in. Prior #3771 CI and seven mocked authorization scenarios passed. Current-main CI and LAB pending.

10/11/2026 — QR/PIN selection displays current store stock from a read-only, scoped line endpoint. CI and LAB pending.

10/11/2026 — Store warehouse browsing implemented with explicit owner opt-in, scoped read-only search and paging. Price/taxonomy editing remains pending. CI and LAB pending.

## INVENTORY-PRODUCT-CREATE-EVENTS

Assigned to `fix/inventory-product-create-events`. Central Events shows historical inventory PRODUCT_CREATE records with store, date and operator filters. Local syntax and mocked query/mapping checks passed. LAB and production lookup pending. See [change checkpoint](CHANGES/inventory-product-create-events.md).


## MYDATA-DRAFT-PREFILL

Create missing supplier from verified myDATA invoice fields. [Checkpoint](CHANGES/mydata-draft-create-supplier.md).

Show the XML issuer name on unlinked myDATA drafts. [Checkpoint](CHANGES/mydata-draft-issuer-name.md).

Unconfirmed packaging remains in the draft for correction. [Checkpoint](CHANGES/mydata-unconfirmed-packaging.md). CI and production validation pending.

Automatic recovery of attached empty drafts: [checkpoint](CHANGES/mydata-automatic-empty-draft.md). Syntax checks passed; CI and live verification pending.

Follow-up `fix/mydata-draft-vat-zero-retry`. Local replay passed for an empty myDATA draft with VAT category 7. CI and deployed retry pending. See [checkpoint](CHANGES/mydata-draft-vat-zero-retry.md).

Assigned to `fix/mydata-draft-prefill`. Source prepared. Existing LAB and CI pending. See [checkpoint](CHANGES/mydata-draft-prefill.md).

11/11/2026 — Central Offers & Gifts: allow a fixed price for multiple selected products in one submission. See CHECKPOINTS/CHANGES/2026-11-11-platform-bulk-fixed-offer.md.

11/11/2026 — Central Offers & Gifts: reuse an existing company item when SKU and master barcode match. See CHECKPOINTS/CHANGES/2026-11-11-platform-promotion-existing-sku.md.

11/11/2026 — Inventory Archive duplicate scan by selected store. See CHECKPOINTS/CHANGES/2026-11-11-inventory-duplicate-check.md.

12/11/2026 — Inventory Archive: start product merge directly from duplicate results. See CHECKPOINTS/CHANGES/2026-11-12-inventory-merge-duplicates.md.

12/11/2026 — Πληρωμή POS με υπάρχον παραστατικό myDATA. CI και LAB εκκρεμούν. [Checkpoint](CHANGES/2026-11-12-pos-pay-existing-mydata.md).

12/11/2026 — Export active efood offers per store using the in-store euro discount. See CHECKPOINTS/CHANGES/2026-11-12-efood-offer-export.md.

13/11/2026 — Consolidated inventory valuation: report across selected stocktakes with 24-hour Greek timestamps. See CHECKPOINTS/CHANGES/2026-11-12-inventory-valuation.md.

13/11/2026 — POS: επιβεβαίωση πληρωμής με υπάρχον τιμολόγιο myDATA και επαληθευμένο προμηθευτή. [Checkpoint](CHANGES/2026-11-13-pos-mydata-existing-document-supplier.md).

13/11/2026 — Φωτογραφίες και βοηθός στο χειροκίνητο πρόχειρο παραγγελίας. [Checkpoint](CHANGES/2026-11-13-manual-purchase-invoice-photos.md).

13/11/2026 — Ρητή έναρξη ανάγνωσης φωτογραφιών στο χειροκίνητο πρόχειρο. [Checkpoint](CHANGES/2026-11-13-manual-order-photo-explicit-read.md).

13/11/2026 — Τυπωμένη καθαρή αξία στο χειροκίνητο πρόχειρο. [Checkpoint](CHANGES/2026-11-13-manual-invoice-printed-rounding.md).

13/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01 / delegated bank transfer history. [Checkpoint](CHANGES/2026-11-13-manager-payment-history-implementation.md), PR #3851. CI passed before synchronization; hosted LAB pending.


## 2026-11-13 — Inventory audit purchase document links

PRs #3852 and #3856 merged. Scoped hosted LAB PASS on fbc7167: standalone OCR approval linked the purchase document to the +2 movement in inventory reconciliation (8 → 10, zero net difference). Physical receipt time and verified original remain open. [Checkpoint](CHANGES/2026-11-13-inventory-receipt-lab-pass.md).

13/11/2026 — Διόρθωση εκκαθάρισης κωδικού γραμμής τιμολογίου κατά την αποθήκευση barcode. [Checkpoint](CHANGES/2026-11-13-invoice-clear-supplier-code.md).


## 2026-11-13 — Standalone local OCR draft approval
Continues #3852 LAB acceptance. Expose the existing stock approval action for a standalone OCR draft in the selected store. See [checkpoint](CHANGES/2026-11-13-standalone-ocr-draft-approval.md).

13/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01 / independent payment history right. [Checkpoint](CHANGES/2026-11-13-manager-payment-read-independent.md). CI and LAB pending.

13/11/2026 — CENTRAL-BACKOFFICE-ACCESS-01 / independent shift close. [Checkpoint](CHANGES/2026-11-13-manager-shift-close-context.md), PR #3855. LAB pending.

### Διασταύρωση CI και αλλαγών του main — 13/11/2026

- #3841 · Το workflow του main με σταθερές εκδόσεις PostgreSQL 16/18 πέρασε 5/5 στο [CI #9775 του #3838](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43374661572). Το #3841 είναι 23 commits πίσω και έχει κοινή αλλαγή με το main στο `inventory-reconciliation-source.js`. Εκκρεμούν έλεγχος συμβατότητας σε branch από main και CI με τις σταθερές εκδόσεις.
- #3858 και #3827 · Η κοινή αλλαγή με το main περιορίζεται σε αυτό το μητρώο. Στο #3771 έχουν αλλάξει και τα τέσσερα αρχεία υλοποίησης QR/PIN.
- #3860 · [CI #9826 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43500865390) στο `060e096a`. Ο κοινός κανόνας παραμένει στο draft.

### Δοκιμαστική εφαρμογή του #3841 στο main — 13/11/2026

Τα επτά αρχεία κώδικα και δοκιμών του #3841 εφαρμόστηκαν προσωρινά στο περιεχόμενο του main με μοναδική αντιστοίχιση ανά τμήμα diff. Διατηρήθηκαν οι νεότερες αλλαγές στο `inventory-reconciliation-source.js`. Πέρασαν 6/6 έλεγχοι σύνταξης JavaScript. Εκκρεμούν μεταγλώττιση JSX, συνδυασμένο CI και hosted LAB. Ο κλάδος του #3841 διατηρήθηκε στην τρέχουσα έκδοση.

### Δοκιμαστικός κλάδος CI για #3841 — 13/11/2026

Άνοιξε το [draft #3861](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3861) με commit `b4f57a3b` από το main `d8b278b2`. Επιβεβαιώθηκαν τα επτά αρχεία της αλλαγής και τα δύο checkpoints. Χρησιμοποιήθηκε το workflow του main με τις σταθερές εκδόσεις PostgreSQL. [CI #9828 PASS (5/5)](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43501988091), μαζί με το build-and-test. Εκκρεμεί δοκιμή του ίδιου commit στο υπάρχον LAB.

- Έλεγχος Render για #3861 · NOT TESTED στο LAB. Το `myworkstation-app` είναι live στο `d8b278b2`. Το `b4f57a3b` δεν βρέθηκε στους πρόσφατους ελέγχους deploy των διαθέσιμων υπηρεσιών. Τα ενεργά απομονωμένα LAB εξυπηρετούν POS UI και χονδρική. Για hosted αποδοχή χρειάζεται διαθέσιμη έκδοση `b4f57a3b` σε εγκεκριμένο μη παραγωγικό στόχο με δοκιμαστικά δεδομένα απογραφής.

- #3861 · Επανέλεγχος στο ακριβές `b4f57a3b`: `node --test server/test/inventory-reconciliation-reviews.test.js` με Zod 3.24.2, **11/11 PASS**. Επιβεβαιώθηκαν επαναχρησιμοποίηση σε επόμενη σύγκριση, ανάκληση και όρια καταστήματος/γενιάς. Το `render.yaml` του commit δηλώνει την παραγωγική εφαρμογή, όχι ξεχωριστό inventory LAB. Η λειτουργική δοκιμή στο φιλοξενούμενο LAB παραμένει NOT TESTED.

- 14/11/2026 · #3858 συγχρονίστηκε με main `d8b278b2`, με διατήρηση των έξι αρχείων τεκμηρίωσης και των νεότερων εγγραφών του μητρώου. [CI #9830 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43561772567) στο `32e69a07`. Hosted LAB PASS για standalone OCR και κίνηση αγοράς +2. Η πραγματική ώρα παραλαβής και το αποθηκευμένο πρωτότυπο myDATA παραμένουν ανοικτά.

- 14/11/2026 · #3827 συγχρονίστηκε με main `d8b278b2`. Διατηρήθηκαν τα οκτώ αρχεία του PR και οι εγγραφές του main. [CI #9832 PASS (5/5)](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43562848857) στο `afaa555b`. Εκκρεμούν μετρήσεις polling και καθυστέρησης HTTP στο υπάρχον LAB και έλεγχος SQL indexes. Τα indexes δεν εφαρμόστηκαν από αυτή την εργασία.

- 14/11/2026 · Οριστικοποίηση QR/PIN: το [#3774](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3774) αντικατέστησε το #3771 και συγχωνεύτηκε με `40aaf29f`. Επιβεβαιώθηκε ότι το commit περιλαμβάνεται στο τρέχον main και ότι το [CI #9579 πέρασε](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/42634405981) στο `fdb2cbec`. Οι σχετικές αλλαγές υπάρχουν στα τέσσερα αρχεία υλοποίησης του main. Η παλαιότερη εκκρεμότητα συγχρονισμού #3771 κλείνει ως αντικατασταθείσα. Παραμένει ανοικτή η τεκμηριωμένη δοκιμή στο υπάρχον LAB για ρητή εξουσιοδότηση όλων των ζωνών και συνδέσμους μόνο για καταμέτρηση.

- 14/11/2026 · #3774 hosted LAB: το Render είναι live στο `d8b278b2`, το οποίο περιλαμβάνει την οριστικοποίηση QR/PIN. Το MyWorkStation επέστρεψε «Η προβολή Backoffice διακόπηκε» λόγω ανενεργής συνεδρίας και το Άνοιγμα Backoffice επέστρεψε στην ίδια οθόνη. NOT TESTED για σύνδεσμο μόνο καταμέτρησης και σύνδεσμο με ρητή οριστικοποίηση. Επόμενο βήμα: επανασύνδεση στο δοκιμαστικό Backoffice και επιβεβαίωση των δύο περιπτώσεων αποκλειστικά στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ.

- 14/11/2026 · #3827: στοχευμένος επανέλεγχος στο `afaa555b`, **4/4 PASS**. Επιβεβαιώθηκαν η επιβράδυνση polling μόνο για το αναμενόμενο 503 κλειστού καταστήματος, οι συγκεντρωτικές μετρήσεις καθυστέρησης χωρίς IDs καταστημάτων και η συνέχιση του API σε αστοχία καταγραφής. Hosted LAB και μετρήσεις με SQL indexes παραμένουν ανοικτά.

- 14/11/2026 · Τιμολόγια POS #3844: επιβεβαιώθηκε [CI #9780 PASS 5/5](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43418378210) στο `ca93cab0` και συγχώνευση. Εκκρεμεί δοκιμή στο υπάρχον LAB για επιβεβαιωμένο myDATA, ελλιπή στοιχεία και αίτημα φωτογραφίας/PDF. Χρησιμοποιείται δοκιμαστικό παραστατικό.
- 14/11/2026 · Email #3834: επιβεβαιώθηκε [CI #9758 PASS 5/5](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43292527704) στο `14dabfa9` και συγχώνευση. Οι δοκιμές με συνθετικές εγγραφές καλύπτουν ιστορικό ανά κατάστημα και έλεγχο ρόλων. Εκκρεμεί λειτουργική δοκιμή στο LAB και τεκμήριο παραλαβής στο γραμματοκιβώτιο.

### Εκκρεμότητες για κλείσιμο συντονισμού — 14/11/2026

| Εργασία | Κριτήριο κλεισίματος | Κατάσταση |
| --- | --- | --- |
| Κοινός κανόνας #3860 | Ενσωμάτωση στο main και μία καταγραφή από κάθε ομάδα στο ενεργό μητρώο | Η αλλαγή αφορά μόνο το ενεργό μητρώο. CI PASS στο προηγούμενο commit. Εκκρεμεί έγκριση συγχώνευσης. |
| Παραλαβή OCR #3858 | Ενσωμάτωση τεκμηρίωσης για το συγκεκριμένο σενάριο | Hosted LAB PASS για 8 → 10, PURCHASE +2 και διαφορά 0. Χωριστές εκκρεμότητες Full Audit: πραγματική ώρα παραλαβής και επαλήθευση πρωτοτύπου myDATA. |
| Απογραφή #3861 / #3774 | Έλεγχος ομαδοποίησης και ανάκλησης στο LAB για #3861, καθώς και των δύο δικαιωμάτων συνδέσμου QR/PIN για #3774 | #3861 CI 5/5 και 11/11 στοχευμένες δοκιμές. Εκκρεμούν διαθέσιμο build #3861 στο υπάρχον LAB και ενεργή συνεδρία Backoffice για #3774. |
| POS #3844 / Email #3834 / Απόδοση #3827 | Δοκιμή POS myDATA, συσχέτιση δοκιμαστικού email με παραλαβή και μετρήσεις στο LAB | Τα CI πέρασαν. Στη στοχευμένη αναζήτηση του συνδεδεμένου Gmail δεν βρέθηκε σχετικό τεκμήριο παραλαβής. |

## 2026-11-14 — Markup σε πρόχειρα myDATA

Υπολογισμός markup κατά την προβολή αντιστοιχισμένων γραμμών. [Checkpoint](CHANGES/2026-11-14-mydata-draft-markup.md).

## 2026-11-14 — Φίλτρα και διπλοεγγραφές στην Αποθήκη POS

[Checkpoint](CHANGES/2026-11-14-pos-warehouse-duplicate-filters.md).

## 2026-11-14 — Συγχώνευση ειδών και φίλτρα στην Αποθήκη POS

[Checkpoint](CHANGES/2026-11-14-front-pos-warehouse-merge.md).

## 2026-11-14 — Κουμπί φίλτρων στην Αποθήκη POS

[Checkpoint](CHANGES/2026-11-14-front-pos-filter-button.md).

## 2026-11-14 — Τμήμα ΦΠΑ και Margin στην Αποθήκη POS

[Checkpoint](CHANGES/2026-11-14-pos-warehouse-vat-margin.md).

## 2026-11-14 — Καρτέλα είδους και πλοήγηση υπευθύνου

[Checkpoint](CHANGES/2026-11-14-staff-item-card.md).

## 13/11/2026 — Συνέχεια αναθέσεων απογραφής

Η συνέχεια της προηγούμενης σελίδας καταγράφεται εδώ, με σύντομα checkpoints και συνδέσμους στα τεκμήρια.

- #3858 · Η αρχική τεκμηρίωση παραλαβής (commit `2b16af97`) πέρασε το [CI #9820](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43494757215). Hosted LAB PASS μόνο για την έγκριση standalone OCR και την αντίστοιχη κίνηση αγοράς +2 (8 → 10, μηδενική διαφορά). Το PR είναι draft.

- #3841 · Η [επανεκτέλεση CI #9770](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43300522469) στο `3acf060c` ολοκληρώθηκε με 4/5 πράσινα jobs. Το `build-and-test` ανέφερε οκτώ αποτυχίες TAP, συμπεριλαμβανομένης μίας ένθετης δοκιμής, στον έλεγχο επαναφοράς PostgreSQL. Το GitHub αναφέρει ότι το draft δεν είναι mergeable. Επόμενο βήμα: σύγκριση με το τρέχον main και απομόνωση των αποτυχιών πριν από νέο CI και αποδοχή στο υπάρχον LAB.

- #3771 · [CI #9573](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/42631870100) PASS στο `81afd657`. Το GitHub αναφέρει ότι το PR δεν είναι mergeable. Εκκρεμούν συμβατότητα με το τρέχον main και δοκιμή οριστικοποίησης QR/PIN στο υπάρχον LAB.

- Full Audit · Εκκρεμούν η επαλήθευση του αποθηκευμένου πρωτοτύπου myDATA και η καταγραφή της πραγματικής ώρας παραλαβής. Η ώρα της κίνησης αποθήκης δεν τεκμηριώνει την ώρα φυσικής παραλαβής.

- 14/11/2026 · #3774, υπάρχον MYWORKSTATION LAB → ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ: στην πρόχειρη απογραφή LAB31-BACKOFFICE-20261111 εμφανίζεται η επιλογή «Δικαίωμα οριστικοποίησης (μόνο για όλες τις ζώνες)», ανενεργή από προεπιλογή. Η απογραφή έχει 1/205 είδη καταμετρημένα. Έγινε έλεγχος UI. Εκκρεμεί έκδοση των δύο προσωρινών συνδέσμων σε ξεχωριστή δοκιμαστική απογραφή και έλεγχος οριστικοποίησης από τον καταμετρητή. #3858 έτοιμο για ανασκόπηση, #3861 και #3827 παραμένουν draft με CI 5/5 στα συγχρονισμένα commits. Το #3860 έχει συγχωνευτεί στο main.

- 14/11/2026 · Τιμολόγια myDATA — Markup #3863: συγχωνεύτηκε στο `main` και το Render επιβεβαιώνει live το `bf6d3953` (dep-dbs11vui0phs73br33og). Ο ιδιοκτήτης ανέφερε «ΕΙΝΑΙ ΟΚ» στη σελίδα τιμολογίων. [CI #9845 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43571568773) στο `65ac53d6`. Η λειτουργική δοκιμή QR/PIN παραμένει σε αναμονή έγκρισης για έκδοση προσωρινής πρόσβασης με δικαίωμα οριστικοποίησης, μόνο στο υπάρχον ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ.

- #3774 · Με έγκριση ιδιοκτήτη δημιουργήθηκε στο υπάρχον LAB η `LAB-3774-QR-FINALIZE-20261114` (DRAFT, 0 είδη) και εκδόθηκαν δύο χωριστοί προσωρινοί σύνδεσμοι, μόνο καταμέτρηση και με οριστικοποίηση. Ο πρώτος άνοιξε την οθόνη εισόδου με εξαψήφιο PIN. Εκκρεμούν εξαργύρωση PIN, καταμέτρηση ενός δοκιμαστικού είδους και επαλήθευση οριστικοποίησης/κίνησης. Δεν καταχωρίστηκε ποσότητα.

- 14/11/2026 · #3774, `LAB-3774-QR-FINALIZE-20261114`: hosted LAB PASS για καταμέτρηση και οριστικοποίηση QR/PIN. Ο σύνδεσμος καταμέτρησης αποθήκευσε 11 τεμάχια στο συνθετικό `LAB-3645-ALIAS-A` και δεν εμφάνισε κουμπί οριστικοποίησης. Στον εξουσιοδοτημένο σύνδεσμο έγινε μία επιβεβαίωση γύρω στις 11:03 ώρα Ελλάδας. Η οθόνη καταμετρητή εμφάνισε επιτυχία και το Backoffice FINALIZED με αιτιολογία «Οριστικοποίηση από σύνδεσμο απογραφέα», αρχικό 10, καταμέτρηση 11, διαφορά +1. Νέα αναζήτηση στην Αποθήκη έδειξε τρέχον απόθεμα 11. Το Full Audit ανάμεσα στις καταμετρήσεις δεν εμφάνισε χωριστή γραμμή κίνησης οριστικοποίησης. Δεν επιβεβαιώθηκε ανεξάρτητα ο αριθμός εγγραφών κίνησης ούτε δοκιμάστηκε επανάληψη ή απευθείας αίτηση χωρίς δικαίωμα.

- 14/11/2026 · #3774, αιτία εμφάνισης στο Full Audit: για κάθε είδος το `inventory-reconciliation.js` κόβει τις κινήσεις στη νεότερη καταμέτρηση. Στο LAB αυτή έγινε περίπου στις 10:29, ενώ η οριστικοποίηση έγινε στις 11:03. Ο finalizer γράφει `STOCKTAKE_ADJUSTMENT` μόνο για μη μηδενική διαφορά, στην ίδια συναλλαγή με την ενημέρωση αποθέματος και την αλλαγή κατάστασης. Το υπόλοιπο 11 και το FINALIZED επιβεβαιώθηκαν στην εφαρμογή. Για ανεξάρτητο έλεγχο της μίας γραμμής χρειάζεται ανάγνωση ιστορικού αποθήκης ή `StockMovement` με πηγή τη συγκεκριμένη δοκιμαστική απογραφή. Ο έλεγχος δύο συνδέσμων ολοκληρώθηκε στο UI. #3858 έτοιμο για ανασκόπηση, #3861 και #3827 παραμένουν draft.

- 14/11/2026 · #3774: ανεξάρτητος έλεγχος μόνο για ανάγνωση στο `StockMovement` για τη δοκιμαστική απογραφή και το `LAB-3645-ALIAS-A`: ακριβώς 1 εγγραφή `STOCKTAKE_ADJUSTMENT / INVENTORY_V2`, ποσότητα +1, 11:03:24 ώρα Ελλάδας. Επιβεβαιώθηκε η κίνηση 10 → 11 για το σενάριο QR/PIN. Η επανυποβολή και απευθείας αίτηση χωρίς δικαίωμα παραμένουν εκτός των ελέγχων.
- 14/11/2026 · #3864, Αποθήκη μπροστά στο POS: merged. CI 9847 success. Το Render δείχνει live το `89acd047`. Εκκρεμεί hosted έλεγχος με ρόλο χειριστή.

- 14/11/2026 · Μπροστινό POS #3865: ξεχωριστό δικαίωμα χειριστή για συγχώνευση διπλοεγγραφών και προσαρμογή της διάταξης φίλτρων. Το `86b9cf56` ενημέρωσε τον έλεγχο από 27 σε 28 δικαιώματα. Στο [CI #9850](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43584315038) το απομονωμένο LAB απέτυχε αρχικά με Docker Hub 502 για `node:20-bookworm`. Διαπιστώθηκε επανεκτέλεση σε εξέλιξη. Εκκρεμούν τελικό αποτέλεσμα και δοκιμή με χειριστή.

- #3865 · Η επανεκτέλεση [CI #9850](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43584315038) ολοκληρώθηκε επιτυχώς (5/5) στο `86b9cf56`. Τα φίλτρα και η συγχώνευση με ξεχωριστό δικαίωμα χειριστή εκκρεμούν για δοκιμή στο μπροστινό POS. Το PR παραμένει draft.

- #3865 · Συγχωνεύτηκε στο main και το Render επιβεβαίωσε live την έκδοση `efc935c0` (deploy `dep-dbs3huafngtc73bkcmk0`, 14/11/2026 12:35 ώρα Ελλάδας). Διαθέσιμες οι αλλαγές για ορατά φίλτρα και συγχώνευση διπλοεγγραφών με ρητό δικαίωμα χειριστή. Η δοκιμή στην οθόνη με ρόλο χειριστή εκκρεμεί. Το υπάρχον POS UI LAB πριν από τη δημοσίευση έτρεχε `550df503`.

- 14/11/2026 · Συγχρονισμός με main `efc935c0`: [#3858 CI #9857 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43589694069), [#3861 CI #9856 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43589691895). [#3827 CI #9855 FAIL](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43589688891) στο `416f7f89`, στον έλεγχο καταγραφής άρνησης πρόσβασης FAST POS (`pos-fast-header-latency.test.js:451`). Ο έλεγχος απομονωμένου wholesale LAB πέρασε. Αιτία της αποτυχίας του ελέγχου FAST POS εκκρεμεί προς επιβεβαίωση.

- #3827 · Το CI #9855 έδωσε ψευδώς θετικό αποτέλεσμα: το τυχαίο UUID του διαγνωστικού περιείχε `fb-43`, που ταίριαξε με τον δοκιμαστικό αριθμό παραστατικού. Στο `bdcf7afd` ο έλεγχος UUIDv4, το ακριβές σχήμα και ο έλεγχος των λοιπών πεδίων παραμένουν. Πέρασαν 4 τοπικές διασταυρώσεις της αποτυχημένης εγγραφής και των αρνητικών περιπτώσεων. Το GitHub δεν έχει εμφανίσει νέα εκτέλεση CI για το commit. Hosted LAB εκκρεμεί.

- #3827 · Μετά τον συγχρονισμό στο `cab1e03d`, [CI #9861 PASS (5/5)](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43594705922) στο `d0c0312b`, μαζί με το `build-and-test` και τον διορθωμένο έλεγχο FAST POS. Εκκρεμούν οι μετρήσεις στο υπάρχον LAB και ο έλεγχος των προτεινόμενων SQL indexes.

- #3867 · Τα φίλτρα Τμήμα ΦΠΑ και όρια Margin % στο μπροστινό POS συγχωνεύτηκαν στο main. CI 9859: success. Η αποδοχή στην οθόνη χειριστή παραμένει προς επιβεβαίωση από την ομάδα POS.

- #3868 · Η ομάδα POS έχει αναλάβει την καρτέλα είδους του υπευθύνου, με πρόσβαση από το μολύβι της Αποθήκης όταν υπάρχει το δικαίωμα `products.edit`. Στο [CI #9863](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43596254970) πέρασαν 4/5 jobs. Δύο σενάρια μηνιαίας απογραφής στο `monthly-inventory-capture-routes-postgres.test.js:72` πήραν 24 αντί 23. Εκκρεμούν διόρθωση/επιβεβαίωση από τον υπεύθυνο του PR και δοκιμή με ρόλο υπευθύνου στο LAB.
- #3869 · [CI #9864 PASS](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43596310620) στην τεκμηρίωση της αποδοχής του κουμπιού «Φίλτρα» του #3866 από τον ιδιοκτήτη στη σελίδα POS. Η αποδοχή αφορά το κουμπί.

- 14/11/2026 · Συντονισμός απογραφής και απόδοσης: #3858 και #3861 συγχρονίστηκαν με το `cab1e03d`, νέα commits `13220b20` και `28a212b9`. Εκκρεμεί το CI των νέων commits. Το #3827 έχει CI 5/5 στο `d0c0312b` και εκκρεμούν μετρήσεις LAB. Η καρτέλα είδους #3868 ανήκει στην άλλη συνομιλία και δεν περιλαμβάνεται στην παρούσα ανάθεση.

- #3858: CI #9869 PASS στο `13220b20`. #3861: CI #9868 PASS στο `28a212b9` μετά από επανάληψη του Chromium job. Η λειτουργική αποδοχή του #3861 στο υπάρχον LAB εκκρεμεί.

- 2026-11-14 · Ημερήσια μεταβολή τζίρου Διαδόχου στον Βοηθό και στη μηνιαία αναφορά · branch `feat/monthly-turnover-report` · NOT TESTED στο LAB. [Checkpoint](CHANGES/2026-11-14-monthly-turnover-report.md)

13/11/2026 — #3841: δοκιμαστική εφαρμογή των αλλαγών απογραφής στο main `d8b278b2`, με τις σταθερές εκδόσεις PostgreSQL του main. CI και LAB εκκρεμούν. [Checkpoint](CHANGES/2026-11-12-inventory-reusable-identity-projection.md).

- #3861 · Στοχευμένος επανέλεγχος πηγής του `28a212b9`: 12/12 PASS. Περιλαμβάνει εκτέλεση του πραγματικού SQL επιλογής ιστορικού πάνω σε απομονωμένο PGlite με συνθετικό `WorkforceAuditLog`. Επιβεβαιώθηκαν η επαναχρησιμοποίηση, η ανάκληση, η εξαίρεση του αρχικού ζεύγους και η απομόνωση ανά κατάστημα και γενιά. Hosted LAB παραμένει ανοικτό μέχρι να είναι διαθέσιμη εκεί η δοκιμαστική έκδοση.

| 1 | SERVER-PERFORMANCE-01 / Polling, SQL, API latency | Συντονιστής | #3827 (draft) | [Candidate](CHANGES/2026-11-11-server-performance.md) · CI PENDING · LAB NOT TESTED · indexes NOT APPLIED | Πλήρες CI, υπάρχον LAB, έγκριση πριν merge/SQL παραγωγής |

- #3827 · Η διόρθωση του ελέγχου FAST POS για τυχαίο UUID επαληθεύτηκε με 4 στοχευμένους ελέγχους. Εκκρεμούν CI μετά τον συγχρονισμό και φιλοξενούμενη δοκιμή LAB.

- #3827 · Τοπικό SQL benchmark σε απομονωμένο PGlite με 100.000 συνθετικές γραμμές ανά πίνακα. Με ισοδύναμους indexes, CloudAudit και FTEXT πέρασαν από `Seq Scan + Sort` σε `Index Only Scan`. Ενδεικτικά μία εκτέλεση ανά query: CloudAudit 541 → 12 shared hit blocks (12,962 → 0,214 ms), FTEXT 690 → 1 (12,573 → 0,072 ms). Επιβεβαιώθηκε επιπλέον σε τοπικό PGlite ότι τα δύο ακριβή `CREATE INDEX CONCURRENTLY IF NOT EXISTS` του PR εκτελούνται χωριστά, μπορούν να επαναληφθούν και αφήνουν δύο έγκυρους indexes. Εκκρεμούν μετρήσεις και έλεγχος παράλληλου φορτίου στο υπάρχον LAB. Το #3861 περιμένει διαθέσιμο build στο LAB για έλεγχο επαναχρησιμοποίησης και ανάκλησης.

- 2026-11-14 · Ημερήσιος τζίρος στον Βοηθό Super Admin · LAB FAIL στο 5827d72, τοπική διόρθωση προς επανέλεγχο. [Checkpoint](CHANGES/2026-11-14-super-admin-daily-turnover.md)

- 2026-11-14 · Δοκιμαστικό SMTP τζίρου LAB · [Checkpoint](CHANGES/2026-11-14-lab-turnover-smtp.md)

- 2026-11-14 · #3861 · Hosted LAB PASS για επαναχρησιμοποίηση και ανάκληση. Στη σύγκριση `LAB-3645-LINK-02` με `LAB-3696-FREE-02` συνδέθηκαν συνθετικά ALIAS-A/B με κύριο A και επαναχρησιμοποίηση στο κατάστημα. Με προηγούμενη `LAB-3696-FREE-01` εμφανίστηκε μία κοινή γραμμή. Η ανάκληση της δοκιμαστικής σύνδεσης καταγράφηκε στην αρχική σύγκριση και στη δεύτερη επέστρεψαν δύο χωριστές γραμμές.

- 2026-11-14 · #3827 · Μερική επαλήθευση. Στο υπάρχον ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ φορτώθηκε η λίστα ιστορικών Online Παραγγελιών στο Backoffice. Η εφαρμογή καταγράφει `MWS_HTTP_LATENCY`: σε ένα κοινό παράθυρο περίπου ενός λεπτού FTEXT 43 επιτυχείς κλήσεις (μέσος 94 ms, άνω όριο p95 250 ms), επισκόπηση συναλλαγών 34 επιτυχείς κλήσεις (μέσος 23,1 ms, άνω όριο p95 50 ms). Τα συγκεντρωτικά στοιχεία του Render αφορούν την κοινή υπηρεσία και δεν αποδίδονται στο LAB. Εκκρεμούν μέτρηση 60 s/7 s στο POS του LAB, χειροκίνητη επανάληψη, νέα συνθετική παραγγελία και έλεγχος indexes σε επιβεβαιωμένη βάση LAB.

- 2026-11-14 · #3827 · 4/4 στοχευμένοι έλεγχοι στο merge `9a21cc90`: κανόνας αναμονής για το αναμενόμενο HTTP 503, σταθερές ετικέτες χωρίς αναγνωριστικά, συγκεντρωτικές μετρήσεις και απομόνωση σφάλματος καταγραφής. Η συνεδρία Backoffice στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ δίνει επισκόπηση της ενεργής βάρδιας, αλλά δεν παρέχει είσοδο στο POS χειριστή. Δεν ταυτοποιήθηκε ξεχωριστή βάση για το συγκεκριμένο LAB στο Render. Δεν εφαρμόστηκαν indexes.

- 2026-11-14 · #3827 · Hosted LAB POS 2: επιβεβαιώθηκε είσοδος χειριστή, άνοιγμα Online Παραγγελιών και χειροκίνητη ανανέωση με την υπάρχουσα `ONL-001` στη λίστα. Εκκρεμεί επαλήθευση διαστημάτων με timestamps από το POS και δοκιμή κατάστασης κλειστού καταστήματος. Αναζήτηση Render request logs για την ακριβή διαδρομή LAB: 0 εγγραφές.

- 2026-11-14 · #3827 · Η κοινή τηλεμετρία `kat_orders_poll` έδειξε 10 και 9 επιτυχείς αποκρίσεις σε δύο διαδοχικά παράθυρα περίπου 61 s με ενεργό LAB POS 2, συμβατό με polling 7 s. Οι μετρήσεις αθροίζουν καταστήματα, συνεπώς δεν αποτελούν απομονωμένη απόδειξη. Το Render επέστρεψε κενές μετρικές και κανένα request log για την ακριβή διαδρομή του LAB. Η μέτρηση 60 s χρειάζεται παρατήρηση Network στη συνεδρία του POS και προσωρινό κλείσιμο μόνο του Online καταστήματος LAB.

- 2026-11-14 · #3827 · Hosted LAB POS 2: με ρητή έγκριση τέθηκε προσωρινά εκτός λειτουργίας μόνο το δημόσιο Online Store του ΕΡΓΑΣΤΗΡΙΟΥ ΔΟΚΙΜΩΝ. Η χειροκίνητη ανανέωση έδειξε «Το Online κατάστημα είναι προσωρινά κλειστό» και 0 παραγγελίες. Η αρχική ενεργή ρύθμιση επαναφέρθηκε και επιβεβαιώθηκε με αποθήκευση και επανεμφάνιση `ONL-001` στο POS. Το διάστημα αυτόματης επανάληψης 60 s παραμένει ανεπιβεβαίωτο στο hosted POS.

- 2026-11-14 · #3827 · Hosted LAB POS 2: μετά την εμφάνιση προσωρινά κλειστού Online Store, η ενεργή ρύθμιση αποθηκεύτηκε ξανά σε 0,564 s. Χωρίς νέα χειροκίνητη ανανέωση, η `ONL-001` εμφανίστηκε στα 67,279 s από την ένδειξη κλειστού. Η παρατήρηση UI είναι συμβατή με backoff 60 s και έλεγχο ανά 7 s, και δεν αποδεικνύει ακριβή χρόνο αιτημάτων. Επιβεβαιώθηκε η επαναφορά του ενεργού LAB Online Store. Τα indexes παραμένουν ανεφάρμοστα χωρίς ταυτοποιημένη ξεχωριστή βάση LAB.

- #3827 · Έλεγχος PostgreSQL μόνο ανάγνωσης στο Render. Το ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ βρίσκεται στη `myworkstation-db` μαζί με 9 άλλα καταστήματα. Τα δύο προτεινόμενα indexes απουσιάζουν και αφορούν ολόκληρους πίνακες. Baseline με φίλτρο LAB: CloudAudit Seq Scan + Sort, 1 γραμμή, 91,839 ms και 2.705 shared hit blocks σε μία εκτέλεση. FTEXT REQUIRES_CHECK, terminalPos '2': 0 γραμμές, 0,180 ms, 7 shared hit blocks. Το κενό FTEXT δείγμα δεν επαρκεί για σύγκριση. Η λειτουργική δοκιμή POS ολοκληρώθηκε. Η δοκιμή εγκατάστασης indexes με αποκλειστικό scope LAB μπλοκάρεται από την κοινή βάση.

- #3827 · Τελικός έλεγχος δυνατότητας μέτρησης μόνο ανάγνωσης: η κοινή PostgreSQL δεν έχει εγκατεστημένο `hypopg` και το ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ έχει 0 εγγραφές FTEXT σε όλες τις καταστάσεις/τερματικά. Διατηρείται η ήδη καταγεγραμμένη συνθετική σύγκριση PGlite. Η εγκατάσταση των δύο ευρετηρίων στην κοινή βάση παραμένει χωριστή αλλαγή παραγωγής και εκκρεμεί ρητή έγκριση.

- #3827 · Ο χρήστης ενέκρινε διαδοχική εγκατάσταση των δύο ευρετηρίων στην κοινή PostgreSQL σε ώρα χαμηλής κίνησης. Σε ένα στιγμιότυπο προελέγχου, `pg_stat_activity` ανέφερε 0 άλλες ενεργές συνεδρίες και 0 συναλλαγές άνω των 30 s, ενώ δεν φάνηκε ενεργή κατασκευή ευρετηρίου. Και τα δύο ευρετήρια απουσιάζουν. Η εγκατάσταση δεν εκτελέστηκε: η σύνδεση Render εκτελεί SQL μόνο για ανάγνωση μέσα σε συναλλαγή. Χρειάζεται εξουσιοδοτημένη συνεδρία psql με δικαίωμα DDL και νέος προέλεγχος πριν την έναρξη.

- #3827 · Νεότερη οδηγία χρήστη: δοκιμές μόνο στο υπάρχον LAB, χωρίς άνοιγμα άλλου περιβάλλοντος ή σύνδεσης. Τρεις επαναλήψεις του ίδιου CloudAudit SELECT με φίλτρο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ: 13,374 / 12,003 / 11,126 ms, πάντα Seq Scan και μία γραμμή. Η μέτρηση 91,839 ms παραμένει μεμονωμένη παρατήρηση. Καμία εγκατάσταση indexes στην κοινή βάση στο πλαίσιο της δοκιμής LAB.

- #3827 · Επαλήθευση του ακριβούς CloudAudit SELECT της επισκόπησης `cloud-v1.js` (`SELECT *`, ταξινόμηση `createdAt DESC`, όριο 20), μόνο με φίλτρο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Τρεις εκτελέσεις: 12,482 / 11,421 / 11,594 ms. Κάθε πλάνο έκανε Seq Scan, απέρριψε 60.551 γραμμές με το φίλτρο και επέστρεψε μία. Αυτό ολοκληρώνει τη μέτρηση βάσης στο διαθέσιμο scope LAB. Η μέτρηση μετά από εγκατάσταση απαιτεί εγκατάσταση σε φυσική βάση και μένει εκτός της τρέχουσας δοκιμής LAB.

## Αποτέλεσμα δοκιμών στο υπάρχον LAB — #3861 και #3827

- #3861 · Hosted LAB PASS. Επιβεβαιώθηκαν η επαναχρησιμοποίηση της σύνδεσης δύο συνθετικών κωδικών σε άλλη σύγκριση και η επαναφορά δύο χωριστών γραμμών μετά την ανάκληση.
- #3827 · Ολοκληρώθηκαν οι εφικτοί έλεγχοι στο υπάρχον LAB. Στο LAB POS 2 επιβεβαιώθηκαν η χειροκίνητη ανανέωση και η αυτόματη επανεμφάνιση παραγγελίας στα 67,3 s από την ένδειξη κλειστού. Η μέτρηση αφορά την οθόνη και δεν απομονώνει τα διαστήματα HTTP 7/60 s. Το Online Store επανήλθε ενεργό.
- #3827 · CloudAudit: 11,4–12,5 ms για το ερώτημα του Backoffice με φίλτρο LAB, με Seq Scan. FTEXT: 0 εγγραφές LAB. Τα ευρετήρια παραμένουν ανεφάρμοστα στην κοινή βάση. Μέτρηση πριν/μετά την εγκατάσταση βρίσκεται εκτός της οδηγίας για δοκιμές μόνο στο υπάρχον LAB.

- 2026-11-14 · Κουμπί αποστολής τζίρου LAB · [Checkpoint](CHANGES/2026-11-14-lab-turnover-mail-ui.md)

- 2026-11-15 · #3827 · Συμπληρωματικός έλεγχος του κώδικα `9a21cc90` με εικονικό ρολόι και συνθετικές αποκρίσεις: για προσωρινό κλείσιμο η πρώτη αυτόματη επανάληψη έγινε στα 63 s, η χειροκίνητη ανανέωση έγινε αμέσως και μετά την επιτυχία επανήλθε ο έλεγχος ανά 7 s. Γενικό HTTP 503: επανάληψη στην επόμενη περίοδο 7 s. HTTP 403 λόγω απενεργοποιημένων Online Παραγγελιών: παύση αυτόματης ανανέωσης. Διπλή ανανέωση με αίτημα σε εξέλιξη: μία κλήση. Έλεγχος κώδικα, χωριστός από τη μέτρηση οθόνης στο υπάρχον LAB. Τα ευρετήρια παραμένουν ανεφάρμοστα.

- 2026-11-15 · Αναγνώριση συνεδρίας Super Admin για δοκιμή τζίρου LAB · [Checkpoint](CHANGES/2026-11-15-lab-turnover-session.md)

## Παράδοση «Λίστα για σελίδες 1» — 15/11/2026 14:51 ώρα Ελλάδας

- Νο 12 · Η υπάρχουσα εκτέλεση επαληθεύτηκε για 16/11 09:00. Παράδοση NOT TESTED. Επόμενο βήμα διασταύρωση Message-ID.
- INSTALL-SUPPORT · #3209, εξαγωγή καρτέλας PDF/XLSX OPEN, LAB NOT TESTED. Ελέγχθηκε η καρτέλα και εντοπίστηκαν οι υπάρχουσες βιβλιοθήκες PDFKit και XLSX. Επόμενο βήμα καταχώριση ανάθεσης στο main. [Checkpoint](CHANGES/2026-11-15-lista-selides-1-handoff.md).

- 2026-11-15 · Manual cash email opening day, follow-up to #3875 · [Checkpoint](CHANGES/2026-11-15-manual-cash-email-opening-day.md) · LAB pending.

## Νο 21 — Προμήθειες και εμπορικές αναλύσεις (15/11/2026)

- Νο 21 · 16/11/2026 · LAB PASS για σύγκριση διαφορετικών μονάδων και για τη διόρθωση αποθέματος του [#3952](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3952). Με τη live έκδοση `7fbdc333` το απόθεμα αυξήθηκε κατά 6 μία φορά, το διπλό πάτημα δεν πρόσθεσε κίνηση και η αρχική ποσότητα επανήλθε. [Τεκμήριο LAB](CHANGES/2026-11-16-no21-package-stock-lab-pass.md).


- Νο 21 · Εγκεκριμένη ανάθεση στη σελίδα Νο 21 για ένα συνθετικό είδος `LAB-NO21-COMPARE-01` με δύο δοκιμαστικές τιμές από διαφορετικούς προμηθευτές, αποκλειστικά στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ. Στόχος η κατάταξη, η διαφορά ανά τεμάχιο και η ταυτοποίηση των δύο παραστατικών στην οθόνη. Χωρίς πληρωμή, φορολογική έκδοση ή χρήση δεδομένων άλλου καταστήματος. Κατάσταση: εκκρεμεί δημιουργία και λειτουργική δοκιμή.

- Νο 21 · LAB, έλεγχος μόνο ανάγνωσης με τα ίδια κριτήρια εταιρείας, καταστήματος, εγκεκριμένου τιμολογίου, προϊόντος και προμηθευτή της σύγκρισης: 50 προϊόντα, 0 με δύο διαφορετικούς προμηθευτές. Επομένως η λειτουργική κατάταξη παραμένει εκκρεμής στο LAB. Η απομονωμένη δοκιμή React/DOM για δύο προμηθευτές πέρασε στον [έλεγχο της εγκατεστημένης έκδοσης](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43872431735).

- Νο 21 · 16/11/2026 · Υφιστάμενο LAB, Super Admin, μόνο ανάγνωση: η «Σύγκριση Προμηθευτών» φόρτωσε μετά την εγκατάσταση της έκδοσης `78017dd` ([deploy](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/43874533500)), η οποία περιλαμβάνει το [#3914](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3914). Εμφανίστηκαν 39 ενδείξεις «Αποθηκευμένη μετατροπή αγοράς». Παράδειγμα: παραστατικό B 1970, κόστος 1,250 €. Η δοκιμή PostgreSQL του #3914 κάλυψε `INVOICED` και `FINAL`. Στο ορατό δείγμα LAB δεν επιβεβαιώθηκε κατάταξη με δύο προμηθευτές ούτε η κατάσταση της συνδεδεμένης παραγγελίας για κάθε γραμμή. Μερικό LAB PASS για φόρτωση και προβολή κόστους, η κατάταξη παραμένει ανοικτή.

- Νο 21 · Η σύγκριση προμηθευτών περιλαμβάνει πλέον συνδεδεμένες παραγγελίες INVOICED στο branch υλοποίησης. Εκκρεμούν CI και LAB. [Checkpoint](CHANGES/2026-11-15-no21-invoiced-supplier-comparison.md)

**Στοχευμένη ανάθεση 15/11/2026:** Η σελίδα Νο 21 (/root, `fix/no21-invoiced-supplier-comparison`) αναλαμβάνει το φίλτρο κατάστασης της συνδεδεμένης παραγγελίας στο `GET /api/commerce/supplier-price-comparison`. Τα υπόλοιπα του Νο 29 παραμένουν στην υφιστάμενη ανάθεση. Για το KM483, η δοκιμή μόνο ανάγνωσης με FINAL/INVOICED ανέκτησε τον αποθηκευμένο συντελεστή 1 και έδωσε 0,90 / 0,95 / 0,95 €/τεμ. ([#3901](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3901)). Εκκρεμούν υλοποίηση, CI και επαλήθευση στο υπάρχον LAB.

Ανάθεση συντονισμού από τον χρήστη βάσει της γραμμής «Σελίδα εμπορικών λειτουργιών» της 13/11. Η εργασία αφορά χαρτογράφηση και επαλήθευση στο υπάρχον LAB. Διατηρούνται οι υφιστάμενες αναθέσεις των επιμέρους λειτουργιών.

| Πεδίο | Υπάρχουσα λειτουργία | Εκκρεμότητα |
| --- | --- | --- |
| Σύγκριση προμηθευτών | `SupplierPriceComparisonPanel.jsx`, `GET /api/commerce/supplier-price-comparison`. Εγκεκριμένες αγορές, καθαρές τιμές, αναγωγή σε μονάδα με τεκμηριωμένο συντελεστή. | LAB PASS για δύο προμηθευτές του ίδιου είδους, με διαφορετικές μονάδες αγοράς. [Τεκμήριο](CHANGES/2026-11-16-no21-package-stock-lab-pass.md). |
| Συσκευασίες | Invoice Learning: μονάδα τιμολογίου, συντελεστής και μονάδα αποθέματος ανά προμηθευτή και είδος. | LAB PASS για αναγωγή τιμής σε τεμάχιο και μία μεταβολή αποθέματος ανά οριστικοποίηση. [Τεκμήριο](CHANGES/2026-11-16-no21-package-stock-lab-pass.md). |
| Εκκρεμείς παραγγελίες | Υπάρχει ξεχωριστή αναφορά πραγματικών παραγγελιών `GET /api/purchase-orders/report`. | LAB PASS για τις καταστάσεις και το φίλτρο «Προς έλεγχο / Τιμολόγηση» ([#3939](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3939)). |
| Προτεινόμενες παραγγελίες | `GET /api/commerce/order-suggestions` και `/by-supplier`, με CSV για έλεγχο. Η ειδοποίηση χαμηλού αποθέματος έχει ξεχωριστό endpoint. | LAB PASS για πρόταση βάσει ελάχιστου ([#3944](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3944)) και βάσει ζήτησης ([#3948](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3948)). |
| Είδη χαμηλής απόδοσης | «Πωλήσεις / είδος» και `GET /api/commerce/sales/advanced-report` δίνουν ποσότητα, τζίρο και εκπτώσεις για την περίοδο. | LAB PASS για το «Χωρίς πωλήσεις». Το κριτήριο για είδη που πωλούνται αλλά έχουν χαμηλή απόδοση παραμένει στο Νο 31, στην υπάρχουσα ανάθεση. |

Πρώτος έλεγχος μόνο ανάγνωσης. Στη συνέχεια αναζήτηση κατάλληλων υφιστάμενων παραδειγμάτων στο LAB, χωρίς τεχνητή μεταβολή αποθέματος ή αποστολή παραγγελίας.

- Πρώτος έλεγχος LAB, μόνο ανάγνωση: 50 είδη σε εγκεκριμένα τιμολόγια, κανένα με δύο διαφορετικούς προμηθευτές ή δύο διαφορετικά παραστατικά. Δεν βρέθηκε είδος με θετικό ρυθμισμένο ελάχιστο και διαθέσιμο απόθεμα κάτω από αυτό. Το report παραγγελιών υποστηρίζει ALL/NEW/FINAL/INVOICED και χωριστή ένδειξη `awaitingInvoice`. Το συγκεντρωτικό κέντρο εκκρεμοτήτων δεν περιλαμβάνει ακόμη πηγή παραγγελιών προμηθευτών.

- Συμπληρωματική επαλήθευση Νο 21: η αναφορά «Πωλήσεις / είδος» ξεκινά από `SaleLine` και ομαδοποιεί περιγραφές, άρα παραλείπει είδη χωρίς γραμμή πώλησης. Στο υπάρχον LAB, 206 ενεργά είδη καταλόγου και 0 με γραμμή ολοκληρωμένης πώλησης στο κυλιόμενο δείγμα 30 ημερών. Στην απογραφή πραγματικών παραγγελιών LAB: 58 NEW, 8 FINAL, 1 CANCELLED, 0 με awaitingInvoice. Ο υπάρχων πίνακας παραγγελιών και το συγκεντρωτικό κέντρο είναι χωριστές ροές. Στον έλεγχο προτάσεων βάσει ζήτησης δεν βρέθηκε φυσικά θετικό δείγμα στα τρία εξετασμένα σύνολα παραμέτρων. Μόνο ανάγνωση.

- Νο 21 · LAB, μόνο ανάγνωση: ιστορικό δείγμα 07/09–13/10 ώρα Ελλάδας με ενεργό κατάλογο 206 ειδών. Με αντιστοίχιση `productId` και φίλτρο ολοκληρωμένων πωλήσεων του ίδιου καταστήματος, 11 είδη έχουν γραμμή πώλησης και 195 δεν έχουν. Υπάρχει μία επιπλέον εγγραφή με κοινή περιγραφή, άρα η ταυτότητα είδους πρέπει να βασίζεται σε ID, όχι σε όνομα. Για το κυλιόμενο διάστημα 30 ημερών: 206 χωρίς γραμμή πώλησης, 0 με πώληση. Η δοκιμή μετρά παρουσία ολοκληρωμένης γραμμής, όχι καθαρή ποσότητα μετά από επιστροφές.

- Ανάθεση επιμέρους αλλαγής: η παρούσα σελίδα αναλαμβάνει προβολή «Χωρίς πωλήσεις» για ενεργά είδη, μόνο με επιλεγμένο κατάστημα και διάστημα, με ταυτότητα προϊόντος και υφιστάμενα δικαιώματα SALES_ANALYTICS. Δοκιμή στο υπάρχον LAB με το μεικτό διάστημα και το διάστημα χωρίς πωλήσεις. Οι τρέχουσες αναφορές πωλήσεων διατηρούνται. Source και λειτουργική δοκιμή εκκρεμούν.

- Νο 21 · Υλοποίηση προβολής «Χωρίς πωλήσεις» ανά κατάστημα και διάστημα. Ενεργά είδη, αντιστοίχιση κατά ID, μέτρηση παρουσίας γραμμής ολοκληρωμένης πώλησης. Εκκρεμεί CI και έλεγχος UI στο υπάρχον LAB. [Checkpoint](CHANGES/2026-11-15-procurement-unsold-products.md)

- 15/11/26, 8:01 μ.μ. ώρα Ελλάδας · INSTALL-SUPPORT / «Λίστα για σελίδες 1» · Εξαγωγή PDF/XLSX καρτέλας επιλεγμένου καταστήματος · LAB NOT TESTED · [Ανάληψη](CHANGES/2026-11-15-install-support-export-claim.md).

- Νο 21 · #3895 · Hosted LAB PASS για την προβολή «Χωρίς πωλήσεις» ως Super Admin, στο ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ (Λοιπές εμπορικές λειτουργίες → Αναλυτική). 206 είδη για 01–15/11 και 195 με αλλαγή περιόδου σε 07/09–13/10, σε συμφωνία με το SQL. Κώδικας `32c5cdfd`, πλήρες CI και Render deploy επιτυχή. Η συνεδρία απογραφέα δεν εμφανίζει την προβολή. Άλλοι ρόλοι δεν δοκιμάστηκαν λειτουργικά. Μόνο ανάγνωση.

- Νο 21 · Υφιστάμενο LAB, Super Admin, μόνο ανάγνωση: «Αυτόματες Προτάσεις Παραγγελίας» και προβολή ανά προμηθευτή φορτώθηκαν. Προεπιλογή ιστορικού/κάλυψης/παράδοσης 30/7/3 ημέρες, 11 είδη για έλεγχο. Δείγμα ΝΕΡΟ 500ML: απόθεμα −71, ελάχιστο 0, καθαρή κίνηση 0, πρόταση 71 τεμ. με σήμανση «Χρειάζεται έλεγχος» και «Χωρίς προμηθευτή». Δεν επιβεβαιώθηκε θετική πρόταση βάσει ζήτησης ή κάτω από θετικό ελάχιστο. Η προβολή έκλεισε πριν επαληθευτούν διαδραστικά τα δύο φίλτρα.

- Νο 21 · 17/17 στοχευμένες δοκιμές του υπάρχοντος κώδικα προτάσεων και φίλτρου ελλείμματος πέρασαν (`order-suggestions.test.js`, `supplier-stock-shortfall-contract.test.js`). Καλύπτονται θετικό ελάχιστο, αναπλήρωση βάσει καθαρής ζήτησης, φίλτρο κατηγορίας και αρνητικό απόθεμα για έλεγχο. Η συνεδρία LAB επανήλθε ως απογραφέας μετά από αλλαγή σύνδεσης. Η διαδραστική επαλήθευση των φίλτρων ως Super Admin παραμένει ανοικτή.

- 2026-11-16 · INSTALL-SUPPORT · LAB PASS για εναλλαγή μεταξύ δύο καταστημάτων. Κάθε PDF και XLSX έδειξε το επιλεγμένο κατάστημα και συμφώνησε στις εννέα γραμμές. Τοπικός έλεγχος στον χειριστή HTTP με συνθετικά δεδομένα: μη έγκυρο ζεύγος εταιρείας–καταστήματος επέστρεψε 404 χωρίς παραγωγή αρχείου και στις δύο μορφές. Hosted LAB για αυτό το σενάριο: NOT TESTED. [Checkpoint](CHANGES/2026-11-15-install-support-profile-export.md).

- 2026-11-15 · Διόρθωση σύνδεσης τιμολογημένων στη μηνιαία αναφορά · [Checkpoint](CHANGES/2026-11-15-monthly-invoice-posting-links.md).
- 2026-11-15 · Τζίρος και μέσος όρος ανά βάρδια στον Βοηθό Super Admin · τοπική αλλαγή, εκκρεμεί LAB. [Checkpoint](CHANGES/2026-11-15-shift-turnover.md)

- 2026-11-16 · Τζίρος ανά βάρδια στο μηνιαίο email · LAB PASS για περιεχόμενο και παραλαβή συνθετικού δοκιμαστικού email. Η προγραμματισμένη παραγωγική αποστολή και η διασταύρωση ιστορικού παραμένουν NOT TESTED. [Checkpoint](CHANGES/2026-11-16-monthly-shift-turnover.md)

- 2026-11-16 · Μηνιαίο email LAB με ανάλυση βαρδιών · [Checkpoint](CHANGES/2026-11-16-lab-monthly-shifts.md).

- 2026-11-16 · Νο 34 · Μηνιαία σύγκριση προμηθευτών #3946 · CI στο main μπλοκαρισμένο στον έλεγχο καταγραφής. Εγκατάσταση και παραλαβή LAB εκκρεμούν. [Checkpoint](CHANGES/2026-11-16-monthly-supplier-report-release.md)

- Νο 34 · [Δοκιμή email προμηθευτών LAB](CHANGES/2026-11-16-supplier-lab-mail-test.md). Εκκρεμεί επιβεβαίωση παραλαβής.

- Νο 34 · [Επιβεβαίωση SMTP στο LAB](CHANGES/2026-11-16-lab-smtp-confirmation-fix.md). Εκκρεμεί πραγματική παραλαβή στο inbox.

## Νο 31 — Προϊόντα χαμηλής απόδοσης

- 17/11/2026 · [Διόρθωση προβολής κινητού](CHANGES/2026-11-17-no31-mobile-report.md). Φόρτωση Ιδιοκτήτη σε προβολή υπολογιστή επιβεβαιωμένη. Κύλιση και σταθερότητα στο Android εκκρεμούν.

- 17/11/2026 · [Δοκιμή Ιδιοκτήτη σε φυσική συσκευή](CHANGES/2026-11-17-no31-lab-owner-window.md). Προσωρινή πρόσβαση στο υπάρχον LAB. Λειτουργική αποδοχή εκκρεμεί.

- 16/11/2026 · Το [#3963](https://github.com/xrhstosmanis-design/myworkstation-app/pull/3963) ενσωματώθηκε και εγκαταστάθηκε ως `082d759`. Super Admin LAB PASS για φόρτωση, ιστορικό, σελιδοποίηση, αναζήτηση, φίλτρα και διασταύρωση δείγματος. [Τεκμήριο](CHANGES/2026-11-16-no31-hosted-lab-acceptance.md). Στο υπάρχον LAB δεν βρέθηκε ολοκληρωμένη πώληση ενεργού είδους με εγκεκριμένο προγενέστερο παραστατικό στο ίδιο κατάστημα σε δείγμα 365 ημερών. Γνωστό περιθώριο και κόστος συσκευασίας επαληθεύτηκαν στο CI. Ξεχωριστή αποδοχή Ιδιοκτήτη και φυσικής συσκευής παραμένει εκκρεμής.

- Νο 34 · [Περιορισμός ανάκλησης άδειας ταμείου](CHANGES/2026-11-16-automatic-report-grant-revocation-scope.md). Εκκρεμεί η ρύθμιση αυτόματης σύγκρισης προμηθευτών στο LAB.

- Νο 34 · [Ρύθμιση μηνιαίας σύγκρισης προμηθευτών LAB](CHANGES/2026-11-16-lab-monthly-supplier-authorization.md). Εκκρεμεί δοκιμή ρύθμισης και προγραμματισμένης παραλαβής.

17/11/2026 — Νο 7 · [Κοινός έλεγχος δικαιωμάτων](CHANGES/2026-11-16-no7-manager-invoice-cancel.md).

- Νο 7 · [Δοκιμή προσωπικού υπευθύνου LAB](CHANGES/2026-11-17-lab-manager-invoice-and-shift-report.md). Επαναφορά και ακύρωση επιβεβαιώθηκαν. Εκκρεμούν αναφορά βαρδιών και έλεγχος περιορισμού δικαιωμάτων.

17/11/2026 — Νο 7 · Διόρθωση πρόσβασης αναφοράς βαρδιών μετά τη δοκιμή LAB.

- 17/11/2026 — Νο 3: είσοδος στη Θυρίδα επιλεγμένου καταστήματος. [Checkpoint](CHANGES/2026-11-17-no3-invoice-entry-port.md).

- Νο 34 · [Έγκριση Super Admin στη μηνιαία αποστολή](CHANGES/2026-11-17-supplier-admin-eligibility.md). Τοπικοί έλεγχοι PASS. Παράδοση LAB εκκρεμεί.

- 17/11/2026 · Νο 2, Θυρίδα myDATA, POS και πληρωμές. [Συνέχεια και ενιαία δοκιμή LAB](CHANGES/2026-11-17-no2-mydata-pos-reconciliation.md).

- 17/11/2026 · Νο 2 · Άνοιγμα υπάρχοντος προχείρου από την ενσωματωμένη Θυρίδα. 36 τοπικοί έλεγχοι PASS. CI και στοχευμένος επανέλεγχος LAB εκκρεμούν. [Checkpoint](CHANGES/2026-11-17-no2-mydata-pos-reconciliation.md).

- Νο 3 — [Πληρωτέο φωτογραφιών OCR](CHANGES/2026-11-17-no3-ocr-photo-payable.md) · PR #3996.

- 17/11/2026 · Νο 2 · Συμβατότητα παλιών κοινών πληρωμών myDATA–POS. 39 τοπικοί έλεγχοι PASS και στοχευμένος SQL έλεγχος. Πλήρες CI και τελική κοινή συνεδρία LAB εκκρεμούν. [Checkpoint](CHANGES/2026-11-17-no2-mydata-pos-reconciliation.md).

## 18/11/2026 — NETLINK-STORE-CREDENTIALS-01 — retained handoff / SOURCE CANDIDATE, NOT RELEASED

Owner remains /root. Documentation claim #4015 merged before source. Source PR [#4016](https://github.com/xrhstosmanis-design/myworkstation-app/pull/4016), branch `codex/netlink-store-connection-source-20261118`, current candidate `f073c815435e01c4e2a48409bd4b8c3599db0d58`, exact tree `5d712b5cb0a46490218a687622b2e6fb6f47e264`. No transfer/release of this scope or provider certification; other owners remain untouched.

Completed source: encrypted credentials and Station ID per selected store in existing integration storage; default-disabled configuration, explicit enable/disable, admin authentication/catalogue check; scoped provider resolution without global store credentials or cross-request token reuse. Existing selected-store integrations dialog contains the form. Preserve existing module/auth/demo/fiscal/execute/idempotency/commission/fee guards. Passwords are never returned or audited in plaintext. Authentication/read-only transport deadlines leave card execution transport semantics unchanged.

Validation already observed on unchanged runtime `bd0e268f27ea2c5d39a97397e3ad426130fff5cc`: full Node20 server suite **6178 tests / 6177 PASS / 0 FAIL / 1 optional PGlite SKIP**, including actual isolated PostgreSQL migration, credential/audit rollback, store/role HTTP checks and legacy EFOOD compatibility. Backup monitor **8/8 PASS**; Node20 client build, browser geometry, production invariants and isolated archive import passed. Current candidate differs only in documentation and retained E2E/browser fixture callers that now recognize the required selected-store status/menu URLs. The prior Netlink E2E missing-store400 is preserved as an explicit denial assertion; all original mock sale/fiscal/replay/commission/shift-close assertions remain.

Final exact-candidate CI is [run 44325741634](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44325741634), job `134876754213`; it was in progress when this handoff was written. Its live conclusion and PR head/check metadata are authoritative: observe this run, do not restart transactions or full tests merely to update a checkpoint. This dated snapshot does not assert final CI success, LAB PASS or deployed availability. Earlier failed CI runs are documented in the source checkpoint, not erased.

No production source merge, deployment, migration, credential entry, connection check, transaction, PIN or charge occurred. New provider-store identity is explicitly NOT VERIFIED: catalogue access is not a Netlink statement. Actual credential entry/identity, printers and the owner's grouped acceptance remain separate. Existing destructive RESET kind guards remain unchanged and closed to unreviewed NETLINK credentials.

Single next sequence: observe exact-head final CI to completion and correct any actual failure; after green checks obtain the owner's separate production merge/deploy approval, use the existing guarded installation, verify the deployed revision, then perform the final grouped acceptance on the existing LAB. Do not ask the owner to switch POS/SuperAdmin/owner roles for partial tests. Keep this source assigned to /root until an explicit named handoff.

Source checkpoint: `CHECKPOINTS/CHANGES/2026-11-18-netlink-store-connection-source.md` on the source branch. Oversized historical trackers remain preserved; this record and the 18Nov Netlink continuations provide the bounded current scope.

## 18/11/2026 — NETLINK final exact-head CI SUCCESS / READY FOR RELEASE REVIEW, AWAITING OWNER AND LAB

Source PR [#4016](https://github.com/xrhstosmanis-design/myworkstation-app/pull/4016) is ready for review (not draft), still unmerged. Exact head `f073c815435e01c4e2a48409bd4b8c3599db0d58`, tree `5d712b5cb0a46490218a687622b2e6fb6f47e264`. [CI 44325741634 attempt 2](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/44325741634/attempts/2): **all five jobs SUCCESS**, including build/test, isolated wholesale browser/offline, both Windows checks and change classification. Node20 full server suite **6178 tests / 6177 PASS / 0 FAIL / 1 optional PGlite SKIP**; actual isolated PostgreSQL migration, encrypted credentials, atomic audit rollback, company/store/role HTTP and legacy EFOOD checks all executed and passed. Backup monitor **8/8 PASS, 0 SKIP**. Node20 client build, actual browser geometry/pointer checks, production safety invariants, isolated archive import and complete real HTTP E2E batch passed. Retained Netlink E2E explicitly passed auth/licensing, selected-store catalogue, fiscal receipt, once-only POS/execute, commission, settlement and shift close.

The final failed-job retry was on the same source after a Chromium Target.createTarget startup timeout in the unchanged device-dialog test. No code, assertion, deadline or skip was changed for that retry. Earlier genuine label/caller compatibility failures remain documented in the source checkpoint. The final successful run supersedes the earlier CI-in-progress snapshot for this exact source head only.

Implementation and automated verification are complete for per-store connection configuration and non-issuing authentication/catalogue check. Owner stays /root. **No source merge, production installation, reviewed schema application, real credentials, provider check, transaction or financial action has been performed.** No LAB/LIVE/USER functional PASS or manual release is claimed. Existing provider certification and store identity by Netlink statement remain separate and unverified.

Single next action: owner's separate approval for production source merge/deploy, then the existing guarded installation and exact deployed revision check. Preserve the requested final grouped acceptance on the existing LAB; do not ask for partial role-switching or repeat real transactions. Source remains assigned to /root until an explicit named handoff.


## 18/11/2026 — Νο2 / #4019 — συγκεκριμένη μεταφορά οικονομικής ένδειξης

ΑΝΑΛΗΨΗ ΑΠΟ `feat/invoice-month-audit-20261028` / `/root/invoice_new` — ASSIGNED `/root`, branch `fix/no2-paid-monthly-status`, με ρητή έγκριση ιδιοκτήτη. Μόνο οικονομική κατάσταση συνδεδεμένης πληρωμής στη μηνιαία αναφορά, όχι υπόλοιπο C, snapshots/απογραφή ή email. Ο παλιός owner διατηρεί όλα τα άλλα scopes· καμία παράλληλη αλλαγή #4019. [Checkpoint](CHANGES/2026-11-18-no2-paid-monthly-status.md). CLAIM / source NOT STARTED / CI και LAB NOT TESTED. Υλοποίηση και τεχνικοί έλεγχοι πρώτα, μία τελική συνεδρία ανά ρόλο στο τέλος.

- 18/11/2026 · Νο2 #4019 · claim #4020 merged `61989ed5` μετά green docs checks. Source `fix/no2-paid-monthly-observation`: χωριστή οικονομική κατάσταση με κοινό settlement predicate, ακριβείς δόσεις και read-only scoped πηγές. Node20 build/στοχευμένοι έλεγχοι PASS· local Chromium launch ECONNRESET και native PG SKIP διατηρούνται, πλήρες CI/εγκατάσταση/LAB OPEN. [Checkpoint](CHANGES/2026-11-18-no2-paid-monthly-status.md). Καμία νέα πληρωμή ή αλλαγή αποθέματος.

- 18/11/2026 · Νο2 #4019 · source #4022 merged/installed `199916bc`, Render `dep-dbuva7mk1f9s73aq3gu0` LIVE και exact health επιβεβαιωμένα. PR/main CI SUCCESS, main 6.233 application PASS/0FAIL/2optionalWASM-SKIP +8backupPASS· actual PostgreSQL financial/allocation και Chromium μηνιαίας οθόνης PASS. Περιορισμένο LIVE Super Admin: υπάρχον πληρωμένο myDATA/POS παραστατικό εμφανίζεται Εξοφλημένο, με χωριστές workflow λεπτομέρειες. Όχι νέα πληρωμή ή αλλαγή αποθέματος. Υπόλοιπη ομαδική LAB αποδοχή/άλλοι ρόλοι και email παραμένουν εκτός αυτού του PASS. [Checkpoint](CHANGES/2026-11-18-no2-paid-monthly-status.md), [Manual](../docs/manual/monthly-invoice-audit/PASS.md).

## 18/11/2026 — Νο 15 · Χρεώσιμες επιλογές από κινητό

Συνέχεια TABLE_SERVICE /root, υποβοηθός /root/mobile, branch `feat/table-service-mobile-priced-options-20261118`. Η κινητή παραγγελιοληψία επιλέγει πραγματικές χρεώσιμες επιλογές και εμφανίζει γραμμή/σύνολο/επιβεβαίωση με την επιβάρυνση. Ο server επαληθεύει τιμές και προϊόντα. Εισφορά/SET διατηρούνται στο POS. Τοπικά Node20: 5/5 πραγματικές mounted React δοκιμές και production build PASS. CI, εγκατάσταση και κοινή δοκιμή LAB εκκρεμούν. [Checkpoint](CHANGES/2026-11-18-table-service-mobile-priced-options.md).

## 18/11/2026 — CENTRAL-WAREHOUSE-FILTER-PARITY-01 — PUBLICATION APPROVED / RECONCILED MAIN

Ο ιδιοκτήτης ενέκρινε τη συγχώνευση και δημοσίευση του #4029 και επανέλαβε «συνεχισε»/«ξεκινα». Η έγκριση ισχύει. Τοπική συμφιλίωση με main c88b7aad (διατηρούνται οι αλλαγές εστίασης #4023/#4024) επιλύει μόνο σύγκρουση προθέματος στην κοινή ενεργή καταγραφή. Οι δύο εγκεκριμένοι warehouse UI/CSS blobs παραμένουν ακριβώς ίδιοι με eee2f0e997140fc207f8d9d9575c295e2b401306. Καμία αλλαγή της ζητούμενης λειτουργίας, δικαιωμάτων ή δεδομένων. Το προηγούμενο PR CI 44383411469 παραμένει ιστορικό PASS της αρχικής έκδοσης· η νέα συνδυασμένη έκδοση απαιτεί δικό της πλήρες CI πριν από merge και κανονικό guarded deploy. Καμία νέα έγκριση ή επανάληψη δοκιμής χρήστη δεν ζητείται.

## 18/11/2026 — CENTRAL-WAREHOUSE-FILTER-PARITY-01 — SOURCE CANDIDATE / AWAITING CI AND LAB

Before-source claim #4027 merged `44ccf51976ba7baa03e37f582e260fd914bf9796`. Same /root owner, independent source scope retained. The Central/Owner archive now renders the existing VAT department and margin range controls already used by POS, with the same responsive filter panel and visible Filters focus/scroll action. Category/subcategory/status selections apply immediately like POS and reset pagination. Search, VAT, margin, selected-store read binding, capabilities, readOnly and staff edit boundaries retain their existing semantics. No backend/API, product/stock/price, permission, module, schema or financial/fiscal change.

Local validation on Node24.22.1: retained inventory-bulk-merge-mounted, inventory-archive-kiosk-v1 and product-card-vat-mounted suites 16/16 PASS, 0 FAIL/SKIP. An initial heading-only compatibility failure was corrected by retaining the existing Central heading. Separate temporary mounted actual-React verification with synthetic API responses passed for Central, POS and readOnly: VAT/margin combined with category/subcategory/status/text, first-page reset, selected-store replacement and header focus. 27 GET requests, zero writes. No permanent test mirroring this low-impact rendering change was added.

Final frontend build PASS (Vite30.18s), TABLE_SERVICE bundle verification PASS, diff --check PASS. Local Chromium visual execution was unavailable because the execution environment denied its process-singleton socket; no screenshot or visual/device PASS is claimed. The CSS reuses the existing POS filter layout and adds single-column narrow forms. Full exact-head Node20 CI and installed Central/physical-device acceptance remain outstanding.

Next: source PR/full CI; owner approval for source merge/publication; existing LAB/common final acceptance without changing stock, prices, permissions or stores. Do not repeat prior POS Filters USER PASS, and do not confuse the earlier PDF/shift-close acceptance with this independent warehouse request. Manual PASS is unchanged until genuine acceptance.
