# Assistant history integration readiness

Status: native storage/access source PR2843 is merged with full PR/main3402/0/0; optional API/UI integration is under review under claim PR2840 and exact native dependency amendment PR2846. Activation defaults OFF. No production schema provisioning, background cleanup or lifecycle catalogue rollout has occurred. Retained VOICE owner: `codex/assistant-business-queries-20261015`. Existing foundation: PR2828, checkpoint `CHECKPOINTS/CHANGES/2026-10-19-assistant-history-foundation.md`. Exact generation compatibility correction: PR2836. Whole VOICE remains OPEN.

## Native access and lifecycle boundary

Use the existing native Platform/Owner authorizers, not a new token format or an inference from paid modules. Require a real active personal session, exact selected active company/store and the relevant current entitlement. Support preview and all-store history need separate acceptance; do not silently select one store for them.

Read the existing lifecycle generation as its canonical int64 string. Revalidate native identity, session version, scope, generation and capabilities across archive waits. A history write must also take the existing lifecycle mutation/shared-fence check inside its own transaction; a status read outside the transaction does not replace the fence. Maintenance, retirement, old generations and changed native access fail closed. This requires a new bounded claim before editing the repository or mounting an adapter.

For Owner, reuse `authorizeOwnerAssistant` with base assistant access and the actual relevant module checks; STAFF additionally reuses the existing personnel package authorization. A generic `business_records` capability is insufficient: require the individual domain, such as `business_records:BANK_MOVEMENTS`. Platform authorization remains native central Super Admin authorization, with an explicit selected pair and no support-context fallback.

## Table contract proposed for lifecycle review

The current repository expects `AssistantHistoryArchive` with `scopeKey`, `revision`, `payload`, `requestId`, `digest` and `expiresAt`. Its SQL intentionally creates no table. Before provisioning a real table, extend the reviewed contract to include explicit physical `actorId`, `mode`, `companyId`, `storeId` and exact BIGINT `generation` columns, bound from server-derived access, not the browser. Keep `scopeKey` consistent with that exact tuple. Revision remains an optimistic counter independent of the store generation.

Review the actual foreign keys, primary key, indexes, reset ownership, delete ownership and encrypted recovery/restore coverage with the retained store-lifecycle owner (`feat/store-shifts-inventory-clear-20261018`). The static reviewed catalogue is `ops/backup/lifecycle/manifest.json`; the current lifecycle implementation checks the real table/column catalogue. A new unreviewed table must not be provisioned as a shortcut. The archive is selected-store data to remove on a fresh-store reset, while sibling stores and other actors remain controls. Clarify how protected base User/Store records and archive references behave during deletion and restoration.

Provide an explicit idempotent provisioning artifact and test it only in an isolated database before any production activation. No request-time DDL. A missing table returns authenticated history-unavailable status; it does not weaken a guard, substitute another store, or report an empty persisted history as success.

## API and turn capture

- Add purpose-bound selected-store history retrieval and explicit empty reset under the existing native assistant routers, with strict request bodies and current authorization. A future route claim must name the exact router regions.
- Keep the existing assistant request compatible when conversation persistence metadata is absent. Once enabled, resolve the actor's stored thread/revision on the server before running the report; never accept a browser-supplied answer as an authoritative persisted assistant response.
- Capture the final checked answer and the original user question on the server. Derive archived requirements from the actual executed `reads` log already returned by the dispatcher, using `parseAssistantSourceRead`; map each business domain separately. Do not modify the delegated dispatcher or infer rights from answer text.
- Store only bounded safe question/answer prose, IDs, timestamps and requirements. The existing archive contract rejects structured evidence, credentials, tickets, file bytes, attachments and provider internals. If a safe bounded text projection cannot be produced, report that the turn was not archived instead of silently truncating financial evidence.
- Preserve the existing canonical report answer and native final verification. An archive version conflict may yield a visible not-saved status with the already verified answer; it must not automatically replay the provider, report, payment, export or entire question. Current-access or lifecycle loss must withhold the private response.
- Separate archive idempotency from report/export idempotency. The same request UUID cannot mean a different write, and an old revision cannot restore removed text.

## UI behavior

