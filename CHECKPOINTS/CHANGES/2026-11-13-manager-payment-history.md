# CENTRAL-BACKOFFICE-ACCESS-01 — Delegated payment history

2026-11-13 Europe/Athens. Retain the existing BackOffice access ownership. Central coordination priority is configurable Owner function parity. First bounded slice: supplier bank-transfer confirmation and selected-store history for delegated managers.

Current evidence: source review found the result message is lost after the delegated payment modal closes. The scoped payments.read endpoint returns suppliers and purchase documents without registered payment history. The reported transfer has not been identified. LAB NOT TESTED.

Preserve existing settlement review, payment writes and idempotency. Use read-only scoped data and recheck the existing grant. Acceptance: visible receipt after modal closes; an existing LAB transfer shows recorded amount, document and review status; no-grant, revoked-grant and foreign-store access denied. No payment replay. Next: publish this checkpoint, implement and verify CI and deployed LAB.