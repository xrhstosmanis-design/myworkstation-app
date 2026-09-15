# POS FAST header invalid-response recovery — 2026-09-15

## LAB symptom

- The POS retained both selected invoice pages (`2/5`) but showed `Δεν ολοκληρώθηκε η επιλογή/ανάγνωση των σελίδων. Παρουσιάστηκε εσωτερικό σφάλμα.`
- No supplier, document number, date, amount, payment, or purchase draft was created by that failed attempt.

## Change

- The two FAST header candidates are requested concurrently and settled independently, preserving the successful page when the other page fails.
- The OpenAI FAST structured response is validated before use and retried once when it is empty, malformed, timed out, or rejected.
- Exhausted retries return an explicit safe error stating that no payment occurred instead of the generic internal-server message.
- The POS request window is 75 seconds so the bounded provider fallback/retry can finish without a premature browser abort.

## Safety

- This change only affects pre-payment header reading.
- It does not write a payment, purchase draft, stock movement, or duplicate record.
- Existing invoice payments and documents are untouched.

## Verification

- `node --test server/test/pos-invoice-durable-handoff-lab-v1.test.js server/test/pos-invoice-multipage-upload-v1.test.js` — 32/32 passed.
- `npm run build:client` — passed.
- `npm run build:server` — passed.
- `git diff --check` — passed.
