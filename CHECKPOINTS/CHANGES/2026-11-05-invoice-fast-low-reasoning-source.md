# 05/11/2026 — INVOICE-HEADER-LATENCY / GPT-5 FAST LOW-REASONING SOURCE

Owner: retained /root. Parent task 2 stays OPEN. Before-source claim: #3664 merged to main as 6f30ba0c6255d808458992bb7d23f3cea5668409.

## Bounded implementation in draft PR #3665

- Source: server/src/routes/commerce-pos-v244.js, only callFastOpenAiHeader Responses request. Exact selected model gpt-5 or gpt-5-2025-08-07 receives reasoning:{effort:"low"}; all other strings retain their prior JSON body. Existing FAST/general/default precedence, input, seven-field strict schema, PDF bytes, wallet, provider order, deadlines and two-attempt budget are unchanged.
- Tests: server/test/pos-fast-header-latency.test.js has new actual-function transport cases for exact allowed/excluded models, original PDF/data URL and schema, and identical two-attempt body with shared 70s budget. Source/test change has NOT been proven by native suite; do not assert PASS before full CI.
- First exact CI run 41969313487 on head 477cb7d513f2951f100595ecfc42fcada904a3c5: FAILURE. build-and-test stopped at mandatory checkpoint gate because this change and the active list were not modified in source branch. Wholesale isolated Chromium check failed Target.createTarget timeout (non-PDF area, not yet confirmed as flaky). Other returned jobs passed. No shortcut around any gate permitted.

## Next exact gates

1. Preserve every existing active-list entry and add bounded source checkpoint; rerun PR CI on the new exact head.
2. Full native Node20/PostgreSQL/HTTP/frontend tests and isolated wholesale check must complete green, or diagnose and resolve any remaining failures within the responsible owner's scope. Independent review before merge.
3. Merge to main only with protected peers preserved and exact green CI, then full main CI and guarded healthy release.
4. Only after that, perform one synthetic I header-only, no-submit/no-payment/no-stock LAB measurement with fresh ten-table before/after/control, four fields, stage timing and no H replay. Improvements NOT PROVEN.

No real invoice submitted, paid reader call, provider configuration edit, financial transaction, deploy or merge of source PR was performed during this checkpoint.

## Task 2 continuation through ordinary Git — 05/11/2026

At 997c109, follow-up CI 41969689976 passed all gates except the active-list checkpoint policy; wholesale Chromium passed. Added the missing source entry by lossless byte prepend, verifying the old complete registry is the exact suffix. No source behavior changed in this continuation. Full new-head CI remains required and speed improvement remains NOT PROVEN. Retained owner and synthetic I reservation preserved.

Validation after merging current main f0d45ed: active-list conflict resolved by preserving the entire main registry as an exact byte suffix after the source entry. Node20.20.2 actual-handler suite: 73 PASS, 0 FAIL, 0 SKIP (including real two-page PDF text fixture). First local run lacked pdfjs-dist; rerun with existing workspace dependencies passed all cases, without source/test changes. Checkpoint policy passed. Full GitHub CI still required; no hosted read or speed claim.
