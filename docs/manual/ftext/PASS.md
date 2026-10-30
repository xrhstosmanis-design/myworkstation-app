## 30 October 2026 — recovered payment error / return-to-basket USER PASS

Who/where: the original authorized cashier in the same selected physical FTEXT POS and shift, using the paired existing Windows connector. On released778d3f0, the connector recovered the original bound PAY error48 after the polling repair; the cashier then explicitly released the rejected application attempt and the owner confirmed «ΕΙΝΑΙ ΟΚ». Independent read-only records show preserved original NO/result/no-sale identity and two later distinct completed normal requests. No old sale was replayed for evidence.

Verified usage: keep the existing paired connector and FTEXT+ running; refresh the original POS. After recorded NO and recovery of the original verified payment error, use «Επιστροφή στο καλάθι» and confirm readiness only after checking the physical register/EFTPOS. The application says «Η προηγούμενη προσπάθεια έκλεισε στο MyWorkStation. Το καλάθι διατηρήθηκε.» The old attempt is not made into a sale and the cashier can resume the normal checkout flow.

Scope/security: original cashier, company, store, POS and original result/decision bindings remain enforced; no resend, bank decline or fiscal cancellation is inferred. A pending unique lock remains for unresolved/confirmed/foreign outcomes. If return is refused, preserve the original request/files and inspect its actual result. This acceptance covers this recovery and observed resumed operation, not independently measured stock/financial deltas, every device/failure or the new reviewed-unknown recovery requested afterwards. That new path remains AWAITING IMPLEMENTATION/LAB and is not part of this manual PASS.

## 26 October 2026 — limited recovered-NO confirmation UI USER PASS

Authorized original cashier in selected Rizareio/RIZAREIO-POS-01. Keep paired connector and FTEXT+ running and refresh the existing POS after release71ca6f15/PR3159. Owner observed that the blocking confirmation disappeared; image-1793013541128.jpg shows original one-item ΝΕΡΟ500ML basket0.50 retained and pending-review notice visible, without another Return button. This verifies presentation of an already-recorded NO after refresh only. Fresh NO click, physical YES/card acceptance and measured financial/stock effects remain NOT TESTED; no receipt or charge was repeated.

Current operator card setting is explicitly enabled code2/POS1/type1. Historical CARD OFF statements below describe the older dates. Tenant/POS/current configuration/original cashier checks remain enforced. Closing a dialog does not cancel an unresolved fiscal document: original request1e50a87c still has NO/REQUIRES_CHECK and no saleId. Do not send another payment, erase pending files or use RBS controls for recovery. Support inspects the existing result. On27Oct the uploaded original response showed padded code48/EFT-POS ERROR/InputLine: PAY||2; this is an error, not proof of bank decline or fiscal cancellation. Whole connector remains OPEN. Checkpoint CHECKPOINTS/CHANGES/2026-10-27-ftext-error-result-format.md.

# ftext - verified communication and limited single CASH receipt

22 October 2026, 18:29 Europe/Athens. The authorized owner/technician used the final Rizareio Windows PC through AnyDesk. This is a LIMITED USER-observed physical communication PASS, not generic model certification, cloud pairing or POS checkout acceptance.

## Verified flow

1. Existing licensed FTEXT+25.02 remains configured for the intended DATECS device, SOLIDUS(II)T, txt input and C:\FText.
2. Transfer the selected terminal's diagnostic ZIP to Downloads on its final PC, extract all files into its own folder, keep FTEXT+ open and the register idle.
3. Open RUN_STATUS.cmd once. The preconfigured tool emits only STATUS with a unique first-line RESULT_FILENAME and accepts only the configured device serial.
4. The supplied screenshot shows ok true/code0 and the configured serial for RIZAREIO-POS-01. The tool's fiscalExecution flag is false. Press any key to close its completed console; do not rerun for documentation.

Company/store/terminal are local configuration boundaries in this diagnostic package; cloud authorization is not implemented in this accepted slice. Do not copy its config to another store/POS. The source is generic but this observation applies only to the tested installation. Source PR3021/main201eb5e, 29 Windows cases and green exact-main tests preceded delivery.

## Limits and troubleshooting

