# 30/09/2026 — myDATA Supplier lookup · LIVE FAIL / AWAITING CI-DEPLOY-USER

Owner: `codex/mydata-supplier-lookup-20260930`, same installation page continuing #1551. No transfer to another owner and no OCR/Gate 3 claim.

## Current real evidence

#1551 CI passed, merged as `d2f768a4f2eac2065a5ee8a2eb829d6c946ad7ac`. Exact Render revision live (latest deploy `dep-daukls7d7sfs738i5j0g`). Owner screenshot `image(20260930-175327).png`, 20:53 Greece, correct Diadochou store, shows internal error and zero archived documents after sync. Application receiving is LIVE FAIL, not PASS.

Production server stack at 2026-09-30T17:53:16Z: `TypeError: Cannot read properties of undefined (reading 'findFirst')`, `commerce-mydata-inbox.js:58:54`, inside transaction. The parsed invoice reaches persistence. `Supplier` is created/queried with raw SQL in the commercial database and has no Prisma model/delegate. The current `tx.supplier.findFirst` therefore cannot execute. Do not change credentials or roll back envelope decoding.

## Bounded change

Replace only the supplier lookup with tagged parameterized `tx.$queryRaw`, exact issuer VAT and company scope, selecting id/name from existing `Supplier` table. Preserve nullable supplier for unmatched issuers, existing duplicate guard, atomic inbox/inbound record transaction, tenant filter, draft RECEIVED status, environment cursor and no stock/payment/fiscal posting. No production schema/migration/seed changes.

## Verification

10/10 local tests PASS: XML/envelope tests plus a new test executing the actual sync handler with a raw-only transaction fixture (no Supplier delegate). Exercises matched and unmatched supplier, query parameters for company/VAT, two draft writes, nullable supplier, and duplicate replay causing zero writes. These are simulated regression tests, not a production import or LAB PASS. Full CI required before merge; exact Render revision required before user retest.

## Remaining acceptance / handoff

Owner stays assigned through production receiving and replay. After exact deploy, one fresh user sync in the same Diadochou store must create the known draft and allow independent DB readback. A subsequent sync must avoid duplicate drafts; review before requesting replay because the cursor may also return later invoices. No final invoice posting, payment, stock update or fiscal transmission is authorized by this diagnostic acceptance. Those effects were not independently measured in the failed user screenshot and remain NOT TESTED. No manual PASS closure or central PASS PDF yet.
