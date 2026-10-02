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
