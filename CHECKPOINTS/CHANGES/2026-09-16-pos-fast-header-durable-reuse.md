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

