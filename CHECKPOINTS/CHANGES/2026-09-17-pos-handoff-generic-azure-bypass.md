# POS handoff generic-Azure bypass — 2026-09-17

## LAB evidence

- Exact production `62906a202d3f1a861e4bcaeed89527dc1dceaa2d` was deployed after PR `#934` / CI `#2423`.
- A fresh POS-front credit submission for MANTZILAS invoice `12424` created one draft but remained at zero lines and moved from `POS_PROCESSING / POS_BACKGROUND` to `POS_QUEUED / POS_RECOVERING` between `20:45` and `20:49` local time.
- The operator must not upload again, create another credit, delete, approve, finalize or post stock.

## Root cause and bounded correction

- The generic Azure `ai-recheck` route is mounted before the POS-specific full reader.
- It handles a POS handoff first and can overwrite `resultJson` with a partial Azure result before calling `next()`, removing `posHandoff`.
- The POS-specific reader then cannot identify the confirmed supplier/total or select the central MANTZILAS path; it falls into the slower provider recovery loop.
- A job carrying `resultJson.posHandoff` must bypass the generic Azure `ai-recheck` route immediately and remain intact for the POS-specific route.

## Safety and acceptance

- The bypass changes only provider routing for an already durable POS handoff.
- Preserve the same draft, attachment, supplier, confirmed amount and settlement identity.
- No duplicate payment/credit, new draft, stock posting, approval, finalization, fiscal or accounting action.
- Require focused tests, full server suite, client/server builds, green CI, merge and exact deploy.
- CI PASS is not LAB PASS. Final PASS requires the existing `12424` draft to recover its printed rows and reconcile to `318.74 EUR`.
- Focused regression tests: **74/74 PASS**.
- Isolated transient check: **3/3 PASS**.
- Full server suite rerun without concurrent build mutation: **1297/1297 PASS**.
- Client build and server/Prisma build: **PASS**.
- Status: **LAB FAIL / implementation verified locally; awaiting CI, exact deploy and same-draft recovery**.
