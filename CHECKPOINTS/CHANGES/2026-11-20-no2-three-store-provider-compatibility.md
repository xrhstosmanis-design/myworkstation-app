# Νο02 — Three-store supplier PDF compatibility audit / SOURCE PREPARED — DRAFT REVIEW HOLD

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
