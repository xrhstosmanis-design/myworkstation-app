# Owner AI prepaid wallet — setup and acceptance, not a PASS manual

Owner AI-OWNER-WALLET-01: feat/ai-owner-wallet-20261022. Source feat/ai-owner-wallet-implementation-20261022. Claim3008 green merged91af91c BEFORE source.

## Current coverage and safe defaults

ONLY the Owner assistant Responses provider is metered in this version. Every tool-loop model response is a separate exact-usage entry attributed to the selected initiating store, even when a report explicitly covers other owned stores. Company-wide balance is shared; ordinary wallet history/usage is selected-store plus company credits and company notifications. Platform SuperAdmin explicitly selects a company to view all its store usage. Invoice/OCR/Azure, platform internal assistant and other AI providers remain unmetered, OPEN, and must be integrated independently before advertising an all-AI wallet. No change to existing organization-credit monitoring.

No production activation was performed. AI_OWNER_WALLET_ENABLED defaults off; disabled provider paths pass the original settings without storage initialization. Dedicated tables initialize lazily only after runtime activation and authorized wallet use; no business tables are migrated. Do not enable for real customers before exact full CI, ordinary release and isolated/LAB acceptance.

## Tariffs

AI_OWNER_WALLET_TARIFFS is a JSON array of exact model rates. Each row has model, inputMicrosPerMillion, cachedInputMicrosPerMillion, outputMicrosPerMillion, contextTokens, maxOutputTokens. All values are non-negative integers except positive token limits. Currency is EUR;1EUR=1000000microEUR. Rates are the operator's approved customer charging schedule, not an asserted provider quote. There are no built-in rates or exchange assumptions. Configure the exact response model (including pinned snapshot) and verify its current context/output limits and usage contract. Each reservation stores a SHA256 version of its exact tariff. Missing or ambiguous model pricing fails before paid I/O.

Reservation is the conservative configured maximum input context plus maximum output cost. It is NOT the final charge. A small balance may be insufficient to reserve a call even if the eventual actual cost would have been lower. Provider responses must report valid non-negative actual input/output/cached counts, exact model/id and counts within these bounds. Cached tokens are priced separately; sum rounds once UP to a whole microEUR. No question, prompt, image, token credential or raw provider error is retained in the ledger. Unknown cost never becomes an invented free request.

## Funding and use

Platform SuperAdmin opens https://myworkstation-app.onrender.com/platform-admin → Υπόλοιπα AI πελατών → explicitly select company. Configure prepaid Owner assistant and an existing direct-company Owner recipient. Only actual current SuperAdmin session can write. Owner personal session can view own selected active store; explicit OwnerCompanyAccess is required for an additional owned company. Operators/managers cannot fund or read the wallet.

Receive payment to MyWorkStation outside this implementation. Record only confirmed net spendable AI amount and authoritative unique receipt reference. Funding reference is trimmed/NFC/uppercase and unique globally across company wallets; identical same-company/same-amount replay returns the original receipt, changed payload or other company is rejected. This does not independently prove a bank payment; SuperAdmin explicitly confirms receipt. It does not issue a fiscal invoice or perform a card charge. Payment instructions use AI_OWNER_WALLET_PAYMENT_INSTRUCTIONS; absent configuration asks the owner to contact MyWorkStation, never invents bank details.

An uncertain provider response/timeout/db settlement failure keeps a reserved REVIEW hold; no automatic refund or repeated model request. A process crash can leave RESERVED. Explicit SuperAdmin POST /api/ai-wallet/platform/companies/:companyId/reviews/:entryId requires amountMicros, resolutionReference and providerCostConfirmed:true. Only REVIEW or abandoned RESERVED older15min can be resolved, amount0 through original reserve; the cost needs external provider evidence. Immutable resolved replay must match exact amount/reference, and a distinct provider response cannot be charged twice. No automatic payment or financial/stock posting follows.

## Notifications

CREDIT confirmation at every funding; LOW at/below20% of last funded amount; EMPTY at zero final balance. Unique company/kind/funding-cycle prevents repeated threshold notices. Holds are displayed separately; they are not fictitious settled spend. In-app history is available while viewing Owner assistant and refreshes30seconds/focus. This first placement is not a global operating-system push/banner.

For SMTP additionally enable AI_OWNER_WALLET_EMAIL_ENABLED and existing SMTP_HOST/PORT/SECURE/USER/PASSWORD plus MAIL_FROM. No real SMTP configured/called by development. Existing mail service is unchanged. Wallet sender validates one exact accepted recipient/messageId and no rejected/pending recipients. Dispatch refreshes owner role, password state, company activity, saved owner id/address and email opt-in before durable ATTEMPTING commit. A later changed/revoked recipient is never silently substituted for an older event. As with any external send, identity changes after the final validation can race delivery. SMTP acceptance is not inbox delivery.

One queue attempt per event, up to10per60seconds per process, SKIP LOCKED across instances. Process death after ATTEMPTING and timeout/ambiguous SMTP results do not retry automatically. ATTEMPTING/UNKNOWN require review; the UI states this honestly. This protects duplicate email at the cost of possible missed messages. Worker timer is unref'd; no existing scheduler/automatic-report sender is modified.

## Required acceptance

Green complete PR and exact-main CI, native PostgreSQL tests unskipped, client build and existing invariants. Then exact ordinary guarded deployment. Isolated synthetic funding/concurrent requests/rollback/foreign/revoked-session tests and mounted stale-store UI tests are engineering checks, not real LAB/customer/email PASS. Actual UI/LAB/email test must use separately identified authorized synthetic company and SMTP recipient with before/after ledger and untouched business/control evidence. Do not replay accepted invoice/payment/upload/stock operations. Broader metering and global notification placement remain OPEN.
