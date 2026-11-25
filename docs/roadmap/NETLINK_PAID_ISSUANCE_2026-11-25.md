# Netlink paid issuance —25Nov2026

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
