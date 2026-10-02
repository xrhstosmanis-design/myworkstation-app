# Checkpoint — MyWorkStation → RBS CAP Driver v1

Date: 2026-10-02  
Owner: `agent/rbs-capdriver-v1-operator-confirm-20261002`  
Status: ASSIGNED · AWAITING CI · PC1 unchanged

## Goal

Issue a real fiscal receipt from the MyWorkStation POS through the existing RBS
CAP Driver already used by Kiosk Manager on PC1. The files and Observer captures
shared on 02/10 are diagnostic evidence for identifying the protocol; they do
not show that MyWorkStation has issued a receipt.

## Confirmed constraints and evidence

- The owner chose the first/existing CAP Driver path. Keep the later CAP Driver
  variant with automatic responses as a separate second stage. The operator
  Yes/No confirmation and the pending/declined transaction rules in this
  checkpoint apply only to the first, existing driver flow; they do not define
  the newer driver's response behavior.
- The owner clarified that the newer driver writes a result to an `OUTPUT`
  folder and reports whether the transaction succeeded, but is currently too
  slow for use. Do not select or integrate that output-response path in this
  first-driver scope; retain it only as a later, separate option.
- Compared the two supplied service ZIPs locally: executable and manual files
  are byte-identical; their `CapDriverSVC.ini` files differ. The older config
  has `WORKFOLDER` and code page 1253 without `OUTPUTFOLDER`; the newer config
  additionally sets `OUTPUTFOLDER`. This supports treating the output replies
  as a separately configured path and keeping it out of this first scope.
- The supplied `capture1.zip` contains 18,710 output response files, including
  `OK` replies and explicit `EFTPOS Payment Failed` replies. The owner reports
  that this response path is too slow; it remains excluded from the first
  implementation.
- Do not change, install, stop, reconfigure, or send a command from PC1 during
  this implementation stage. Kiosk Manager, RBS, CapDriver, EFTPOS and Windows
  settings stay untouched.
- Every fiscal command must be sent at most once. No automatic resend after
  timeout, network loss, process restart, or uncertain response.
