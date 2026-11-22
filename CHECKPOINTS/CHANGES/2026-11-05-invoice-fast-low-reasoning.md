# 05/11/2026 - INVOICE-HEADER-LATENCY / FAST LOW REASONING / BEFORE-SOURCE CLAIM

Owner: retained /root. Documentation branch docs/invoice-header-h-result-20261105, followed by source branch fix/invoice-fast-low-reasoning-20261105. This continues the owner's explicit task2 request and existing timing ownership; no transfer or duplicate assignment. Parent latency remains OPEN. Main reviewed through ee3551474e169f5d4d24b450f804163b04b653a4, including the peer cash claim and intact registries/PDFs. Source edits may start only after this claim is green and merged.

## Latest real evidence

Fresh synthetic two-page H on exact0aef945fdff1b1f3808e9b1a28c1e6fdaba6750d produced LAB METER TEST / LAB-HEADER-TIMING-20261105-H /2026-11-05/24.80EUR automatically. Browser observed21959ms; correlated server21746.166ms, Azure14839.447ms and OpenAI6884.620ms with one successful attempt. Ten-table count/hash and active-shift LAB/control evidence is unchanged before/after. No payment/draft/stock/approval/fiscal action. H is consumed and never replayed; I remains PREPARED_NOT_UPLOADED. Detailed evidence and release receipts: CHECKPOINTS/CHANGES/2026-11-04-invoice-header-timing.md and CHECKPOINTS/EVIDENCE/invoice-header-timing-20261104/.

The existing Super Admin configuration view displays OPENAI_INVOICE_MODEL=gpt-5 and FAST override=application default; the current code selects FAST override, then general invoice model, then gpt-5-mini. This supports configuredgpt-5; it does not establish H's returned dated snapshot. LAB/company invoice billing is OFF and the bounded H ledger query has no rows. No setting was saved or changed. No new provider request was made by the configuration review.

## Bounded causal hypothesis and exact change

The existing FAST OpenAI request omits reasoning effort. Official GPT-5 documentation supports low effort; the GPT-5 prompting guide describes medium as its default. A lower setting can reduce reasoning work but may affect accuracy. This is a controlled candidate for H's6.885-second OpenAI component, not a fix claim for its dominant14.839-second Azure component. One H/I pair cannot establish typical or tail latency or attribute all end-to-end variation to the setting.

After this claim is green/main, change only callFastOpenAiHeader in server/src/routes/commerce-pos-v244.js: retain the model selected inside each attempt by the existing precedence, and add reasoning:{effort:"low"} only when that model is exactly gpt-5 or gpt-5-2025-08-07. All other model strings, including gpt-5-mini, retain their existing body. Do not normalize or prefix-match model names. No new environment setting.

Preserve exact prompt, seven-field strict schema, PDF MIME/data URL/original bytes and file part, Azure-first order, multi-page safety guard, verified Azure footer preference, response fields,20-second Azure bound, shared70-second/two-attempt OpenAI budget, original wallet errors/reserve/settlement, scope/auth/licensing and background product handoff. No wallet/provider/model/configuration migration or Azure transport change. No total-safety work from separate PR3654, cash/credit/other owner scope, payment/draft/stock/fiscal or outbound action.

## Verification and acceptance

Add meaningful actual-function transport cases in server/test/pos-fast-header-latency.test.js for exact supported/excluded models, FAST/general/default precedence, unchanged full PDF/prompt/strict schema and the two-attempt shared budget with identical request bodies. Demonstrate new supported-model assertions fail against old source. Retain timing/handoff and existing wallet-forwarding coverage, including ai-invoice-request-reserve.test.js (its reasoning-preservation assertions already exist). Use Node20. Full exact PR/main CI and ordinary guarded exact healthy release precede hosted I.

Then refresh and record ten-table LAB/control before values in the checkpoint, perform exactly one fresh I header-only selection with continuous elapsed observation, compare all four fields to LAB METER TEST / LAB-HEADER-TIMING-20261105-I /2026-11-05/24.80EUR, capture stage/attempt timing and after/control. No type/PAID/CREDIT/submission. Report browser and server/provider stages separately; stage spans include wrappers, and nested attempt is not additive. A wrong field or unchanged/slower measured stage is a failed or inconclusive performance candidate, not a speed PASS. Do not replay H or paid/CREDIT documents to repair evidence. No product/EFK/cross-supplier/physical POS acceptance is implied.

## Official reference contracts reviewed 05Nov2026

- GPT-5 supported efforts and exact snapshot: https://developers.openai.com/api/docs/models/gpt-5
- GPT-5 default reasoning discussion: https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- Responses reasoning parameter and effort trade-off: https://developers.openai.com/api/docs/guides/reasoning
- Azure stream analyze options (additional query fields, not a header-only projection): https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document-from-stream?view=rest-aiservices-v4.0+(2024-11-30)
- Azure polling guidance: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0

Status: CLAIM ONLY / SOURCE NOT EDITED / I NOT TESTED. Existing G/H limited correct-header evidence is protected. Single next: publish this claim with applicable green documentation CI, then implement the bounded request setting. Owner retained through recorded completion or named handoff.
