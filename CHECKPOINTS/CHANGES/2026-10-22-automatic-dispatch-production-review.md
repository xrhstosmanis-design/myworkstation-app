# Automatic report dispatch — concrete retained-owner production review request

22/10/2026 continuation: independent module-writer claim #3042 passed CI39818097726 and merged0c0d8594 before implementation. That bounded four-file source fix is prepared separately; it does not resolve or approve the production contract below. The retained lifecycle review request is published at #2833/comment6346383862, coordinated in #2704/comment6346350235. Final real delivery testing remains blocked until these actual production prerequisites are resolved.

Status: **PROPOSED / NOT APPROVED DDL / DISPATCH OFF**. Read-only design review of
source `4906f35ef50a3d0194e6e7eb1a7b12d2bb701bf3`, contract
`#2704/comment6318978275` and follow-up `#2704/comment6344797233`. No source,
schema, enrollment, consent, configuration, production or transport change was
performed. This request does not claim that the retained owner has agreed.

Requested reviewer/implementation owner for the occupied lifecycle/backup
contract: **`feat/store-shifts-inventory-clear-20261018`**. Central receiver
`codex/central-auto-dispatch-20261022` retains its independently assigned delivery
code. Root must publish any named receiving handoff and exact path claim before
another page changes the retained owner's files.

## Existing contracts to preserve

`automatic-report-delivery-repository.js` expects exactly seven slot projection
columns: slotId/companyId/storeId/version/status/token/record. It reconciles each
stored JSON record with core validation and those projections. The stable slot
identity hashes company/store/report/frequency/period/canonical recipient,
excluding mutable hashes and versions. Editing settings or a payload must not
create a new automatic-send right for the same logical slot.

`automatic-report-delivery-lifecycle.js` permits only
PENDING/CLAIMED/ATTEMPTING/ACCEPTED/UNKNOWN. Snapshot fields are settingsVersion,
recipientVersion, consentRevision, lifecycleGeneration, sourceFingerprint,
payloadFingerprint, policyFingerprint, principalId, financialFinality and
financialReconciliationComplete. Safe counter versions are integers no greater
than9007199254740991. Lifecycle generation is separately a canonical decimal
string covering PostgreSQL int64, including0; it must never pass through a lossy
Number conversion or be upgraded from a stale request/job.

`automatic-report-cash-payload.js` binds exact company/store, closed period,
settings/source and disclosures into immutable UTF8 JSON, maximum2097152bytes,
contentType `application/json; charset=utf-8`, SHA256 over the exact body.
Financial finality remains PROVISIONAL with reconciliation=false.

SMTP may run only after ATTEMPTING has committed and outside the database
transaction. Revocation before that boundary must prevent start. The system
cannot promise cancellation of already-started external I/O after it. Timeout,
partial/missing/contradictory acceptance evidence and uncertain completion commit
remain UNKNOWN/no automatic resend; ACCEPTED means SMTP acceptance, not inbox
delivery. The already installed dormant driver does not supply schema,
verification, consent, scheduler, restore suppression or runtime authorization.

## Six-table physical contract submitted for explicit review

These names/columns are a proposal, not an instruction to provision them. Exact
SQL types, constraint expressions, indexes, permissions and DDL owner need the
retained owner's review and native tests. No cascading deletion may erase
suppression evidence. Existing Store has no(companyId,id)unique constraint;
do not silently add it to support a proposed composite FK. The existing Store
parent-lock/selected-company validation protocol remains mandatory even if new
table FKs are adopted.

