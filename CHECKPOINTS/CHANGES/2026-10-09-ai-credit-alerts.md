# AI-CREDITS-01 — Admin warning before AI credits expire

09/10/2026 22:36 Europe/Athens. ASSIGNED codex/ai-credit-alerts-20261009. Owner explicitly requested the feature. Independent extension; preserve all other owners and all accepted AI Command Center phases.

Before: uploaded screenshot shows429 on invoice102986 and provider dashboard balance−0.12$. This is observed screenshot evidence, not independent provider/account confirmation. Existing app has no credit alert. Public healthb40a09dff6f0aaac585c1b71f2e36e51181e01e2 differs from newest main4cd333b7. Authenticated LIVE sign-in blocked by security review before prompt; no credentials entered. All new behavior NOT TESTED.

Official OpenAI Costs API reports billed organization costs, not remaining prepaid credits: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs . An admin key is required. Do not claim the spend API is a direct credit-balance API or request a secret in chat. Use a user-confirmed balance baseline and all-organization cost difference only when monitoring is configured, explicitly estimated and subject to billing delays/external credits/expiry. Unknown/unconfigured/stale/failure must never show green.

Acceptance: Super Admin only configuration; thresholds5$/2$ default, validation; estimated warning at thresholds and exhausted state; fresh current-balance baseline, no automatic purchase; safe read-only Costs polling/pagination/timeouts; no key/provider error details leak; settings Audit; central homepage and AI Command Center alerts. Focused behavior and authorization tests, full CI, exact deployed source and real LIVE review before PASS.

No provider key/account/credits/payment change, no invoice upload/extraction/finalization/stock/fiscal mutation. Manual remains unchanged until LIVE PASS. Single next action: publish green docs-only claim on main, then bounded implementation.

## AI-CREDITS-01 — implemented / LOCAL PASS / AWAITING CI, setup and LIVE

Claim PR1987, docs CI37983339777 SUCCESS, merged main4a69eb48 before source. Same owner codex/ai-credit-alerts-20261009; source codex/ai-credit-alerts-implementation-20261009. Added central homepage/Command Center warning,5USD/2USD defaults and validated current-balance/threshold settings, dedicated persistence + transactional Audit/version conflict, bounded all-organization Costs API reads. Unknown/failure/stale never green; estimates clearly labelled. Page polling60s/server cache5min; no email/push/scheduled external task. No provider credential installed or invoice/business mutation.

Local Node20.20.2 targeted26/26; full server1981PASS/0FAIL/4environment skips; production build PASS. New isolated PostgreSQL/authenticated HTTP CI flow still pending. Same-account OPENAI_BILLING_ADMIN_KEY, real current-balance baseline, exact deployment and LIVE acceptance remain NOT TESTED. No new manual PASS. Ops docs/ops/ai-credit-alerts-20261009.md; checkpoint CHECKPOINTS/CHANGES/2026-10-09-ai-credit-alerts.md. Owner retained.

Single next action: publish source PR/full CI and exact release; then securely configure same-organization Costs access and current-balance baseline before LIVE acceptance. No automatic provider account/payment setup.

## AI-CREDITS-01 — source merged / CI PASS / AWAITING BILLING SETUP AND LIVE

Source PR #1989 merged 09/10/2026, main42bee63704d135e86992eaf92ae5064f8ffb256c. Exact final PR CI37986817256 SUCCESS; earlier CI37984602197/37985196722/37985730552/37986249842 also SUCCESS. Isolated PostgreSQL/HTTP flow observed PASS for authorization, persistence, Audit, concurrent update conflict, missing billing configuration and session revocation. Local26/26 targeted and1981server PASS/0FAIL/4environment skips; production build PASS. Shared changes preserved through main reconciliation. PDFs regenerated with final handoff, after source publication, to avoid repeated concurrent binary conflicts.

Current owner remains codex/ai-credit-alerts-20261009. Production push CI/guarded Render release initiated; exact deployed revision and authenticated UI remain NOT TESTED at this checkpoint. No billing Admin key acquired/installed and no baseline configured. Real credit/account identity and warning/critical evidence remain NOT TESTED; no LIVE/LAB/manual PASS. No invoice/payment/stock/fiscal or provider purchase mutation.

Single next action: verify guarded release of source42bee637, then deployment administrator securely sets same-organization OPENAI_BILLING_ADMIN_KEY and Super Admin confirms current prepaid balance in AI Command Center. Do not paste secrets into chat. Perform read-only LIVE alert/settings acceptance after configuration; maintain same owner until explicit handoff. Setup: docs/ops/ai-credit-alerts-20261009.md.

