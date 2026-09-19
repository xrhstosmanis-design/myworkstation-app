# 2026-09-19 — Video Audit on-demand historical lookup — AWAITING LAB

## Scope
- Historical Audit rows no longer require a VideoOperationalEvent to have existed at the original event time.
- On click of Video, the server resolves the original StoreTransaction, PosSaleActionAudit or StoreOperatorAudit row, active store video connection, POS camera mapping and NVR time offset.
- If the event is still inside the configured NVR retention window, a VideoOperationalEvent is created on demand and the existing outbound Video Connector requests the real clip.
- Clip window remains 30 seconds before and 60 seconds after the event.
- If outside configured retention, the UI returns an explicit unavailable reason instead of creating a command.
- Actual Dahua availability remains authoritative: the connector mediaFileFind flow can still return DAHUA_RECORDING_NOT_FOUND when the NVR no longer has the recording.

## Safety
- LAB-first. No production store configuration changed.
- No NVR credentials are exposed to browser code.
- No inbound port or port forwarding is added.
- Existing video access permissions and access audit remain in force.
- No POS/payment/invoice/stock/fiscal/accounting/myDATA behavior changed.

## Gate
- AWAITING LAB until CI is green, merged/deployed, LAB connector is online/mapped, and a historical Audit event (3–10 days old where recording exists) opens a real clip.
