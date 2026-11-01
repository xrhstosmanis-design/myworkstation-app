# Common Owner BackOffice: permission integration ledger

Scope: CENTRAL-BACKOFFICE-ACCESS-01, retained owner feat/backoffice-common-permissions-20261101.

This is implementation tracking, not a usage manual or a PASS claim. The 55 families and 340 candidate action names below require native-operation review; a name does not establish that the native module offers that action. Only the existing 18 validated capabilities are currently grantable. No wildcard, role promotion, automatic grant or company authority follows from this ledger.

The machine discovery snapshot follows the complete entry import graph, including POS/platform/bootstrap candidates, and inventories server route declarations. Those candidates require explicit Owner BackOffice classification. Dynamic HTML and controls, computed requests, route mounts and the recorded parse failure remain manual review items. The snapshot is not an authorization policy and cannot prove complete runtime coverage.

Shared UI foundation in source: identical BackofficeShell and BackofficeStores for Owner/personal sessions; same native StoreCloudPage for delegated shifts/payments, with existing per-action controls. Ordinary Owner functionality preserved. Personal-only stocktake/cash orchestration and other commerce modules still need native UI integration. No new backend capability or permission-editor checkbox is enabled in this source batch.

| Function | Scope | Candidate actions under review | Existing native capabilities |
|---|---|---|---|
| Χειριστές και δικαιώματα | COMPANY | read, create, edit, disable, grant, revoke | NOT INTEGRATED |
| Καταστήματα | COMPANY | read, create, edit, configure, archive | NOT INTEGRATED |
| Εργαζόμενοι και κάρτες | STORE | read, create, edit, disable, issue-card, export, print | NOT INTEGRATED |
| Πρόγραμμα βαρδιών | STORE | read, create, edit, publish, delete, export, print | NOT INTEGRATED |
| Άδειες και ρεπό | STORE | read, create, edit, approve, reject, delete | NOT INTEGRATED |
| Παρουσίες και ώρες | STORE | read, correct, approve, export, print | NOT INTEGRATED |
| Chat καταστήματος | STORE | read, send, attach, forward, delete, manage | NOT INTEGRATED |
| Είδη καταστήματος | STORE | read, create, edit, delete, opening-stock, import, export, print | products.read, products.create, products.opening-stock |
| Κεντρικές καρτέλες προϊόντων | COMPANY | read, create, edit, delete, merge, import, export | NOT INTEGRATED |
| Κατηγορίες, ΦΠΑ και ταξινομήσεις | COMPANY | read, create, edit, delete, import, export | NOT INTEGRATED |
| Τιμές και τιμοκατάλογοι | STORE | read, edit, bulk-edit, import, export, print | NOT INTEGRATED |
| Προσφορές | STORE | read, create, edit, activate, delete | NOT INTEGRATED |
| Αποθήκη και κινήσεις | STORE | read, receive, adjust, waste, reverse, import, export, print | NOT INTEGRATED |
| Απογραφή | STORE | read, count, create, finalize, reopen, delete, import, export, print | inventory.read, inventory.count, inventory.create, inventory.finalize |
| Μεταφορές αποθήκης | STORE | read, create, approve, dispatch, receive, cancel, export, print | NOT INTEGRATED |
| Συνταγές | COMPANY | read, create, edit, delete, produce, export | NOT INTEGRATED |
| Ψησίματα και παραγωγή | STORE | read, create, finalize, cancel, configure, export | NOT INTEGRATED |
| Προμηθευτές | COMPANY | read, create, edit, disable, import, export | NOT INTEGRATED |
| Σύγκριση προμηθευτών | STORE | read, compare, export, print | NOT INTEGRATED |
| Προτάσεις παραγγελίας | STORE | read, calculate, edit, approve, send, export, print | NOT INTEGRATED |
| Παραγγελίες αγορών | STORE | read, create, edit, approve, send, cancel, export, print | NOT INTEGRATED |
| Αγορές και τιμολόγια | STORE | read, create, edit, approve, reopen, delete, credit, export, print | invoices.read, invoices.edit, invoices.approve |
| Θυρίδα και πρωτότυπα | STORE | read, upload, download, sync, review, delete, export, print | NOT INTEGRATED |
| Ανάγνωση και βοηθός τιμολογίων | STORE | read, submit, recheck, correct, link, approve | NOT INTEGRATED |
| Μηνιαίος έλεγχος τιμολογίων | STORE | read, calculate, approve, export, print, email | NOT INTEGRATED |
| Μηνιαία απογραφή και εξουσιοδότηση | STORE | read, grant, revoke, trigger, finalize, export | NOT INTEGRATED |
| Πωλήσεις | STORE | read, cancel, return, reverse, export, print | sales.read, sales.cancel |
| Βάρδιες και ταμεία | STORE | read, open, close, force-close, export, print | shifts.close |
| Πληρωμές | STORE | read, supplier, expense, cash, correct, cancel, export, print | payments.read, payments.supplier, payments.expense, payments.cash |
| Έλεγχος ταμείων | STORE | read, investigate, review, explain, confirm-shortage, reopen, export, print | cash.read |
| Μεταφορές μετρητών | STORE | read, create, confirm, cancel, export, print | NOT INTEGRATED |
| Τράπεζες και συμφωνίες | COMPANY | read, create, edit, import, match, approve, reverse, export | NOT INTEGRATED |
| Εκκρεμείς επιβεβαιώσεις | STORE | read, approve, reject, request-proof, reverse | NOT INTEGRATED |
| Πελάτες και οφειλές | COMPANY | read, create, edit, disable, receive, adjust, import, export, print | NOT INTEGRATED |
| Κάρτες κοινού και επιβράβευση | STORE | read, create, edit, issue, disable, configure, export, print | NOT INTEGRATED |
| Online παραγγελίες | STORE | read, accept, edit, reject, dispatch, complete, configure, export | NOT INTEGRATED |
| Τραπέζια και σερβιτόροι | STORE | read, create, edit, transfer, close, configure, export, print | NOT INTEGRATED |
| Χονδρική B2B | STORE | read, create, edit, approve, send, cancel, configure, export, print | NOT INTEGRATED |
| Παράδοση βάρδιας | STORE | read, create, acknowledge, edit, delete, export | NOT INTEGRATED |
| Κέντρο εκκρεμοτήτων | STORE | read, create, assign, edit, resolve, delete, export | NOT INTEGRATED |
| Πωλήσεις, κέρδος και margin | STORE | read, calculate, export, print, email | NOT INTEGRATED |
| Αναφορές | STORE | read, generate, export, print, email | NOT INTEGRATED |
| Αυτόματες αναφορές | STORE | read, configure, recipients, send, disable | NOT INTEGRATED |
| Κάμερες και Video Audit | STORE | read, playback, export, annotate, configure | NOT INTEGRATED |
| Συσκευές και διασυνδέσεις | STORE | read, pair, configure, disconnect, diagnose | NOT INTEGRATED |
| Σάρωση παραστατικών | STORE | read, scan, install, configure | NOT INTEGRATED |
| Εκτυπώσεις και ετικέτες | STORE | read, print, install, configure | NOT INTEGRATED |
| Παράμετροι επιχείρησης | COMPANY | read, edit, configure | NOT INTEGRATED |
| Αντίγραφα ασφαλείας | COMPANY | read, create, download, restore, configure | NOT INTEGRATED |
| Βοηθός ιδιοκτήτη | STORE | read, ask, export | NOT INTEGRATED |
| Πιστώσεις και χρεώσεις AI | COMPANY | read, fund, settle, configure, export | NOT INTEGRATED |
| Υποστήριξη και συντήρηση | STORE | read, create, attach, diagnose, resolve | NOT INTEGRATED |
| Καταγραφή οθόνης | STORE | read, record, export, delete | NOT INTEGRATED |
| Online ραδιόφωνο | STORE | read, play, configure | NOT INTEGRATED |
| Αρχειοθέτηση και κύκλος καταστήματος | COMPANY | read, preview, archive, restore, reset, delete | NOT INTEGRATED |

