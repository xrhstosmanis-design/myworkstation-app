# AI-WALLET-BILLING-SCOPE-AUDIT-01 — READ-ONLY SOURCE/CONFIG AUDIT, NOT NEW LAB PASS

Date: 01/11/2026. Retained parent wallet owner feat/ai-owner-wallet-20261022; executor root, bounded documentation continuation docs/ai-wallet-billing-scope-audit-20261101. User asks to verify all chargeable services BEFORE approving the first financial email. Actual amount was supplied privately; do not publish it, credit it or send the notice during this audit. No new source/config/schema changes or paid provider/SMTP/POS actions.

## Evidence boundary

Render MCP confirmed live ad111f6f9c69dee7dcce5713eed39abe72aab122, dep-dbjjd0h42hec73d6o0ug (live12:56:25UTC). Review uses git show/git grep pinned to that revision, not speculative future main. Current native selected real-company wallet remains masterOFF/invoiceOFF, zero history, additionalrates0. No actual customer credit or notice was submitted. Existing postpaid LAB PASS/receipt3466 remains valid and separate. This is source wiring plus read-only configuration evidence, NOT an end-to-end paid acceptance for each service. Global production secret/env values were not fetched.

## Charge mapping for this customer AI wallet

| Function | Source evidence at live revision | Conclusion |
| --- | --- | --- |
| Owner Assistant / question about cash, sales or available business data | routes/owner-assistant.js:13 calls meterOwnerProvider; services/ai-owner-wallet-provider.js checks global enabled and repository.enabledFor(company); reserves then settles measured usage | Wired to wallet when global/master enabled and authorized. Asking AI to analyse a report belongs here. |
| AI payment-header reading | routes/commerce-pos-v244.js imports invoiceWalletResponsesFetch as fetch and wraps PAYMENT_HEADER_READ in withInvoiceWalletScope at604 | Invoice wallet policy applies when global/master/invoice are enabled; ordinary payment entry itself is not an AI call. |
| AI invoice reading, recheck and assistant | commerce-azure-invoice-reader.js, commerce-pos-ai-recheck.js, invoice-assistant-pos.js, lib/pos-invoice-assistant-reading.js, lib/invoice-discount-verifier.js use invoice meter/scope | Main reviewed paths are wired under invoice/global/company policies. OpenAI settles token usage; Azure settles pages. This inventory does not close the retained broader pre-draft/all-path acceptance residual. |
| New AI cash-paper/handwritten-sheet reading | services/cash-paper-provider.js:32 uses meterOwnerProvider with feature CASH_PAPER_READING; routes/cash-papers.js passes authorized scope; cash-paper-reader.js reuses existing checksum and does not dispatch another paid reading | Also wired to global/master wallet, independently of invoice flag. This was omitted from the previous chat list and from the owner-only readiness summary. Do not describe it as free or as an ordinary automatic report. |
| Automatic cash arithmetic/reconciliation | cash-automatic-audit.js calculates exact cents from transactions; cash-reviewed-automatic-source.js explicitly reads stored reviewed sources and never invokes handwriting provider | No new AI-wallet debit found for arithmetic/report projection itself. Previously stored AI paper evidence may have been charged at its original read. |
| Ordinary reports and automatic email delivery | automatic-report-source.js/dispatch/mail adapter; no model/meter import or provider dispatch in reviewed composition | No separate AI-wallet deduction found for ordinary generation/view/email. AI analysis requested through Owner Assistant is a different metered action. Does not assert anything about module/subscription prices. |
| Video/cameras/incident clips | video-adapters.js handles ONVIF/RTSP/vendor playback; video-admin/connector/audit contexts have no model/meter link in reviewed provider inventory | No customer AI-wallet debit found for viewing/playback/incident linkage. No implemented chargeable AI video-analysis pipeline identified; do not promise billed AI video analysis. |
| AI staff-schedule instruction interpretation | routes/api.js /schedules/interpret calls global fetch directly to Responses at258, without wallet meter | Provider AI can incur platform cost, but no deduction from this customer wallet is wired on that path. Not a claim of a free commercial module. |
| Platform SuperAdmin assistant / central invoice-learning fallback | platform-admin.js:1539 and platform-invoice-learning-ai.js:737 have direct provider calls outside customer wallet composition | Internal provider usage exists outside customer wallet. Do not put it on the customer debit list by assumption. |

## Extended cost inventory requested by user

advanced-online-product-search.js invokes Serper/Google CSE and logs AdvancedOnlineSearchUsage. Source defaults are ESTIMATES, not verified provider invoices and not customer-wallet deductions. platform-invoice-barcode-resolver.js, platform-invoice-learning-product-search.js and purchase-order-ocr-resolution.js also contain search-provider entry points. They require customer attribution plus an approved EUR unit tariff/conversion before pass-through; never convert the estimate into debt silently.

Invoice processing can contain additional provider calls inside one document workflow: first image/header read, product-table re-extraction, discount verification, page evidence, fallback/recheck and assistant questions. Each metered external request can be a separate usage debit when enabled. One UI document is not proof of exactly one AI call. Existing caching can avoid new dispatch; a read/view alone is not a paid call.

The wallet writer inventory found the common provider meter and Azure page meter as usage reservation entry points, with the repository settlement reducing balance. Optional per-call/per-invoice/additive pricing exists separately; current selected customer values remain0. A hold/REVIEW is not a second settled charge; debt settlement never funds the wallet again. ModuleCommercialTerms/CompanyManagedControlTerms and online delivery/order prices are separate commercial scopes, not automatic consumption of this AI balance.

## Corrections and remaining work

The earlier customer-facing two-service list was incomplete. The email must distinguish implemented, enabled customer debits from ordinary calculations/report delivery/video playback and from provider calls not wired to the customer ledger. AI provider cost, module subscription and deduction from customer balance are different facts. Current customer flags remain OFF, so this audit is not activation.

invoiceWalletFeatures() currently lists OWNER_ASSISTANT plus configured invoice features; it omits CASH_PAPER_READING despite the real cash-paper provider using the common master meter. Existing readiness prose similarly describes only Owner/invoices. Record this disclosure/catalogue mismatch as OPEN; do not silently enable another service or expand the charge policy. Broader retained unmetered-reader/REVIEW/model/role acceptance stays with its prior owner. Any source correction requires its own before-source claim and normal CI/release/LAB gate.

Next: provide user with the verified mapping, revise the FIRST EMAIL preview on that basis and wait for their review before actual credit/email. No new tests needed for this documentation-only read audit; no forced paid calls or replay of accepted LAB transactions.

## Subsequent user policy

The user subsequently explicitly requires all customer-attributable paid AI/external usage to pass through with the already agreed margin. Follow CHECKPOINTS/CHANGES/2026-11-01-ai-cost-pass-through-claim.md; audit findings remain facts about livead111f6f, not proof that missing paths are fixed. New source remains blocked until green/main claim publication.
