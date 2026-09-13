# 2026-09-13 — POS notices and purchase-order refresh

## User evidence and scope

The user reported oversized persistent POS notices and a non-working BackOffice refresh. Their latest POS screenshot reports invoice 2612188 saved as a draft requiring reconciliation. The BackOffice screenshot still lists only two older orders, with totals 43.41/49.45 EUR. This proves the displayed draft notification, not an independently verified order, archive, line count, or product accuracy. Gate 3 remains open. The user performs LAB tests.

## Changes

- POS feedback is a compact overlay, up to 560px and three visible lines, with a close control and an eight-second timeout cleaned up when the message changes or the component unmounts. Full text remains available on hover and to assistive technology. Blocking POS errors keep their existing behavior.
- Invoice progress, draft, and completion text is shorter. Payment-reuse details remain in the detailed status only for PAID mode.
- The outer Commerce refresh routes to the active purchase suite through a cancelable event. Native modules retain their existing refresh behavior.
- Inner refresh and search read the current filter values. Report requests bypass caches; the report response is marked no-store. Loading and successful update time/count are visible. Stale responses and detached roots cannot replace newer results.
- Installation is idempotent for existing suites and global refresh listeners. Errors retain the previous report and allow retry.
- No schema, invoice posting, payment creation, stock, fiscal, tenant, authorization, or licensing rules change.

## Verification checkpoint

- PASS: 7/7 behavioral tests cover both refresh controls, filters, new rows, mutation idempotency, out-of-order responses, failure/retry, cleared/invalid inputs, and unmount.
- PASS: syntax checks for the purchase suite and report route.
- Local runtime: Node 24. Full Node 20 build/server/invariant/isolated E2E gates run in GitHub CI before merge.
- PASS: [PR #789](https://github.com/xrhstosmanis-design/myworkstation-app/pull/789), [CI #2017](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/34746941921), merged as `bc91ec6a5a1b8b1e0c57c011de184a9869486475`. All 1152/1152 server tests on Node 20, production client build, security/licensing/production invariants and isolated HTTP E2E flows passed.
- PASS: main CI #2018 and [Render deploy #1063](https://github.com/xrhstosmanis-design/myworkstation-app/actions/runs/34747125725). The deployment job completed its `Wait for exact production revision` gate: `/api/health` was healthy on the exact merged code revision `bc91ec6a5a1b8b1e0c57c011de184a9869486475`. This is deployment evidence, not a LAB product-reading PASS.

## Next LAB checkpoint

After deployment, refresh the existing LAB purchase-order list and inspect invoice 2612188. Do not upload it or record its payment again. Verify one order, 38 complete lines in source-page order, and final total 2369.99 EUR before approval. The screenshots are not a full Gate 3 PASS.