- Cash: confirm physical receipt printing during the initial controlled test only; do not add a recurring Yes/No prompt for ordinary cash sales.
- Card: keep the checkout pending until the operator answers Yes/No.
- An uncertain result stays in a review state and cannot be resent automatically.
- Official RBS download page lists CAP Driver Service 1.0, 1.2 and a separate
  hospitality/no-cancel package. The downloaded 1.0 sample config uses
  `WORKFOLDER=C:\Capture\` and `CODEPAGE=1253`; it does not declare an
  `OUTPUTFOLDER`. Its manual documents `HL`, `SL`, `CR`, `ER` and `CL`.
  Version 1.2 adds `LR`/prepayment and `OUTPUTFOLDER`; this is not the first
  path selected by the owner.
- The provided Observer bundle records file metadata and sample command bytes.
  Its own manifest says some snapshots are partial and correlation is not
  verified. These captures are not a physical-print PASS and are not a safe
  source for guessing payment mappings or receipt numbers.
- The owner confirmed that the Kiosk Manager already uses the working payment
  mappings. The provided CAP Driver captures include `CR/6/.../ΜΕΤΡΗΤΑ` and
  `CR/2/.../ΚΑΡΤΑ`; use cash code `6` and card code `2` for this PC1 route.
- The owner supplied a Kiosk Manager screenshot for the target register. It
  shows these VAT-code → cash-register-department profiles: `1→1` (13%, coffee),
  `42→2` (13%, goods), `7→4` (13%, food), `15→6` (24%, goods), `227→6` (24%,
  services), `45→7` (0%, cards), `104→8` (6%, goods), `17→13` (24%, environmental
  fee), `228→14` (24%, environmental-protection goods), and `63→21` (0%, goods).
  Therefore a VAT rate alone cannot select a register department. Draft checkout
  now reads each product's existing `vatDepartmentId` and the selected
  `ManagementVatDepartment.cashRegisterDepartment`, and fails closed when the
  department is absent or its configured VAT rate disagrees with the product.
  The package and server now contain this exact ten-entry profile list. Request
  creation checks Kiosk code, register department, and rate together; product
  assignments in the company still need to be populated and read back before
  a real receipt test.
- The 02/10 store screenshot shows Kiosk Manager → PoS terminals for `EDPS`,
  active, with payment-method code `2`. Delayed-payment code, IP, port and
  middleware are blank/disabled in the shown record; do not treat them as
  configured transport details for MyWorkStation.

## Protected behavior

- Preserve current POS pricing, discounts, customer/credit, stock, shift,
  duplicate-sale and audit rules.
- Do not create a completed sale, post payment, or change stock before the
  operator confirms successful fiscal completion.
- For card, keep the POS checkout pending until the operator answers. Yes
  creates the sale, payment and stock movement exactly once. No creates no
  sale, payment, store transaction or stock movement.
- For cash, physically verify receipt printing during the initial controlled
  test. Do not add the recurring EFTPOS Yes/No prompt to ordinary cash sales.
- An uncertain fiscal result must remain visible for manual reconciliation.
- No actual fiscal command or receipt test is part of automated tests.

## Acceptance criteria

1. Current Kiosk Manager flow and fiscal setup remain unchanged.
2. The MyWorkStation path builds the documented v1 command with explicit,
   validated RBS department/payment mappings and the PC1 code page.
3. One checkout produces one command identity and at most one file delivery.
4. Card UI remains pending for operator confirmation; cash behavior is verified
   during the initial controlled physical test.
5. Card Yes commits one POS sale/payment/stock movement exactly once; No leaves
   none.
6. Uncertain outcome enters review and permanently blocks automatic resend.
7. Only after green CI, merge, exact Render revision and an owner-led controlled
   physical test may this scope be called PASS.

## Current status after PR #1632

- PR #1632 merged as `874c6bd2e0c8efcf578e6ee2a98026d8057c5c6f`; CI #4097, #4099 and #4107 passed. CI #4107 includes Windows PowerShell 5.1 parse plus mocked pairing/writer smoke tests. Render deployment `dep-davqli0u01pc73fpjphg` was verified live on that revision.
- The ten Kiosk VAT-code/register-department profiles and selected KAT product assignments were read back and matched before merge, per PR #1632. The historical pre-merge checklist below is superseded for these completed software/configuration items.
- Owner photos on 02/10 show the existing `CapDriverSVC` running as Automatic, TCP to `192.168.1.244`, code page 1253, and work folder `C:\\capture\\`. Keep the installed driver, Kiosk Manager, RBS, EFTPOS and Windows settings unchanged. The saved Fiscal/EFTPOS mapping is separate from CAP Driver pairing.
- Owner reports one KAT sale was recorded as NON_FISCAL and no receipt printed. Screenshot evidence shows the transaction in the BackOffice history, but the exact transaction ID and before/after financial/stock baselines were not captured here. Treat the transaction as existing; do not repeat it, resend it, reprint it, or infer a measured balance change.
- The live application has no visible pairing-code generator. Follow-up branch `agent/rbs-capdriver-pairing-ui-20261002` adds an owner-scoped 15-minute one-time pairing panel to the existing BackOffice page, using the existing `POST /api/cloud/v1/stores/:storeId/pairing-code` route. The server continues to enforce OWNER/ADMIN plus active store/company ownership and audit the event.
- No pairing code has been created, no Windows writer has been paired or started, and no fiscal command has been sent. UI build/CI, merge, exact deployment and owner-led physical acceptance remain pending. No LAB/physical receipt PASS is claimed.


## Operator checkpoint — first live POS attempt, 2026-10-02

**Result: FAIL / no fiscal receipt; investigation OPEN. Do not retry or duplicate the sale.** The owner has left KAT and cannot perform an on-site check now.

- Pairing was completed on the KAT Windows account and the supplied `Writer.ps1` was started. Do not record or reuse the one-time pairing secret.
- In Standard POS, the owner selected Coca-Cola 500 ml (shown under 13% VAT, “Αναψυκτικά”), total **€1.20**, then pressed **Μετρητά** once. POS showed a generic internal error; owner confirmed no receipt printed. The checkout screen still showed €1.20. Do not press cash again, resend, reprint, or assume the sale was fiscal.
- Read-only PC checks: Windows service `CapDriverSVC` was **Running**; `C:\\capture\\Xcommand.txt` was **absent**. `C:\\capture` contained only `CapDriverSVC_log.txt` (about 1.06 MB). Visible CAP log lines were from Kiosk Manager activity; they are not evidence that this MyWorkStation attempt reached CAP Driver.
- The application’s saved Fiscal/EFTPOS mapping is separate from CAP Driver pairing/dispatch. The mapping page showed the chosen terminal and “mapping saved”; reopening it reset to the empty selector in a separate view. Do not treat EFTPOS mapping as proof of CAP delivery or printer setup.
- Current diagnostic evidence does **not** identify a root cause or prove a request reached the Windows writer. The earlier BackOffice history contained a NON_FISCAL €3.20 sale from a prior attempt; that is a distinct existing record and must not be repeated, resent, reprinted, or used to infer this €1.20 attempt’s outcome.
- Render app error logs showed no correlated entry. Request-log query was unavailable (Loki 503), and metrics returned no useful records. No root cause established.

### Next steps when the owner is back at KAT

1. First reconcile the €1.20 attempt in BackOffice and confirm whether any transaction record exists. Do not create another sale until its state is known.
2. Capture the exact timestamp, checkout/transaction ID, and visible error details. Read-only inspect the pairing/writer window and service state; check whether a new `Xcommand.txt` or CAP log entry appeared after the attempt. Preserve files; do not delete or replay commands.
3. Correlate that transaction ID/time with server dispatch/result/audit records and the Windows writer poll/result. If no command was delivered, fix the app→writer request path before another physical attempt. If delivery is uncertain, keep the sale in reconciliation and do not resend.
4. Only after a documented safe state and an owner-controlled test plan, use one controlled low-value product with its confirmed VAT-code→cash-register-department assignment. Click cash once, verify a physical fiscal receipt and transaction state, then record measured before/after values. Never test by charging a real card.
5. Update this checkpoint with evidence and PASS/FAIL before any future page proceeds. A physical receipt PASS is still outstanding.

## Current implementation and mainline

- PR #1632 merged as `874c6bd2e0c8efcf578e6ee2a98026d8057c5c6f`; CI #4097, #4099, #4107 passed, including Windows PowerShell 5.1 parse and mocked pairing/writer smoke tests. Render deployment `dep-davqli0u01pc73fpjphg` was verified live on that revision.
- Central VAT department handling and the ten Kiosk VAT-code→register-department profiles were read back before merge; product assignment and mapping work is recorded in the historical checkpoint above. The captured live attempt still did not print a receipt.
- PC1/Kiosk Manager/RBS/CAP Driver/EFTPOS/Windows configuration must remain unchanged. No automated test sends a fiscal command.


## Follow-up — central category/VAT mapping correction (2026-10-02)

- User clarified that the intended rule is automatic mapping from product **category** to the correct VAT/cash-register department. A VAT percentage alone is insufficient because multiple register departments share the same rate.
- PR #1635: https://github.com/xrhstosmanis-design/myworkstation-app/pull/1635. Adds company-scoped category → VAT-department mapping in the management VAT panel; POS uses the mapped category department for fiscal dispatch, with existing product-level assignment as fallback.
- Mapping validation rejects categories containing products whose VAT rate differs from the selected VAT department. It never changes product VAT rates. This is a deliberate fail-closed guard; split mixed-rate products into appropriate categories before mapping.
- CI #4117 is **in progress** on head `11952b03da564ec97bbb0510ba05a953168a2109`. PR is open and not merged; not deployed or active at KAT. No live category assignments have been written.
- After CI passes: merge/deploy, verify exact Render revision, configure the beverage category against the confirmed Kiosk VAT department, verify the Coca-Cola item resolves to that department and correct 13% rate, then do a controlled one-time cash receipt test only after reconciling the prior €1.20 attempt. Never retry while the result is uncertain.


## CI follow-up status (2026-10-02 22:30 Athens)

- PR #1635 remains open with the category-mapping implementation and the required KAT active-list/checkpoint changes.
- CI #4117 failed only at the checkpoint policy gate because those documentation files were missing from the original PR diff. The Windows PowerShell parse and mocked pairing/writer smoke job passed. The build-and-test job skipped application tests after the documentation gate failed.
- The docs have since been added to the PR branch and PR #1635 reopened. No fresh CI run is visible yet for its current head `63653f898d09f283e174e25107cabc5381a32b1e`. Do not merge or deploy until a fresh full CI run passes.


## HOME safety follow-up — 2026-10-02 22:38 Europe/Athens

Status: **LOCAL PASS / AWAITING WINDOWS CI, MERGE, DEPLOY AND PHYSICAL ACCEPTANCE**.

- Root cause of the €1.20 attempt remains unproven. The observed absence of
  `C:\\capture\\Xcommand.txt` only proves that no command file was visible at
  inspection time; it does not prove whether the server request was prepared,
  claimed or never reached by the writer.
- A paired device no longer activates the fiscal path by itself. The POS now
  requires the paired writer to have completed an authenticated `/next` poll
  within the last 15 seconds. `Test-Connection.ps1` validates authentication,
  module access and the configured work-folder path without claiming a request,
  marking the writer online or creating `Xcommand.txt`.
- If a writer is configured but not currently polling, cash/card checkout fails
  closed with an explicit Writer-offline message before any sale, payment,
  stock movement or CAP Driver command is created.
- Before claiming a queued command, the server moves every `PREPARED` request
  older than 60 seconds to `REQUIRES_CHECK`. Therefore an old request cannot be
  delivered automatically when the writer is restarted later. No automatic
  resend was added.
- `Writer.ps1` stores timestamped diagnostics in
  `%LOCALAPPDATA%\\MyWorkStation\\RbsCapDriverV1\\writer.log` without logging the
  device token or raw command. BackOffice and POS display live ONLINE/OFFLINE
  status based on the same 15-second poll window.
- Local evidence: focused CAP Driver tests **9/9 PASS**; full server suite
  **1796 PASS / 0 FAIL / 1 SKIP** after Prisma generation; frontend production
  build PASS; diff check PASS. The local Linux environment has no PowerShell,
  so the PowerShell 5.1 parse/mock smoke remains an explicit CI requirement.
- No Render call, production database write, pairing operation, writer poll,
  CAP file, RBS/EFTPOS action, sale, payment or stock change occurred during
  this HOME work.

Next action: push the bounded branch, require green CI including the Windows
PowerShell smoke, merge and verify the exact Render revision. At KAT, first
reconcile the existing €1.20 attempt read-only, run `Test-Connection.ps1`, start
`Writer.ps1`, wait for `WRITER ONLINE`, and only then prepare one separately
identified low-value physical test with a fresh measured baseline.


## CI #4126 follow-up — Windows smoke assertion scope

- Windows PowerShell 5.1 parsed `Pair.ps1` and `Writer.ps1` successfully.
- The isolated smoke executed mocked pairing, the non-claiming connection test,
  one writer poll, one `Xcommand.txt` write and one `WRITTEN` dispatch result.
- The job failed only at the final connection-status call-count assertion because
  `$script:statusCalls` resolved to the invoked child script's scope. The log
  showed the expected `/status` request, but the parent assertion read zero.
- The counter is now a namespaced global test variable and is removed in the
  outer `finally` block. This changes only the isolated test harness; production
  writer behavior, dispatch rules and KAT configuration remain unchanged.
- Fresh Windows CI is required. No merge or deploy is allowed from CI #4126.


## Follow-up — product-level VAT department selection (2026-10-02)

- Ο χρήστης διευκρίνισε ότι η σωστή συμπεριφορά είναι όπως στο Kiosk Manager: το Τμήμα ΦΠΑ επιλέγεται πάνω στο προϊόν. Η κατηγορία δεν αποτελεί πηγή τμήματος ή συντελεστή, επειδή προϊόν σε λάθος κατηγορία θα μπορούσε να πάρει λάθος ΦΠΑ. Η παλαιότερη πρόταση category → VAT mapping στο παρόν checkpoint superseded από αυτή τη διευκρίνιση.
- Στην επιλογή τμήματος εμφανίζεται το νούμερο «Τμήμα ταμειακής» μαζί με περιγραφή και ΦΠΑ, ώστε ο χειριστής να επιλέγει την αντίστοιχη εγγραφή του Kiosk.
- Το κεντρικό bulk assignment επικυρώνει ότι το υφιστάμενο `Product.vatRate` συμφωνεί με το VAT department. Ασυμφωνία επιστρέφει 409 και δεν αλλάζει προϊόντα. Επιτυχής αλλαγή ενημερώνει μόνο `Product.vatDepartmentId`, διατηρεί `vatRate` και επιστρέφει `vatRatesChanged: 0`.
- PR #1642 merged στο `main` ως `511c72c92da7ddddafbe9ce2032301ece730e9bc` και CI #4131 PASS. Το Render deploy `dep-db011du0tbcc73fo5pr0` επιβεβαιώθηκε `live`. Νεότερο deploy για descendant commit `eb7e71db606fe3dea112a2e600cb1d69e1608a91` βρίσκεται σε εξέλιξη και περιλαμβάνει το merge. Δεν έχουν γίνει live product edits ή αλλαγές σε KAT/Kiosk Manager/RBS/CAP Driver/EFTPOS/Windows.
- Η προηγούμενη συναλλαγή €1,20 παραμένει αδιευκρίνιστη/προς συμφωνία. Καμία νέα χρέωση, επανάληψη εντολής ή εκτύπωση μέχρι να συμφωνηθεί η κατάστασή της.
