# POS FAST header-only fallback — 2026-09-17

## LAB evidence

- A new one-page MANTZILAS POS-front test failed before payment with: `Η γρήγορη ανάγνωση δεν επέστρεψε έγκυρα βασικά στοιχεία μετά από ασφαλή επανάληψη`.
- The screen explicitly confirmed `Η πληρωμή δεν έγινε`; no payment, credit, draft, stock, approval or finalization mutation occurred.

## Root cause and bounded change

- The operator-facing FAST OpenAI fallback was asked for the complete 18-row product table even though the POS needs only supplier, document number, date and gross total before continuing.
- The oversized strict response exhausted the FAST request budget and discarded the readable header together with the unfinished table.
- The FAST fallback now extracts only the payment header fields. Full product recognition remains in the existing durable background V2.4.4 flow; Azure may still hand off a complete table when it independently reconciles to the invoice total.

## Safety and LAB acceptance

- The payment remains fail-closed until supplier, invoice number, date and gross total are returned.
- No payment reuse, credit, stock, approval, finalization, fiscal or accounting behavior changes.
- PASS requires the same one-page image to populate the four POS fields without the previous FAST error, followed by the existing background draft flow.
