# Generic ftext connector — diagnostic foundation

The STATUS foundation has one recorded physical USER PASS (see docs/manual/ftext/PASS.md).
The new cloud installation source remains AWAITING hosted/device acceptance; fiscal POS checkout is not implemented. This module is reusable
for explicitly configured company/store/POS/serial/ftext input folder. It does not
install or reprogram FTEXT+, alter its license/LAN settings or execute sales/cards.
The RBS connector is unchanged. Vendor reference: FTEXT+25.02, Developer Manual,
21 November 2025, pages4,14,16–18 (provided privately by the owner).

On the final Windows PC, the technician verifies FTEXT+ uses SOLIDUS(II)T,
Windows1253 and the configured folder with txt inputs. Stop simultaneous checkout
from other software for the first STATUS check. Set config.json beside the scripts:

```json
{"companyId":"YOUR_COMPANY_ID","storeId":"YOUR_STORE_ID","terminalPos":"POS-01","serialNumber":"ACTUAL_SERIAL","workFolder":"C:\\FText"}
```

Run Test-Connection.ps1 under the final Windows user. No real customer identities or
credentials are in this example. The script checks an existing folder, holds a
folder-wide cross-process lock, durably records one STATUS request and atomically
publishes one Windows1253 input. RESULT_FILENAME comes first and points to that
request's unique .res. Only that result is accepted, with the configured serial.
Success reports communication, never receipt issuance or approved card payment.

On timeout or malformed/wrong-serial results the unresolved marker stays. Reopening
only inspects the SAME response, never writes another STATUS. Do not delete the
marker or input to retry blindly; a technician must inspect the pending request,
FTEXT+ and folder. Other pending txt inputs are left untouched. No existing vendor
result file, unrelated command or configuration is overwritten or removed.

Cloud source adds central per-POS settings/package, one-use scoped pairing, per-user
DPAPI credentials and heartbeat/STATUS result upload. These expanded features need
controlled hosted/Windows acceptance. Pair first (Setup option1), then explicitly
run STATUS/upload (option2), and start heartbeat only (option3). The package never
auto-starts, installs the vendor driver or enables fiscal checkout. Pending uploads
retain their settings hash and exact body; a changed binding stops for review.

Remaining whole-connector scope:
POS sale serialization/finalization, durable idempotency and uncertain-result
reconciliation, controlled Windows/device acceptance. Do not advertise the
foundation as an installed POS connector. No fiscal test without owner agreement.