| Proposed table | Columns and constraints for review |
| --- | --- |
| AutomaticReportDispatchPolicy | Composite PK(companyId,storeId,reportType); reportType=CASH; monotonic revision BIGINT1..9007199254740991; dispatchEnabled BOOLEAN DEFAULT false; allowsProvisional BOOLEAN DEFAULT false; allowedFrequencies restricted to DAILY/WEEKLY/MONTHLY, initially empty; lifecycleGeneration BIGINT>=0 with int64 string handling; updatedBy TEXT, updatedAt TIMESTAMPTZ. Policy fingerprint must bind every authorization-relevant field and the reviewed restore barrier. |
| AutomaticReportRecipient | Immutable recipientId PK; companyId/storeId; canonical single email <=254bytes, unique(companyId,storeId,email); monotonic version BIGINT1..9007199254740991; initially unverified state; verifiedAt/verifiedBy/revokedAt; created/updated actor/time. A changed email increments version and atomically clears verification and consent. ResponsibleEmail or old recipient configuration supplies no consent. Delete/re-add must not reuse an old authorization revision. |
| AutomaticReportRecipientConsent | Exact company/store/recipient binding with a reviewed composite key/FK to the new recipient table; monotonic revision BIGINT1..9007199254740991; accepted recipientVersion; active BOOLEAN DEFAULT false; restricted allowedFrequencies; consentedBy/consentedAt/revokedBy/revokedAt; lifecycleGeneration. Same-transaction locked checks must prove the exact recipient version is currently verified; verification alone never grants consent. |
| AutomaticReportPayload | Immutable scoped payload identity; companyId/storeId/frequency/periodFrom/periodTo; positive settingsVersion; sourceFingerprint and payloadFingerprint as lowercase SHA256; fixed contentType; exact payload BYTEA and byteLength1..2097152; createdAt and separately reviewed expiration metadata. Require byteLength=octet_length(bytes), exact SHA256 agreement and scope/period/metadata consistency. Same identity with different bytes must refuse, never overwrite. No retention duration is selected here. |
| AutomaticReportDeliverySlot | Preserve current slotId TEXT PRIMARY KEY; companyId TEXT NOT NULL; storeId TEXT NOT NULL; version BIGINT NOT NULL CHECK1..9007199254740991; status TEXT NOT NULL restricted to PENDING/CLAIMED/ATTEMPTING/ACCEPTED/UNKNOWN; token TEXT nullable; record JSONB NOT NULL. Review additional JSON/projection checks, immutable identity rules and indexes without breaking the repository's exact record shape. |
| AutomaticReportDeliverySuppression | Separate minimal evidence proposed: slotId PK, companyId/storeId, originating lifecycle generation, reason, attempt/evidence fingerprint, suppressedAt and explicitly reviewed retention marker. Keep no raw report body unless separately required. Avoid cascading FK to removable Store/recipient/payload. A surviving suppression record must deny new create/start even after detailed payload/slot expiry; review its reset/delete/restore classification explicitly. |

All stored permissions start OFF/unverified/no consent. Do not inherit
verification, consent or a service principal from report settings, archived
records, responsibleEmail or owner/admin status. Current source authorization
requires SuperAdmin; adding a service/Owner principal is a separate explicit
authorization decision. An update must revoke the old revision atomically,
using one reviewed lock order shared by readers and every real writer,
including the first INSERT/absent-row case.

## Current FRESH_STORE_KEEP contradiction

The source manifest currently enrolls only AutomaticReportSettings from these
report-related tables, with DIRECT ownership and reset=REMOVE. Future
slot/policy/recipient/consent/payload/suppression tables are not enrolled in its
knownTables/knownColumns/reviewedColumns contracts.

The current FRESH_STORE_V1 executor requires every non-FRESH_STORE_KEEP table to
be REMOVE. Simply adding a delivery node as KEEP therefore fails plan
validation. Adding it as REMOVE instead destroys ACCEPTED/UNKNOWN suppression
and can reopen an external-send right. StoreLifecycleTombstone protects deleted
relational references; it is not an SMTP-side-effect suppression ledger.

Request an explicit reviewed profile/category for retained minimal suppression,
with consistent capture, dependency order, generation fencing, delete/reset
rules, KEEP digests and reopen checks. Pending/claimed work may be discarded or
suppressed, and permissions may be removed/revoked, only if its originating
epoch can never regain start authorization. ATTEMPTING must be treated as
possibly sent. Accepted/unknown evidence cannot silently disappear. New-store
copy must not copy verified consent, enabled dispatch, pending jobs or old
payloads as authorization for a new store identity.

## Full restore cannot rely only on same-database evidence

A full database restore can roll back delivery slots, suppression rows,
consent revisions and the lifecycle fence together. An email accepted after the
archive was created can then disappear from every restored table. A same-DB
tombstone, incremented restored generation or fresh consent alone cannot prove
that the external email was never sent.

At least one complete approach requires explicit owner review:

1. **Non-restored cutoff plus restore-OFF barrier:** keep dispatch/transport OFF
   throughout restoration; restore archived permissions only as inactive,
   non-authoritative evidence. Use an independently reviewed, non-restored
   activation watermark that bars every historical period before the allowed
   post-restore boundary, including slots absent from the archive. No automatic
   backfill. Re-enable only after fresh authorization and explicit verification
   of the cutoff and source scope. Where/how that non-restored marker is stored
   must be specified; a marker inside the restored database alone is not this
   approach.
