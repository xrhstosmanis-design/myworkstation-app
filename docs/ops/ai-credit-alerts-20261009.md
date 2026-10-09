# AI credit alerts — setup and acceptance (not a PASS manual)

Scope AI-CREDITS-01. Owner codex/ai-credit-alerts-20261009; source codex/ai-credit-alerts-implementation-20261009. Claim PR1987 / CI37983339777 SUCCESS / main4a69eb486c95f0bb7d908406533e6bfd43fee972 preceded source.

## Behavior

Platform Super Admin homepage shows a central credit alert; AI Command Center shows the same alert and settings. Existing auth/session/central role guards apply. No store/company fallback or billing data exposure to ordinary owners/operators. This is central organization billing, intentionally not a store budget. The page polls every60seconds while mounted; the server coalesces/cache-limits costs reads to5minutes. No notification is sent to another person; no email/SMS/push, paid automation, purchase or financial/stock/fiscal action is added. The warning is visible when Admin opens or leaves this page open.

Defaults warning5USD and critical2USD; at/below each threshold WARNING/CRITICAL, at/below0 EXHAUSTED (estimated). Missing key/baseline, changed key, provider errors, invalid/partial pagination, non-USD amounts, billing revision or stale baseline/costs return UNKNOWN with no numeric balance. A baseline older than7days requires re-confirmation to limit unnoticed credit expiry/account adjustments. This is an estimate, not real prepaid balance and cannot guarantee a warning before exhaustion under delayed billing or sudden high spend.

## Connection and configuration

1. An authorized deployment administrator sets OPENAI_BILLING_ADMIN_KEY securely in the existing server environment. It must be an OpenAI organization Admin key with Costs API access for the SAME organization that funds the app's existing AI key. Never put it in chat, git, frontend settings or a user-facing screenshot. No key was acquired or installed by this implementation. The ordinary inference key is unchanged.
2. Platform Admin https://myworkstation-app.onrender.com/platform-admin → AI Command Center → Ρυθμίσεις ειδοποιήσεων. Enter thresholds and, when establishing/reconfirming the baseline, the CURRENT prepaid balance (not the amount of a credit purchase). Confirm the account matches the server billing connection. Save.
3. Backend reads all-organization USD cost from UTC midnight through the observation and saves that cost as baseline. Subsequent balance is confirmed balance minus cumulative-cost delta since that same day. Organization spend includes other projects, without a filter. New purchases, credit expiry, provider account changes or adjustments require a new current-balance observation. Daily buckets and late billing can make the estimate conservative or stale.
4. Settings are centrally persisted in dedicated PlatformAiCreditMonitor; version compare-and-set and AuthAudit share one database transaction. Parallel/stale writes conflict; invalid settings/provider baseline failure do not write. GET initializes only this new dedicated table lazily; no existing business table/schema change. No production SQL/migration was run from Work.
5. No key, fingerprint, raw provider error/body or baseline internal cost is sent to the UI. Costs requests are GET only, redirect:error, one20sec signal across at most20pages; incomplete reads fail closed.

## Required acceptance

Observed local Node20.20.2: targeted26/26, full server1981PASS/0FAIL/4environment skips, production build PASS. Added isolated real PostgreSQL+existing-auth HTTP CI flow for denied anonymous/Owner writes/reads, central persistence, validation, missing billing configuration, compare-and-set race, exactly-one Audit and revoked session. Local transport tests cover financial thresholds, cents, negative balance, daily baseline accounting, all-org pagination, failure and cache/single-flight. These are code/CI tests, not LIVE/LAB PASS.

Still required: green exact source CI; merge; exact deployed revision; configured same-account Admin key; real current-balance setup; LIVE visual/functional checks on homepage and Command Center and real refreshed cost/threshold evidence. Do not trigger a purchase or invoice re-upload for acceptance. Existing draft102986 and all payment/stock/fiscal identities stay unchanged.

## AI-CREDITS-01 — source merged / CI PASS / AWAITING BILLING SETUP AND LIVE

Source PR #1989 merged 09/10/2026, main42bee63704d135e86992eaf92ae5064f8ffb256c. Exact final PR CI37986817256 SUCCESS; earlier CI37984602197/37985196722/37985730552/37986249842 also SUCCESS. Isolated PostgreSQL/HTTP flow observed PASS for authorization, persistence, Audit, concurrent update conflict, missing billing configuration and session revocation. Local26/26 targeted and1981server PASS/0FAIL/4environment skips; production build PASS. Shared changes preserved through main reconciliation. PDFs regenerated with final handoff, after source publication, to avoid repeated concurrent binary conflicts.

Current owner remains codex/ai-credit-alerts-20261009. Production push CI/guarded Render release initiated; exact deployed revision and authenticated UI remain NOT TESTED at this checkpoint. No billing Admin key acquired/installed and no baseline configured. Real credit/account identity and warning/critical evidence remain NOT TESTED; no LIVE/LAB/manual PASS. No invoice/payment/stock/fiscal or provider purchase mutation.

Single next action: verify guarded release of source42bee637, then deployment administrator securely sets same-organization OPENAI_BILLING_ADMIN_KEY and Super Admin confirms current prepaid balance in AI Command Center. Do not paste secrets into chat. Perform read-only LIVE alert/settings acceptance after configuration; maintain same owner until explicit handoff. Setup: docs/ops/ai-credit-alerts-20261009.md.

