## Terminal-bound installation package — source PR2637

The Platform Admin Installation Guide saves confirmed payment codes, CAPDriver folder and equipment per company/store/POS, then downloads the selected terminal's installer. A register can have STORE and optional DELIVERY EFTPOS. Each PC uses its own selected package and a fresh code from the correct BackOffice on the final Windows user. Never copy a credential from another PC/store.

New Pair asks the server to bind the credential to the exact POS and current confirmed register/settings; the signed token owns that authorization. Status and polling revalidate it. Poll bodies and heartbeat metadata cannot select another terminal. Each request is claimed only once within its company/store/terminal. A changed register, EFTPOS, payment code or folder requires confirmation and a new pairing/package. Old unbound Writers continue only against one explicit mapped register; they refuse ambiguous multi-register stores. The new guided package can be downloaded for a selected confirmed active POS without confusing another home/test terminal with a cash register.

PREPARE and opening the GUI do not pair, start Writer or issue a receipt. The safe check confirms store/POS/register and folder access without claiming a request. Pair on the final PC, then explicit Start and verify WRITER ONLINE before any accepted physical test. Startup is optional for the same Windows login; no CAPDriver/service restart is included. Packages extract into packages/<storeId>/<terminalPos>. The Writer rejects an unexpected terminal before writing a command file. KAT PC2 is accepted first; PC1 later with its own mapping/codes. Existing paid transactions are never replayed for documentation.

Full source CI passed2880/0/0 plus6backup and Windows/native HTTP checks. Production release and physical device acceptance are recorded separately in CHECKPOINTS/CHANGES/2026-10-17-kat-terminal-connector.md. CI is not hardware/LAB PASS. CONNECTOR_RBS/license and current equipment checks remain mandatory. KAT6/2/3 compatibility and mixed-payment blocking remain unchanged.

## Authoritative installation guide (03 October 2026)

Read [the Greek technician manual](../../docs/manual/pilot-installation/CAPDRIVER_TECHNICIAN.md) before a new installation. It distinguishes the observed KAT results from untested new-store acceptance and documents home preparation, pairing, mapping limits and mixed-payment blocking.

# MyWorkStation RBS CAP Driver v1 writer

This package targets the first/current CAP Driver file path. It does not read or
write the newer driver's `OUTPUT` folder.

## Current register profiles from the supplied Kiosk Manager screen

Configure each profile in MyWorkStation's **Τμήματα ΦΠΑ** settings, including
its Kiosk VAT code (`legacyVatCode`), rate, and cash-register department. Assign
each product to its matching profile. The POS checks all three values before
creating a request.

| Kiosk VAT code | Register department | Rate | Kiosk description |
|---:|---:|---:|---|
| 1 | 1 | 13% | Καφέδες |
| 42 | 2 | 13% | Είδη 13 |
| 7 | 4 | 13% | Τρόφιμα |
| 15 | 6 | 24% | Είδη 24 |
| 227 | 6 | 24% | Παροχή υπηρεσιών |
| 45 | 7 | 0% | Κάρτες |
| 104 | 8 | 6% | Είδη 6 |
| 17 | 13 | 24% | Περιβαλλοντικό τέλος |
| 228 | 14 | 24% | Είδη προστασίας περιβάλλοντος |
| 63 | 21 | 0% | Είδη 0 |

KAT cash uses payment code `6`, counter card `2`, and standalone delayed card `3`. Delivery code3 is KAT-only; other-store Delivery mapping is not implemented. Mixed with a configured writer is blocked. Verify the new register before using 6/2, matching the
provided Kiosk Manager capture. Do not add a VAT profile based only on rate;
several categories share a rate but use different register departments.

## Pairing and operation

1. In MyWorkStation's cloud connector for the target store, create a short lived
   pairing code. Set `MWS_RBS_API_BASE` to the service base URL, without
   `/api/cloud/v1` (for example `https://myworkstation-app.onrender.com`).
2. Run `Pair.ps1` as the Windows user that will run the writer. Paste the code
   only at its prompt. The device token is saved encrypted for that Windows
   user through the Windows PowerShell credential serialization mechanism.
3. Confirm the CAP Driver v1 service is already configured to watch the
   approved work folder, then set `MWS_RBS_WORKFOLDER` to that exact folder.
   The default is `C:\Capture`. The writer creates request-specific `rbs.<requestId>.txt` files and never overwrites an existing request file. It does not clean unrelated legacy commands.
4. Run `Test-Connection.ps1` first. It verifies the paired credential, the
   server heartbeat and the configured work-folder path without claiming a
   checkout request, marking the writer online or creating an `rbs.*.txt` file.
5. Run `Writer.ps1` under the paired Windows user. Keep it running while POS
   requests are expected. It claims each request once, checks the Windows-1253
   bytes against the server hash, then creates one request-specific `rbs.*.txt` atomically. The
   durable diagnostic log is stored under
   `%LOCALAPPDATA%\MyWorkStation\RbsCapDriverV1\writer.log` by default. Only
   the running writer's real polling changes the BackOffice indicator to
   `WRITER ONLINE`.
6. If a request is uncertain, inspect the register/EFTPOS and resolve it in the
   POS review dialog. The writer never asks the server for the same request
   again after it has been claimed.

The first cash receipt needs a controlled physical print check. Card remains
pending until an operator confirms the EFTPOS result. A manual result after an
uncertain response requires checking the register/EFTPOS first. Never use a
real customer sale as the first integration test.

The POS treats the writer as online only after a real authenticated heartbeat
within the last 15 seconds. Prepared requests remain claimable until actually claimed; do not assume a 60-second expiry prevents dispatch after a restart.

The KAT owner physically verified counter CARD and delayed CARD with receipts on 03 October 2026. These scoped results do not certify another Windows PC/register/store. Each new installation requires controlled acceptance after mapping and revision checks.