Load saved conversations only after authenticated history availability is confirmed for the exact current binding. Maintain the existing in-session flow when history is unavailable, with an accurate session-only label. Aborted or late loads cannot replace a conversation that the user started or a newly selected store/session.

Restore archived prose with its original timestamp and a clear historical-answer label. Restored messages contain no export ticket or canonical evidence object, so the UI must not recreate old download buttons or present old amounts as a fresh report. A new question uses fresh authorized sources and current export authorization. Do not automatically reinterpret an old relative date as a report for the original calendar day.

Keep new/select/close/reopen behavior, eight threads/forty messages, IME, Enter/Shift+Enter, cancellation, selected-store resets and existing Owner export limits. Persistent filename/file-byte lists and uploads remain separate scope. Native Android's distinct assistant/chat scope stays with its retained owner.

## Expiry and physical cleanup

The foundation has a fixed 30-day visibility deadline from archive creation/reset. It is not a physical-erasure implementation or an unlimited retention promise. The UI must state the applicable retention limit. Expired archive reads contain no old text; explicit reset advances revision and empties the payload.

Physical cleanup must remove expired text without making an old retry eligible as a new archive. Preserve the minimum revision/request tombstone needed to fence stale operations, or implement a separately reviewed archive-epoch protocol. Schedule/invoke cleanup through an explicitly claimed existing service lifecycle; do not add an uncontrolled production timer. Coordinate reset, deletion, encrypted recovery and backup retention with the lifecycle owner before activation.

## Evidence required before activation

Isolated native HTTP/session tests must cover both personal roles, explicit store/company, module/personnel revocation, exact int64 generation, maintenance/reset races, missing schema, stale revisions, idempotent retry, expiry and cleanup/restore. Mounted UI tests must cover delayed loads after user interaction/scope/session changes, historical labeling, absence of restored export tickets, and no silent downgrade from persisted to session-only success. Existing accepted report/export/manual behavior remains protected.

Require full PR/main CI, reviewed schema/lifecycle integration and the ordinary guarded exact release before grouped normal-app acceptance. CI is not LAB or numerical reconciliation. Keep the owner's read-only business boundary and do not repeat accepted transactions for evidence. No new live acceptance, schema inventory result, transfer of another owner's scope or deployment is claimed here.

## Narrow ownership request prepared for the owner

Required named handoff: from `feat/store-shifts-inventory-clear-20261018` to `codex/assistant-business-queries-20261015`, ONLY the `AssistantHistoryArchive` additions in `ops/backup/lifecycle/manifest.json` and any corresponding new history-column entries in `ops/backup/lifecycle/column-review.json`. Other lifecycle tables, policies, execution/recovery engine, jobs, physical connector/spool work and accepted tests stay with their existing owner. New history-specific regression tests belong to this VOICE scope; historical production schema evidence must not be rewritten as if a proposed table already existed.

Proposed logical manifest row for review, not an applied patch:

```json
{"name":"AssistantHistoryArchive","owner":{"kind":"DIRECT"},"reset":"REMOVE"}
```

The proposed physical archive columns are `scopeKey` text primary key; `actorId`, `mode`, `companyId`, `storeId` text; exact `generation` BIGINT; independent `revision` BIGINT; `payload` JSONB; `requestId`/`digest` text; and `expiresAt` timestamptz. Native server-derived scope must bind the physical ownership fields consistently with the scope key. Final foreign keys, safe native lifecycle fencing, index/check definitions, nullability and physical retention/recovery semantics must be verified in an isolated schema and reconciled with the actual catalogue before activation.

This document requests no production cleanup, restore, SQL execution or permission change. The owner explicitly accepted the narrow handoff at19Oct2026 15:21:12Athens; PR2840 published and merged the named transfer before source. Those two catalogue files remain unchanged pending coordinated provisioning and guard/plan rollout. All other lifecycle work retains its existing owner.

## Current optional transport boundary

A history load returns the native canonical int64 generation. Conversation/reset metadata must echo that generation; a different current store generation refuses before report/provider work. This is a stale-request fence, never browser authority. All in-transaction native rechecks must use the same Prisma transaction, including the original company-license helper. Historic display is separate from current Athens-day dialogue context. Activation remains off until the table, reviewed catalogue, installed guards/worker/recovery and inactive-archive/backup retention are complete; no manual production SQL or new timer is authorized by this document.