No fiscal sale, card charge, stock or shift reconciliation was tested. No independent before/after business baseline exists for this STATUS run. POS checkout, Windows-login startup and another model/device remain OPEN. Central settings/pairing and heartbeat have the later limited acceptance below. A successful STATUS must not label a POS sale issued or paid. No fiscal test receipt without owner consultation.

On timeout, foreign serial or malformed reply, leave the unresolved marker and files intact; reopening reads the same reply without resending. Pending foreign txt input is left untouched and blocks the check. A technician inspects the selected folder/device before recovery. Do not reprogram FTEXT+, clear input folders, change licence or restart unrelated RBS connections as a diagnostic step.

## 22 October 2026 — selected-PC cloud communication USER PASS

Authorized Platform Super Admin opens the selected store Installation guide → ftext communication. Confirm exact POS, register serial and existing input folder; save its configuration and download that POS package. Existing trial and vendor driver settings are preserved. Do not use the RBS controls for ftext.

On the final Windows user: extract package, open Install.cmd. Generate a new ftext pairing code in the selected POS admin section; choose1 in the Windows menu and enter the code locally. Owner observed Paired. With existing FTEXT+ open/register idle, choose2 once: owner observed STATUS result delivered. Choose3: owner observed repeated connected heartbeats. Keep the connection window and FTEXT+ open; minimizing is allowed. In admin choose Refresh ftext connection: owner observed Connected and successful register check/code0 at21:05:59Athens. This is verified for the selected Rizareio POS only, not universal hardware certification.

Codes expire after15minutes and are single use; never share codes/packages between terminals. Credential binding is per Windows user and exact saved configuration. No need to regenerate codes or repeat STATUS after successful acceptance merely to document it. An offline indication requires checking the existing connector window, FTEXT+ and network first. Changed settings require a matching package/new pairing.

This accepted flow communicates only. Fiscal sales, payments/refunds, shift or stock effects, unattended login startup and restart recovery are not accepted. No receipt/card charge was triggered; independent before/after business deltas were not measured. The code0 STATUS is not proof that a sale was issued.

## 25 October 2026 - selected Rizareio single CASH receipt LIVE USER PASS

Who may use this accepted flow: the authorized cashier in the selected store and open RIZAREIO-POS-01 shift, with the matching paired Windows user. Platform Admin configuration remains an authorized admin/technician task. This acceptance is specific to DATECS CTR-222 DSM24014923, existing FTEXT+25.02, C:\FText and SOLIDUS(II)T. Never copy another terminal's credentials/configuration or use RBS controls for ftext.

Verified steps: keep FTEXT+ and the paired CASH connector running; confirm the selected ftext connection is online. Refresh Store Mode/POS after the server update. In the original authorized cashier shift, add one ΝΕΡΟ500ML/SKU490 at0.50 with department4/VAT13% and press Μετρητά once. The user observed a printed receipt; the server confirmed one issued/completed sale and CASH payment0.50, one original-shift cash transaction0.50 and one stock movement-1. Initial stock0 therefore became-1 with an explicit negative-stock warning; no duplicate exists. Do not repeat this already accepted sale for evidence.

Acceptance evidence25Oct13:27Athens: request e4241ef7-edd4-40a3-824c-e6a1536f55ee SALE_COMMITTED, confirmed code0/same serial/day474/counter27/QR; sale98bee70a-eb4e-43ee-aec4-833085f9de99. Read-only before11:18:43UTC and after11:28:28UTC reconcile request/sale/payment/shift/stock/audit exactly. Revision803028cffeb3e2f487ed1b03efb70b783d111f01/sourcePR3126/ordinary deployment40188097798. Full checkpoint CHECKPOINTS/CHANGES/2026-10-24-ftext-recovery-review.md; scoped PDF CHECKPOINTS/EVIDENCE/ftext-recovery-20261024/cash-user-pass.pdf.

On error, timeout or unclear printing outcome, do not press payment again or clear pending files. Preserve the original request and result for read-only reconciliation. Check connector, FTEXT+ and network; resolve the existing request with authorized support. Never manually reissue a receipt to repair documentation.

Limits: only this single CASH/department4/13% path is physically accepted. CARD remains disabled pending technician-confirmed actual profile/firmware/result. Other departments/products, mixed payments, refunds/VOID, restart/unattended login and other installations remain untested. Historical22Oct statements that sales were untested describe that earlier communication-only observation; the scoped25Oct result supersedes them only for the exact CASH test above. Whole connector remains OPEN.
