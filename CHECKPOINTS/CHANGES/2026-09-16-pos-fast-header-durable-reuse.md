# POS FAST header durable reuse — 2026-09-16

## LAB evidence

- After deployment of revision `49d149c4`, a clean POS-front selection of the same invoice image stopped before handoff.
- The screen reported that FAST reading returned no valid basic fields after its safe retry and explicitly confirmed that no payment occurred.
- This is a new `LAB FAIL` at FAST header selection; the durable product-line recovery was not reached.

## Bounded correction

- Before any Azure/OpenAI FAST request, the server checks for an unfinished durable job belonging to the same company, store and exact attachment SHA-256.
- Reuse is permitted only when the stored handoff has a real supplier, invoice number, ISO date and positive total, and its stored product lines reconcile to that total within `0.05 EUR`.
- The response includes the durable product lines so the existing handoff path can run deterministic discount verification without a provider.
- If any identity or arithmetic gate fails, normal FAST provider reading remains unchanged.

## Safety and LAB acceptance

- This lookup performs no payment, credit, draft, stock, approval, finalization or fiscal write.
- Existing payment idempotency and duplicate checks remain authoritative later in the flow.
- LAB PASS requires the same image to populate the four fields automatically at the POS, then create one draft using the existing payment with sixteen lines and row `340061124 = 2 × 1.420`, discount `15% / 0.43`, net `2.41`.

## LAB follow-up after revision `52dcfb00`

- FAST durable header reuse passed: the POS identified supplier and invoice `43243` and created one draft without a new payment.
- Background handoff still selected the newest job for the attachment, which had zero lines, while the older exact-file job containing the sixteen reconciled lines was the one used by FAST header recovery.
- The draft remained at zero items and recovery called OpenAI/Azure again, ending with the same provider timeout/quota evidence.
- Bounded follow-up: `fast-handoff` itself hydrates an empty incoming page only from an older job with the same company, store and exact attachment checksum, same supplier/invoice/date/total, and stored lines reconciling within `0.05 EUR`.
- This remains draft-only and does not create, change or reverse payment, stock, approval, finalization or fiscal state.

## LAB follow-up after revision `1cf5bb44`

- A new POS-front run again created one empty draft and recovery reached external provider failure.
- Exact attachment checksum is not a stable business identifier because client image optimization may produce a different binary file for the same photographed invoice.
- Final bounded lookup uses the already-confirmed invoice identity inside the same company/store: supplier, normalized invoice number, document date and total, plus stored-line gross reconciliation within `0.05 EUR`.
- Checksum remains the first preference; business-identity recovery is used only when the incoming page has no lines and no safe exact-file candidate exists.
- Payment reuse remains authoritative and unchanged. No stock, approval, finalization or fiscal action is added.
