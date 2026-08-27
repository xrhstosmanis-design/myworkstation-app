# KAT terminal routing — installation blocker

Status: SAFE POS HANDOFF IMPLEMENTED ON BRANCH — LEGACY DIRECT DELIVERED FLOW STILL BLOCKED

## Locked physical topology
- Fiscal register 1: two EFTPOS terminals; immediate/non-delayed flow only.
- Fiscal register 2: normal POS + Delivery; delayed transaction route for Delivery/Online.

## Mandatory Online rule
Online commercial completion must be performed through fiscal/POS terminal 2 and its delayed flow. Terminal 1 must never complete an Online order.

## Implemented on this branch
- Fail-closed routing resolver.
- `complete-from-pos` resolves the configured delayed terminal (env `KAT_DELAYED_TERMINAL_POS`, with POS-2 open-shift discovery only as migration fallback).
- Current authenticated operator terminal must equal configured delayed terminal.
- An OPEN `CashShiftSession` for that exact terminal is required.
- Sale total/payment/source checks remain mandatory.
- StoreTransaction evidence must belong to the terminal-2 open shift.
- Completion audit records terminal + `DELAYED`.
- Existing OnlineOrder -> Sale uniqueness/idempotent replay protections remain.

## Remaining blocker before merge/live
The legacy Online Ordering `/status` endpoint still calls `postCommercialSale()` directly on `DELIVERED`, producing its own `NON_FISCAL` Sale/payment/stock posting. The POS UI still calls that legacy status transition. That direct commercial posting must be removed/replaced by the safe POS checkout + `complete-from-pos` handoff before production merge.

## Required hardware verification
1. Fiscal register 1 + either of its two EFTPOS devices -> immediate flow.
2. Fiscal register 2 normal sale -> configured normal flow.
3. Fiscal register 2 Delivery -> delayed flow.
4. Online -> terminal 2 -> delayed flow.
5. EFTPOS success/failure/cancellation and retry.
6. Real RBS receipt/provider test.

Do not merge/deploy the partial migration until the legacy direct DELIVERED posting is removed and automated checks pass.