2. **External suppression authority:** retain authoritative attempt/suppression
   evidence outside the database rollback domain, reconcile it before any
   reactivation and fail closed if it is unavailable, stale or inconsistent.
   Specify its identity, atomic attempt boundary, credentials/permissions,
   recovery, retention and outage behavior. An eventually copied DB log is not
   automatically authoritative at the external-send boundary.

This request does not choose either approach or approve a retention duration.
Payload expiration may erase report bytes while retaining enough minimal
suppression evidence. Directly redacting the canonical current slot JSON would
break repository validation; any detailed-record compaction requires an atomic
reviewed transition to surviving suppression before removal. Expiry cannot
become permission to recreate the same logical slot.

The existing private forensic full/selective roundtrip may remain byte-exact
with no app/transport running. Operational restoration/reactivation and its
suppression barrier are a distinct phase, not a fabricated full-restore PASS.

## Exact occupied paths and required coordination

Retained owner `feat/store-shifts-inventory-clear-20261018` must review changes
to its applicable regions in:

- ops/backup/lifecycle/manifest.json
- ops/backup/lifecycle/column-review.json
- ops/backup/lifecycle/verify_restore.py
- ops/backup/lifecycle/worker.py
- server/src/services/store-lifecycle-policy.js
- server/src/services/store-lifecycle-executor.js
- server/src/services/store-lifecycle-application-links.js
- affected lifecycle controller/recovery/proof/stream tests and code
- server/scripts/store-lifecycle-verify-copy.py only if comparison semantics
  actually require a separately claimed change

Manifest work must include exact knownTables, knownColumns tuples
(name,type,notNull), JSON/bytea/actor/recipient/payload reference classifications
in reviewedColumns, explicit ownership and actual FK/application dependencies.
Do not use JSON contents or email/principal IDs to expand deletion ownership.
The current fail-closed schema catalogue must remain protected. The existing
history-cleanup prose policy is not delivery-evidence retention and must not be
repurposed. Wider backup credentials/schedule/storage owners remain retained.

Central delivery files and their existing owners must coordinate the trusted
eligibility reader, payload/slot/suppression persistence and locks; no new
schema helper may bootstrap DDL from a reader. Provisioning and activation
remain separate from source deployment.

## Isolated acceptance evidence required before production enrollment

- Real producer→immutable bytes→repository in one caller-owned snapshot;
  exact byte/hash/scope/settings/source/period tamper refusals.
- Native PostgreSQL schema and constraint tests, exact reviewed manifest and
  column catalogue agreement; foreign tenant/reference denial; no schema DDL
  from readers.
- Two-client create/start/revoke/reset, first-insert and reverse-lock tests;
  lifecycle before Store before policy/recipient/consent/payload before slot,
  using the agreed shared protocol. Preserve safe int64 epoch handling and
  refuse old/rolling writers rather than assuming compliance.
- Settings/email/verification/consent/module/principal/lifecycle changes before
  start deny transport; no permission upgraded from an old job or restored row.
- Crash before ATTEMPTING commit performs zero I/O. Lost commit proof performs
  no blind retry. Crash/timeout/ambiguous acceptance after start is UNKNOWN;
  accepted send followed by failed completion commit never authorizes resend.
- Reset/delete/new-store-copy preserve suppression semantics and do not copy or
  restore consent as fresh authorization. Retained evidence cannot be removed
  by FK cascade or payload expiration.
- Full and selective private restore tests include an archive taken BEFORE an
  independently recorded accepted/unknown attempt: restore cannot send that
  logical slot again, including when the old archive contains no slot. Prove
  the chosen external barrier/cutoff actually survives the rollback domain.
- Unknown/accepted payload compaction, retention boundaries, missing external
  suppression and reactivation failures remain fail-closed; assert exact
  unrelated-store/data controls.
- Full PR/main CI, independent review, ordinary exact deployment with dispatch
  OFF. Only then a separate controlled final test with an actually verified,
  consenting LAB recipient and fresh measured scope. No replay of accepted
  financial transactions or old email attempts for documentation.

## Independently actionable work versus real production gate

The two actual StorePaidModule UPSERT writers in
server/src/routes/platform-store-modules.js are a separately identified bounded
source opportunity under a new exact claim. Unmounted schema-contract validators
and isolated tests can also be prepared without DDL/runtime enrollment. These
are not blocked by waiting for production provisioning approval.

The occupied lifecycle/reset/retention/restore-suppression contract above must
be explicitly resolved and published before provisioning or ON. Final-test
readiness must not be claimed while those gates are absent. This document is a
concrete review request, not approval, handoff, schema installation, retention
decision or user consent.
