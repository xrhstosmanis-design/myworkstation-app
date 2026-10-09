# AI-CREDITS-01 — Admin warning before AI credits expire

09/10/2026 22:36 Europe/Athens. ASSIGNED codex/ai-credit-alerts-20261009. Owner explicitly requested the feature. Independent extension; preserve all other owners and all accepted AI Command Center phases.

Before: uploaded screenshot shows429 on invoice102986 and provider dashboard balance−0.12$. This is observed screenshot evidence, not independent provider/account confirmation. Existing app has no credit alert. Public healthb40a09dff6f0aaac585c1b71f2e36e51181e01e2 differs from newest main4cd333b7. Authenticated LIVE sign-in blocked by security review before prompt; no credentials entered. All new behavior NOT TESTED.

Official OpenAI Costs API reports billed organization costs, not remaining prepaid credits: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs . An admin key is required. Do not claim the spend API is a direct credit-balance API or request a secret in chat. Use a user-confirmed balance baseline and all-organization cost difference only when monitoring is configured, explicitly estimated and subject to billing delays/external credits/expiry. Unknown/unconfigured/stale/failure must never show green.

Acceptance: Super Admin only configuration; thresholds5$/2$ default, validation; estimated warning at thresholds and exhausted state; fresh current-balance baseline, no automatic purchase; safe read-only Costs polling/pagination/timeouts; no key/provider error details leak; settings Audit; central homepage and AI Command Center alerts. Focused behavior and authorization tests, full CI, exact deployed source and real LIVE review before PASS.

No provider key/account/credits/payment change, no invoice upload/extraction/finalization/stock/fiscal mutation. Manual remains unchanged until LIVE PASS. Single next action: publish green docs-only claim on main, then bounded implementation.