Next integration order: shared commerce entry and native stocktake/cash screens; independent company-grant model (store authority cannot imply company authority); exact module/action admission with transaction-time revalidation; native UI controls and direct-API abuse tests for each operation. Company/security schema or recovery-manifest changes need their own explicit reviewed compatibility record, preserving the independently owned monthly FULL transition and worker catalogue. Existing fiscal/payment/stock algorithms are not redesigned by this assignment.

Release gate for every source batch: updated checkpoint and active list, full exact PR/main native CI, ordinary guarded exact healthy release, then separately measured hosted acceptance. Existing Owner/staff grants are never edited by this page. Whole all-functions scope remains OPEN until every applicable native operation is integrated and accepted.

Native inventory follow-up source (same retained owner, feat/backoffice-native-inventory-20261101): actual InventoryV2Center/InventoryFastCount now reused through explicit controlled personal inputs, redacted selected-store reads and existing canonical create/count/finalize coordination. Read-only and blind counter fields/actions stay separate; Owner-only zones/grants/delete/clear/bulk/import/export/product/print operations remain denied. Same Owner scanner-add/pencil-replace semantics. No executable capability added; no company authority implied. Local38/0/0 and Work build passed; exact full CI/release/hosted acceptance still required. Cash/commerce and all broader operation coverage remain OPEN.

Native cash read follow-up source (same owner, feat/backoffice-native-cash-20261101): CashControlPanel/CashReconciliationPanel now host the existing personal cash.read report through its exact scoped endpoint, with native period controls, verified-copy and stale/invalid-result fences. Owner-only overview/daily/paper/investigation/review/import/export/history pagination remain unavailable; no fabricated zero card or new authority. Local46/0/0 and Work build passed; full exact CI/release and hosted acceptance still required. Broader commerce, per-action editor/backend and explicit company authority remain OPEN.
