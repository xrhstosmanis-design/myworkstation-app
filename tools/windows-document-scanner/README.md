# MyWorkStation document scanner connector — candidate / AWAITING HARDWARE

Windows 10/11, a vendor-supported WIA scanner driver and exactly one WIA scanner are required. TWAIN-only devices are not supported by this candidate. Confirm the intended scanner model/driver before purchase. The operator scans one page per button press and appends further pages to the same document where that existing form permits it (up to five). Scanning does not register a payment or send a chat message.

Technician build: `dotnet publish tools/windows-document-scanner/MyWorkStation.DocumentScanner.csproj -c Release -r win-x64 --self-contained true -o scanner-release`.

Run `MyWorkStation.DocumentScanner.exe` locally in the signed-in Windows user's session. No administrator/network/firewall exception, public listener, filesystem scan output or remote-control agent is required. The listener binds only `127.0.0.1:17839`. Keep the console open while scanning; closing it stops access and forgets the session token. No startup/service installation is performed automatically.

In the current MyWorkStation document form, press **Σάρωση εγγράφου**, enter the six-digit code shown locally, and press **Σύνδεση σαρωτή**. The code expires after ten minutes or five failed attempts and is consumed once. Pairing does not scan. Press **Σάρωση εγγράφου** explicitly to acquire a page. The browser may request local-network permission; do not bypass certificate/browser warnings or weaken browser security. Unavailable browser support is a compatibility failure, not a successful installation.

The connector requests color/300dpi when the driver supports these values. It retains the scanner's full acquisition area and returns JPEG bytes in memory; it does not clean/crop away rows or write a local image/PDF. Existing MyWorkStation controls perform document review and any separately selected paid/credit or send action. Original and processed-image retention depend on that existing consumer; this connector does not certify their archival policy.

Only the exact production Origin is accepted. JSON POST plus session bearer authority is required for scan; GET, other Origins, missing tokens, oversized bodies and bad page counts are rejected. There is one physical scan in flight, no automatic retry, and replay of the same request ID returns its recorded result rather than triggering another scan. The latest result remains in process RAM until replaced or the connector closes; do not treat ordinary managed-memory cleanup as forensic zeroization. Cancel/close in the browser can discard an eventual result but cannot guarantee the physical feeder stops.

Verification: Windows workflow compiles and runs `--self-test` against actual loopback HTTP with a synthetic scanner. Hardware transfer/driver, browser permission and real document legibility remain **NOT TESTED** until measured on the intended PC/scanner. No universal scanner compatibility or production-installed claim follows from compilation.
