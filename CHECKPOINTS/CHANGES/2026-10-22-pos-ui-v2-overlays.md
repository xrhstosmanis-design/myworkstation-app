# POS UI V2 / #3012 — bounded overlay extension — AWAITING LAB

22/10/2026 Europe/Athens. Coordinated stream `feat/pos-ui-v2-overlays-3012`, based on user-specified `feat/pos-ui-v2-safe-minimize-3012` / `9d168106`. This extends V2 only; retained POS-PAYMENT-MINIMIZE-01 owner `fix/pos-payment-minimize-20261020` and its AWAITING USER VISUAL ACCEPTANCE status remain unchanged. Root coordinates shared records. Latest explicit user authorization permits branches/commits/PR and isolated tests, forbids merge/deploy pending final approval; that overrides older claim-publication-to-main sequencing. No production or state-changing LAB test performed.

## Inspected evidence and preserved behavior

Read AGENTS, current minimizer source and placement tests, 20/10 payment-minimize checkpoint and relevant tracker/pending/manual entries. Main history fetched at `82673d5`; current main preserves top-edge non-POS fallback and static POS search-row dock. `9d168106` moved fallback to bottom76px despite the existing test requiring top20px. Prior 20/10 technical CI/release evidence is historical, not a new LAB PASS. Existing same mounted draft/files/background result, product-search dock, scanner and checkout locks, original close behavior and all financial/API/stock/fiscal handlers remain protected.

## Bounded change

Restore protected top20px fallback outside Store POS while retaining compact V2 styling. Repeated minimize is a no-op so saved visibility/styles are not overwritten by hidden state. When the original payment overlay unmounts, remove its restore control, disconnect its watcher and restore only minimizer-owned blocker styles. Restore never attaches an old draft control to a replacement payment, including before MutationObserver delivery. No new requests, submissions, calculations or changes to payment idempotency.

## Validation

Node20 `node --test server/test/pos-payment-minimize-placement.test.js`: 2 PASS, 0 FAIL, 1 SKIP (Chromium unavailable). Syntax check PASS. Safety stream owns separate same-draft/file/no-request and teardown regressions; combined verification to be recorded by coordinator. Full native GitHub CI, Chromium geometry, actual LAB/physical scanner/EFTPOS/receipt and hosted visual acceptance remain NOT TESTED. No manual PASS. No claim of safe production installation yet.

Next: independent safety regression verification and full CI; review report plus user final approval before any merge/deploy. No payment/invoice replay to obtain evidence.
