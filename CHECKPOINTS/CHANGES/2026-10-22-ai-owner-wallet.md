# AI owner prepaid wallet — implementation checkpoint

## AI-OWNER-WALLET-01 — ASSIGNED BEFORE SOURCE / NOT TESTED

Owner feat/ai-owner-wallet-20261022. Explicit instructions: implement prepaid AI paid to MyWorkStation, manual authorized credit after receipt, company wallet shared by stores with store usage breakdown, low20%/empty/credit notifications in app and email. No direct provider payment by owner. Independent billing extension; AI-CREDITS-01 central organization monitor, invoice reading/settlement/learning, VOICE assistant capabilities and automatic-report-mail owners retained. No takeover or repeated financial/stock acceptance.

Baseline main/runtime07110f16c361a2c36fe507220816e12707f623d5, public health ok:true observed22Oct2026. Read AGENTS, current registers/checklist, relevant AI-credit/owner-assistant/mail source and checkpoint evidence. Existing central monitor is an organization estimate, not a customer wallet. Owner provider uses central key; no existing customer wallet found. New behavior NOT TESTED, not LAB PASS.

Bounded source scope: new AI wallet ledger/repository/service/routes/components/tests and additive route/UI/provider composition only. Integer monetary units, tenant isolation, atomic reservation/settlement, immutable idempotent credits/debits, versioned configurable tariffs; no invented provider rates. Durable threshold-event dedup and email attempts; no real email without configured opt-in. Persist before send, uncertain sends held without blind retry. Credits require verified-receipt reference and SuperAdmin; owner cannot self-credit. Wallet remains disabled by default and no real customer balances/charges are enabled during development. Payment gateway/automatic card charging, production schema/configuration/money actions excluded. Protect normal POS/sales/stock from AI-only refusal. Broader provider integrations stay explicitly unenabled until metered and tested.

Acceptance: isolated real PostgreSQL concurrency/rollback/idempotency and cross-tenant/role/retired-session HTTP tests, notification dedup and timeout tests, no provider invocation on insufficient funds, no double settlement, existing suite/build/invariants green. Never equate tests with hosted LAB. After exact green source/main CI and ordinary release verify revision; actual UI/LAB/email remains separate measured acceptance with no historical transaction replay. New schema only dedicated wallet tables, no business table migration from sandbox.

Next: publish this claim green on main before source; then implement the bounded wallet foundation and adapters. Owner retained until completion or named handoff. This is not completion or manual PASS.

