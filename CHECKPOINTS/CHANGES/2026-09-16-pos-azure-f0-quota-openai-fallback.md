# POS Azure F0 quota — bounded OpenAI fallback 2026-09-16

## LAB evidence

- Invoice `43243` completed the FAST four-field read and safely reused the existing `76.58 EUR` payment.
- The durable full read failed with `AZURE_ANALYZE_403`: Azure Form Recognizer F0 reported that its call-volume quota was exhausted for 16 days.
- The independent OpenAI full-table fallback was then aborted by the application's 30-second provider timeout.
- The linked draft remained empty and no second payment, stock update, approval or finalization occurred.

## Bounded change

- The full-table provider timeout is 70 seconds, separate from the already proven FAST-header deadline.
- The internal background request is bounded at 180 seconds so extraction and the guarded draft write can finish after an immediate Azure quota rejection.
- Azure remains configured; changing its subscription from F0 to a paid tier is an operational follow-up, not part of this code change.

## Safety and validation

- The existing payment-reuse, duplicate-draft, reconciliation, stock, approval and finalization guards are unchanged.
- A provider failure still fails closed and cannot write empty product lines.
- CI/deploy are required before one BackOffice refresh reclaims the existing failed draft without another upload or payment.
- LAB PASS requires 16 lines and verification of `340061124`: unit price `1.420`, discount `15%` / `0.43 EUR`, net `2.41 EUR`.
