# Netlink paid mixed baskets —25Nov2026

Owner /root; existing claim PR#4225, branch `fix/netlink-paid-issuance-20261125`. Source base450663cfd0faab4479a255bbee61bf600339bbd3.

Each card adds fixed EUR0.50 service. Ordinary goods and several cards share the same normal cash/card checkout and fiscal receipt. Immutable native checkout markers allocate separate paid value/service units per intent, including aggregated quantity-N lines. Full basket amount must be paid. Fixed execute-only catalogue products are supported; variable/prepare services remain read-only. No tax/product mapping is guessed.

Provider dispatch requires scoped native completed sale, exact card/fee allocation, full payment and genuine issued fiscal evidence. Initial quote requires ready receipt-capable native register. New intents cannot attach to an already paid checkout. Atomic SQL claim prevents duplicate dispatch; timeout/unknown/malformed results require reconciliation without automatic repurchase. Provider intent/result are encrypted, scoped receipt access audited; lists/replays expose no PIN. Old direct production execute path remains blocked. Reprints use the saved card.

Central Super Admin form maps existing non-stock service products with fixed0.50 fee. Existing licensing/module/store/operator/fiscal gates are preserved. No production config, flag, provider purchase or financial operation executed for this change.

Validation: local32 contract/allocation tests PASS, client production build PASS, diff whitespace check PASS. New isolated PostgreSQL/native SQL+HTTP test covers additive repeatable migration, mixed basket, missing receipt, concurrent issue, two cards, encryption, operator/store boundaries and reprint without repurchase; locally SKIPPED without isolated PostgreSQL. Full CI pending. Physical voucher printing and real paid issuance NOT TESTED. Earlier user catalogue/report print PASS remains protected and is separate.

Remaining: full CI, integration review, exact release verification, accounting mappings and grouped existing-LAB/user acceptance. Execution remains locked until these prerequisites are satisfied. RBS command commit alone does not count as a fiscal receipt; native receipt capability is required before selection.

Implementation review continuation: PR#4229 at17a1dadf03950f8eabc39b8eb052e021c9dec0a3. Local all-Netlink regression suite58tests/56PASS/0FAIL/2isolated-PostgreSQL skips; includes mounted React tests for whole-basket confirmation and aborting sequential issuance on store switch. Added late quote checkout-identity guard and serialized setup saves/search response ordering. Main synchronization retains concurrent stock-alarm/report assignments. CI45628602457 in progress; not a release or LAB PASS.
