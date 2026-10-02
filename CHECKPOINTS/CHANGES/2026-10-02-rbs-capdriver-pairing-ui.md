# Checkpoint — CAP Driver v1 pairing code UI

Date: 2026-10-02  
Owner: `agent/rbs-capdriver-pairing-ui-20261002`  
Status: ASSIGNED · AWAITING CI · no writer paired · no fiscal command

## Goal

Expose the existing owner-authorized one-time pairing-code endpoint in the normal store BackOffice so the owner can pair the already reviewed CAP Driver v1 Windows writer for the correct store.

## Evidence before change

- PR #1632 merged and deployed the CAP Driver v1 POS/one-shot writer integration. CI #4107 passed the full server/client/invariant/archive/E2E suite and isolated Windows PowerShell 5.1 parse/pairing/writer smoke tests. Render reported live revision `874c6bd2e0c8efcf578e6ee2a98026d8057c5c6f`.
- The existing API already supports a 15-minute one-time pairing code at `POST /api/cloud/v1/stores/:storeId/pairing-code`. It requires authenticated OWNER/ADMIN access, checks the active store belongs to the current company, invalidates an older unused code, and writes an audit event without storing the raw code in audit details.
- `StoreCloudPage` did not expose this endpoint in the UI. The Platform Admin terminal/mapping screen is not the pairing-code screen.
- Owner photos show the existing CAP Driver service running on the KAT PC, TCP `192.168.1.244`, code page 1253, and `C:\\capture\\`. Those settings and the current Kiosk Manager/RBS/EFTPOS configuration must remain unchanged.
- A real KAT sale was reported/screen-captured as NON_FISCAL with no receipt. Its before/after financial and stock baselines and exact transaction ID are not recorded; do not repeat or reprint it.

## Bounded change

Add a BackOffice panel to `client/src/components/cloud/StoreCloudPage.jsx` that:
- calls the existing endpoint for the currently selected store only;
- requests the existing 15-minute TTL;
- shows the returned one-time code and expiry only in transient page state, with explicit copy control;
- warns that closing the page hides the code and that requesting another code invalidates an unused one;
- states that code creation itself sends no fiscal command and prints no receipt;
- provides pairing/writer next-step instructions.

No server authorization, POS checkout, fiscal payload, command writer, Kiosk Manager, RBS, CAP Driver service, EFTPOS mapping or production data changes are in scope.

## Required preservation and verification

Preserve store/company isolation, OWNER/ADMIN enforcement, audit logging, one-time code consumption, code TTL and all existing BackOffice transaction/cash UI behavior. CI must pass frontend build, server suite, production invariants, archive import, HTTP E2E and Windows-script checks. After exact production deployment, owner must open the selected KAT store's BackOffice, create one pairing code, pair the writer under the same Windows user, and verify writer health before any approved controlled receipt action.

## Current test evidence

- No fiscal command or additional sale has been sent.
- UI build and full CI: AWAITING.
- Pairing code generation in production, Windows pairing, writer operation, cash receipt, card confirmation, sale/payment/stock commit: NOT TESTED.
- No LAB or physical PASS is claimed.
