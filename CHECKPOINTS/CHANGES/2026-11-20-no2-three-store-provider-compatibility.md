# Νο02 — Three-store supplier PDF compatibility audit / BEFORE SOURCE

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
