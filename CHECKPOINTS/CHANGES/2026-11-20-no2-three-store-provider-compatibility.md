# Νο02 — Three-store supplier PDF compatibility audit / TECHNICAL LIVE — GROUPED APPLICATION ACCEPTANCE OPEN

20/11/2026 Europe/Athens. Retained No02 owner `/root`, branch `fix/no2-verified-provider-compatibility-20261120`. The owner expanded the existing request to all suppliers with PDF acquisition problems in Αχαρνών 309, Ριζαρείου and Διαδόχου Παύλου. Overall No02 remains OPEN.

## Evidence and interpretation

Read-only selected-company/store metadata is being inventoried by provider host and URL profile, supplier and existing acquisition state. Report separately missing original URLs (`NO_URL`), never-attempted acquisition, recorded acquisition failure, existing PDF attachments and non-PDF attachments. Counts of stored rows are raw records and must not be labelled logical invoice totals or imply that every row without a PDF has failed acquisition. Retain store/company isolation and avoid inferring unpaid status from missing originals.

An exact S1 profile, `einvoice.s1ecos.gr` with `/p/EL<issuer>/<40-hex>/<32-hex>`, is already recognized by the existing QR download implementation but absent from the original-acquisition path. It is a candidate for a bounded compatibility correction after exact source review and synthetic proof. Other inventoried provider profiles remain unverified until independently established.

The earlier Epsilon third-party case in #4072/#4073 retains its provider-verification/export blocker. The official viewer rendered the document, but original PDF retrieval and application verification remain unaccepted. No retry, challenge bypass or alternate provider API is part of this new audit. The prior installed #4069 PDF bridge and accepted payment-tolerance evidence remain protected.

## Assigned implementation after this claim merges

Review current provider parsing/download logic and the existing unmerged #4048 three-store recovery candidate for compatible reusable code. That PR's history and assertions remain historical candidate evidence, not installed behavior or new production acceptance. Carry forward only independently verified isolated changes under the retained No02 adapter ownership. Do not activate its dormant production bulk-recovery behavior through this claim.

Implement bounded provider compatibility in `server/src/mydata-original.js` and dedicated helpers/tests only for verified exact host/path/profile combinations, reusing established project logic where correct. Preserve old provider behavior, redirect rejection or explicit provider-specific redirect contracts, HTTPS/query/credential checks, time/byte/page/PDF type/magic bounds, document/issuer/recipient identity verification, and idempotent attachment/canonical draft/payment linkage. No host wildcard or generic redirect relaxation. Use synthetic fixtures for public tests and keep private original URLs, tokens, business identifiers and amounts outside the repository.

The audit may prepare a selected-store status breakdown and reasons that distinguish missing/unattempted/failed/non-PDF states. Provider availability, document identity and successful same-draft recovery require their own evidence. No04 reader/models/prompts/wallet/confirmed atomic line transfer and invoice/payment/stock/fiscal/finalization writers retain their existing ownership and behavior. No financial or provider-account writes, recovery activation or email to additional providers is authorized by this claim.

## Acceptance and current status

This is a documentation-only before-source claim. New compatibility source is NOT STARTED / NOT TESTED. The provider inventory is read-only work in progress. After claim CI and merge, require targeted provider regression tests, original-acquisition/draft preservation regressions, build, full exact source/main CI and ordinary guarded installation for any runtime correction. Group remaining supplier-original recovery/read/confirmed same-draft lines into the agreed final session using existing authorized records. Previously observed successes and external blockers retain their precise scope.


## Offline audit and S1 source preparation — 20/11/2026

Before-source claim #4075 merged as 7ecb878ab0b7b752bc18984ee58b431ff8991c16 after documentation CI 44686875481 passed all three applicable checks; two runtime jobs were skipped by documentation classification. The retained No02 adapter scope is independent of #4048. That unmerged bulk/scheduler recovery work has unconfirmed page ownership and is not taken over, activated or changed here.

The read-only three-store metadata inventory is complete. It groups 53 provider URL profiles and 511 supplier-name/profile combinations. Source rows are stored records, not logical invoice counts. The private audit retains each store's row totals, missing-URL/unattempted/failed/PDF/non-PDF distinctions and potential S1 candidates. Missing PDF evidence does not establish acquisition failure or a financial balance.

Only two source/test files are prepared. The original URL parser accepts the exact existing S1 QR-provider host einvoice.s1ecos.gr with its issuer-bound canonical path and appends the existing /pdf suffix. It also rejects raw or XML-decoded whitespace/control characters before URL parsing. Targeted tests cover that exact host, issuer/path/token shape, credentials, nondefault ports, query/fragment, lookalike/subdomains and malformed controls. The mocked PDF path retains redirect rejection and existing PDF identity checks. All other provider profiles remain inventory-only; the earlier Epsilon third-party verification/export blocker remains unchanged.

The final combined original-download, QR, PDF-route and HTTP-error regression batch passed **25 tests / 25 PASS / 0 FAIL / 0 SKIP** locally. A preceding broader startup failed because the local Prisma dependency had not been generated; after local generation the combined batch passed. No production database was used for this preparation. Root source review passed for the two-file diff. These results establish local synthetic behavior only. No current real-provider PDF download or application-side identity verification PASS is claimed for S1 or other audited providers.

Automatic approval review rejected the external PDF probe batch because it would transmit private invoice URLs/tokens to a provider without specific authorization for that disclosure. No retry or alternate provider request followed the rejection. The user must review the concrete destinations, data and purpose before live acquisition tests continue; the exact private destination inventory is retained outside this public repository. No additional provider email is authorized here.

