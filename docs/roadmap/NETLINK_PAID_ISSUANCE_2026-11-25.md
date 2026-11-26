Owner BackOffice continuation26Nov: selected-store paid-card workspace added for existing privileged owner/support access; common audited review and saved-card print are used without requiring or elevating an employee POS login.66native/HTTP/mounted tests and frontend build PASS; current full CI and release pending.

Latest26Nov continuation: provider confirmed that the original paid request never reached Netlink and was not executed. /root retains the incident; before-source claim4256 merged a28d786. Privileged audited non-execution review and once-only fulfillment source is under validation; the same payment/fiscal receipt is retained. New issuance remains paused and separate recovery activation is closed. No production review/fulfillment has occurred. See `../../CHECKPOINTS/CHANGES/2026-11-26-netlink-paid-recovery-source.md`. Earlier pending-email/provider-result notes are superseded by the received confirmation, not by a voucher PASS.

# Netlink paid issuance —25Nov2026

Latest correction installed: source#4241/d6694542c758636b4da7f7f39a39b481b3af43cb, full CI45647815255 SUCCESS, exact Render LIVE/health verified. New issuance stays PAUSED; paid UNKNOWN purchase is not replayed or closed. User reports no corresponding charge in the current provider-terminal daily report; provider reconciliation remains required. See `CHECKPOINTS/CHANGES/2026-11-25-netlink-unknown-correction-live.md`.

Authoritative incident continuation: user paid/fiscal sale exists but provider result UNKNOWN. New issuance is PAUSED. Preserve the existing paid record and frozen provider identity; no replay or second payment. See `CHECKPOINTS/CHANGES/2026-11-25-netlink-unknown-request-id.md`. /root retains ownership; provider reconciliation and real voucher acceptance remain OPEN. Earlier ready/activation notes below are historical.

Authoritative release continuation: PR#4229 merged7623888cc63d95f1c1f4283231e4e938b565f397, full CI45633162691 SUCCESS. Code and activation deploys LIVE; selected-store non-stock card-value/existing-fee mapping is complete and fee stock/history preserved. Earlier uncommitted/NOT LIVE notes below are historical. Next action is grouped user acceptance of the normal full cash/card+fiscal checkout and each saved voucher; real issuance/printing NOT TESTED. Variable/prepare services remain read-only. See `CHECKPOINTS/CHANGES/2026-11-25-netlink-paid-live-setup.md`.

ASSIGNED /root, continuation of existing Netlink ownership. No duplicate external-certification/cash/rights claim.

1. Durable scoped quote/intent: authoritative provider product/payload/amount, configured service POS products, exactly0.50EUR per card, immutable checkout linkage. No guessed ambiguous prices or tax mapping.
2. Before provider dispatch require matching completed native sale, exact card+fee lines and paid amounts, employee cash receipt or trusted successful card-machine proof and issued fiscal receipt for the same store/sale/request. Reject declined/pending/timeout/credit/offline/no-receipt and mismatched fee/price before sending.
3. Atomic once-only dispatch claim; concurrent replay must not dispatch twice. Unknown provider/transport result remains review-required with same request identity, never automatic purchase retry. Encrypted payload/confirmation and printable provider result; recovery/reprint never reissues a card.
4. Central common POS integration adds paired value/service lines automatically and completes issuance only after normal successful checkout. Preserve existing fiscal recovery, tenant/module/licensing and once-only payment behavior. No new sale merely to repair lost UI state.
5. Isolated mock-provider/real HTTP+SQL/mounted UI tests for cash, approved card, decline, timeout, fiscal failure, exact fee, replay/concurrency and store switch. No real provider purchase in automated tests.
6. Full CI/release/exact revision, then one grouped user acceptance with existing POS/printer. Paid issuance/physical voucher printing remains NOT TESTED until measured. Internal reports remain separate from provider statements.

## Mixed basket continuation

User requires ordinary products in the same basket. Implementation now appends paired card/service rows without replacing ordinary goods; multiple cards share one immutable native checkout manifest, with a separate EUR0.50 service allocation for each card. Payment evidence must cover the entire basket. Removed intents cannot borrow another receipt, and aggregated receipt quantities cannot fund two intents with a single fee.

Local targeted contract/allocation tests:32PASS,0FAIL. Added pre-selection native fiscal readiness check and stale-scope guard for sequential card completion. Source remains uncommitted and NOT LIVE; full SQL/HTTP/UI validation, configuration mapping, full CI and release remain pending. No real provider purchase or physical voucher test was performed.
