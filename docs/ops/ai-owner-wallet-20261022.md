# Owner AI prepaid wallet — setup and acceptance, not a PASS manual

Owner AI-OWNER-WALLET-01: feat/ai-owner-wallet-20261022. Source feat/ai-owner-wallet-implementation-20261022. Claim3008 green merged91af91c BEFORE source.

## Current coverage and safe defaults

The foundation meters the Owner assistant Responses provider. Every tool-loop model response is a separate exact-usage entry attributed to the selected initiating store, even when a report explicitly covers other owned stores. Company-wide balance is shared; ordinary wallet history/usage is selected-store plus company credits and company notifications. Platform SuperAdmin explicitly selects a company to view all its store usage. The invoice extension below adds gated OpenAI/Azure coverage. Platform internal assistant, scheduler and other AI providers remain outside this slice, OPEN, and must be integrated independently before advertising an all-AI wallet. No change to existing organization-credit monitoring.

No production activation was performed. AI_OWNER_WALLET_ENABLED defaults off; disabled provider paths pass the original settings without storage initialization. Dedicated tables initialize lazily only after runtime activation and authorized wallet use; no business tables are migrated. Do not enable for real customers before exact full CI, ordinary release and isolated/LAB acceptance.

## Tariffs

AI_OWNER_WALLET_TARIFFS is a JSON array of exact model rates. Each row has model, inputMicrosPerMillion, cachedInputMicrosPerMillion, outputMicrosPerMillion, contextTokens, maxOutputTokens. All values are non-negative integers except positive token limits. Currency is EUR;1EUR=1000000microEUR. Rates are the operator's approved customer charging schedule, not an asserted provider quote. There are no built-in rates or exchange assumptions. Use model for the requested model id. Optional responseModels is an explicit list of approved returned snapshot ids with this same verified rate/limits. Without it only the exact requested model is accepted. Never guess a rate from a name prefix or change the existing global assistant model merely to satisfy billing. Verify current context/output limits and usage contract. Each reservation stores a SHA256 version of its exact tariff. Missing or ambiguous model pricing fails before paid I/O.

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

## Engineering receipt22Oct2026

Source3009/a7adf6ca mergedcd633e9. Full PR39804554047 and exact-main39806020956 both SUCCESS3827server+8backup/zero failures/skips. All20 source blobs preserved in main9a67265. Ordinary release39807310528 was correctly held for newer report source; latest source CI39807166764/release pending at this receipt. Health201eb5e did not include the wallet. Runtime/mail OFF, hosted LAB/UI/email NOT TESTED. Full evidence in CHECKPOINTS/EVIDENCE/ai-owner-wallet-20261022/source-ci.json. Retained owner must verify the later normal combined release before acceptance.

## Additive invoice extension22Oct2026 — AWAITING CI / LAB

AI_OWNER_WALLET_INVOICES_ENABLED must be exactly true in addition to AI_OWNER_WALLET_ENABLED and the company wallet gate. Otherwise original invoice provider requests/fallbacks are preserved. Scope comes from already authorized persisted job/document/store context, never inferred inside the provider adapter. Covers FAST header, full/recheck, invoice assistant preview/background and discount provider calls in those contexts. Owner ledger still filters usage to the selected store; shared balance is explicitly company-wide.

OpenAI uses the existing approved exact-model token tariff contract. AI_OWNER_WALLET_AZURE_TARIFFS is a strict JSON array of model, apiVersion, unitMicros (positive integer EUR micro-units per physical page), maxPages (1..5). No built-in charge or guessed provider quote. Each configured exact model/version pair must be unique. Azure reserves measured physical PDF/image pages before analysis, then requires succeeded response, matching model/apiVersion and all sequential page numbers. Only a hash of operation identity is stored; images and raw operation URLs are not retained in billing. Missing/ambiguous pricing or insufficient balance stops before paid I/O. Provider uncertainty retains REVIEW; billing errors stop paid fallbacks/retries and require funding or explicit review. Existing invoice review/settlement/stock/fiscal behavior remains protected.

Engineering SMTP test uses actual Nodemailer against localhost with one synthetic recipient, proving transport acceptance only. No customer inbox delivery or production SMTP activation is claimed. Full native CI, normal deployment and separately measured hosted acceptance remain required.

## Database failure during uncertainty recording

The original reservation is committed before provider I/O. If a provider/settlement error is followed by a database failure while marking REVIEW, callers still receive the safe wallet usage-review error and must not start another paid fallback. The durable entry can remain RESERVED; no automatic refund/release occurs. The existing explicit SuperAdmin abandoned-RESERVED resolution after15minutes, with independently confirmed provider cost, remains required. The invoice boundary returns409; normal owner provider uncertainty retains its existing503 wallet code.

## Current technical source receipt22Oct2026

Foundation independently verified in live9a67265. Invoice3037 full3869server+8backup SUCCESS; review-fail-stop3041 full3877server+8backup SUCCESS, zero failures/skips, merged7f5afd3. The original073 push-main full CI ultimately passed after isolated browser-startup retry. Main CI39819683069 and ordinary exact release of the final review guard remain pending at this receipt. Runtime/invoice/mail flags and approved tariffs were not changed, real inbox and hosted LAB acceptance NOT TESTED.

## Latest release gate22Oct17:21UTC

Exact final wallet source7f5afd3 main CI39819683069 SUCCESS3892server+8backup, zero failures/skips. Normal release39821474323 was explicitly WITHHELD for newer paid-module source5c8ccf5/full CI39821105794; workflow SUCCESS is not installation. Public health remains9a67265, invoice extension not yet independently verified deployed. Retained owner must verify the later normal combined release and source blobs; no guard bypass, live billing activation or hosted/email PASS.


## Installed source and pricing preparation22Oct20:48Athens

Actual ordinary release39822773699/job119978211519 installed combined5c8ccf5 after full main CI39821105794 SUCCESS3916server+8backup,0failures/skips. Independent health and24/24 runtime blob comparison confirm technical installation. This supersedes earlier pending/held installation statements, not hosted acceptance. Native Platform Admin read-only selection confirms runtime billing remains disabled.

Pricing limitation before activation: the current three-rate contract does not distinguish newer-model cache-write lifetimes or long-context premiums. Official OpenAI prompt-caching and model documentation must govern an additive tariff extension before any exact-provider-cost claim. Preserve existing models/prompts and disabled compatibility. Actual deployed model configuration, approved EUR customer schedule, separately identified funding/grant budget, isolated/LAB acceptance and real inbox delivery remain unverified/unapproved.Owner explicitly selects50percent markup on verified provider AI cost converted to EUR:10EUR cost means15EUR customer charge. Markup approved, NOT yet applied.20EUR trial budget remains a proposal; no configuration or money changed.

Assigned owner visibility extension: selected-store settled usage through today, month/day totals and daily breakdown in Europe/Athens from the full ledger, with server as-of timestamp. Display customer charge and keep reservations separate. NOT YET IMPLEMENTED; protected company/store authorization and stale-store UI guards remain required.

Owner additionally requires separate invoice/question/other-AI cost categories and dated detailed entries. Aggregate both invoice providers as invoices, Owner assistant as questions, and preserve unknown future categories visibly. Do not infer invoice identities or question texts from provider calls; current historical entries contain feature only and cannot honestly establish cost per individual invoice/question.