Publish this preparation only as a **DRAFT source PR**. Do not merge or deploy before the root review and explicit private-link transmission approval/live proof. Full source/main CI and ordinary guarded installation remain future gates for an approved correction. The installed #4069 bridge, No04 core and financial/stock/fiscal behavior retain their previous evidence. Overall No02 remains OPEN.


## Explicit approval and verified four-provider source — 20/11/2026

The owner explicitly approved using the private invoice links and tokens solely with their respective named providers for the disclosed PDF acquisition/identity checks. This resolves the earlier automatic-review disclosure blocker for those approved probes only. The previous DRAFT hold above records the earlier state and is superseded by this approved, bounded evidence.

Read-only approved acquisition returned actual PDFs from **einvoice.s1ecos.gr**, **e-invoicing.gr**, **onesign-api.onesys.gr** and **vs.gr**. The production strict identity verifier passed for all four. A cached run of the complete fetchOriginalPdf pipeline also passed exact expected URL, redirect:error, byte checksum and page-count checks for each original. The S1 sample has two pages; the other three samples have one page each. Private URLs, document identities, PDF contents and checksums remain outside this public repository. These results establish provider acquisition and PDF identity for the observed samples. No application invoice/draft/payment/stock/finalization write was performed.

The final correction remains exactly two source/test files. It enables only the four verified host/path profiles with the existing bounded original parser and strict PDF identity pipeline. OneSign uses its direct public-download path; the other verified formats use their specific PDF suffix contract. Unknown hosts/profiles, query/credentials/nondefault ports, malformed controls and redirect responses remain rejected. Public tests use synthetic tokens and invoices.

The combined original-download, QR, PDF-route and HTTP-error regression batch passed **36/36 tests**, with **0 failures and 0 skips**. Production client/server build passed. Root reviewed the final two-file provider diff and the unchanged existing gates. A generated server index change from the build was restored before publication.

Epsilon third-party remains blocked with no retry or bypass. Megasoft, Wedo and ESKAP returned HTML for the observed requests and are not enabled. Their observed interfaces differ. Megasoft renders metadata; its view action produced no PDF/new tab and exposed a DevExpress browser error. The earlier unhandled-error text in its HTML was hidden boilerplate, not proof of an error page or bot denial. Wedo returned an HTML invoice response, and ESKAP's documented PDF-suffix request returned HTML. This is not a blanket conclusion that every provider is blocked by the same verifier. No HTML-rendering fallback is added. Other inventoried profiles remain unverified, and #4048 bulk/scheduler recovery remains outside this implementation.

Update the same source PR #4076 with this combined correction. Exact final-head full CI, expected-head merge, exact merged-main full CI and ordinary guarded deployment are authorized after their gates pass. This authorization does not enable bulk production recovery or transfer No04/financial-writer ownership. Hosted application recovery/read/confirmed same-draft line acceptance remains in the grouped final session. Overall No02 remains OPEN.


## Verified installation and final scope — 20/11/2026

Four-provider source #4076/head724f0d92341327ccd980affd8650a8c6368f55df passed source CI44691724843 and exact main CI44693666397, each **5/5 jobs**, **6875 PASS / 0 FAIL / 3 optional skips**, plus **8/8** recovery tests. It merged as 6d7886940d8cb08588f2654d748cd434bfd87c61 and normal guarded deployment44695431224 completed **2/2**. Render dep-dbvve8rrjlhs73fsspng reached LIVE at **09:36:07 Europe/Athens**, exact6d788694. Independent healthy-revision verification passed.

The corpus-driven six-character follow-up #4078 passed its separate exact source/main gates and installed as63233319, as recorded in the linked six-character checkpoint. The latest combined monthly release is **beb5858f8b658ff40f3f89775e9ea712d691147c**, Render **dep-dc00ks3rjlhs73fvu6u0**, LIVE at **10:54:45 Europe/Athens** after normal guarded deployment44706019758. It retains both provider fixes and the No7 report-installer source6615c15c through normal ancestry. This is source installation evidence, not hosted report-installer database acceptance.

### Observed remaining profiles and recovery ownership

The existing main Epsilon profile was independently downloaded and passed strict PDF identity verification. The blocked third-party profile159 retains its verifier/export blocker with no bypass. A separate approved third-party profile169 produced a PDF; its strict automatic identity check failed because the issuer VAT exists in a rendered image/header and is absent from extractable text. Internal visual review supports the expected rendered header. That profile remains unenabled with its strict text guard intact, and bounded OCR/header work belongs to the retained reader owner. The observed sample is a delivery note; source type and financial treatment remain separate.

Megasoft's actual metadata/view action and DevExpress result supersede the earlier HTML-boilerplate interpretation above. Wedo and ESKAP still provide no verified PDF response for the observed contracts. They remain unenabled. No HTML-rendering fallback, new provider account/email operation or relaxed identity check was introduced.

Adapter deployment alone does not retry old failed/unattempted rows. The old #4048 November-only recovery candidate defaults OFF and retains unresolved page ownership. A single sanitized coordination request was posted as comment7033927674 for explicit release/handoff before any all-history three-store recovery extension. A separate factual integration status comment7034654114 on #4081 coordinates the newer combined release without claiming hosted V3 installation or requesting repeated financial/role tests.

The private audit retains exact source-row totals, URLs, supplier identifiers and original PDF proofs. Public coverage counts remain URL-pattern/store-row evidence, not recovered invoice totals or financial obligations. Overall No02/#4019 remains OPEN for external profiles, bounded recovery ownership, reader-owner OCR and grouped hosted application acceptance.
