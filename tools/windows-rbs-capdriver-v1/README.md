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

Cash uses payment code `6` and card uses payment code `2`, matching the
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
   The default is `C:\Capture`. The writer requires `Xcommand.txt` to be absent;
   it never overwrites or removes it.
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
within the last 15 seconds. A prepared request that remains unclaimed for more
than 60 seconds is quarantined for manual review and is never dispatched later
when the writer restarts.

This package has not been run on the target Windows PC or against a physical
register. Install/pair/run only during the owner-led controlled acceptance
session after CI and code review pass.
