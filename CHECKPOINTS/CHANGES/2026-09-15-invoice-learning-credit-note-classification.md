# Invoice Learning credit-note classification — 2026-09-15

## Scope

Classify supplier return documents as `CREDIT_NOTE` during Azure/OpenAI reading and preserve that type in the Invoice Learning Lab.

## Evidence

- Fresh Milk document `ΓΑ/322` carries the heading `Πιστ. Τιμ. Δελ. Παραλαβής Επιστροφή`.
- Detection uses document wording such as `Πιστωτικό`, `Πιστ. Τιμ.`, `Επιστροφή` or `Credit Note`; it does not infer a credit from the sign of an amount.

## Safety

- Reading, preview and learning do not post stock, accounting or payments.
- A stock decrease remains available only through the explicit final credit-note posting flow.

## Validation

- `node --test server/test/invoice-learning-credit-note-detection-v1.test.js` passed locally.
- `npm run build` passed locally.
