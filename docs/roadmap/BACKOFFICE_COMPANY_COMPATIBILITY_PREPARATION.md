# Company read authority: inactive compatibility preparation

> 18/11/2026 follow-on source candidate: the separate signed installation-backup protocol, explicit unmounted installer, paired opt-in app/worker selectors and initial company account/read UI are now implemented in this branch. They supersede the preparation-only statements below as a description of available source. No production migration/profile activation or hosted acceptance has occurred. See BACKOFFICE_COMPANY_INSTALLATION_BACKUP_PROTOCOL.md and CHECKPOINTS/CHANGES/2026-11-18-no5-company-authority-candidate.md. The packet now binds eighteen exact guard/profile/installer/observer source files; BASE/CAPTURE plan hashes and the one-column proposal remain unchanged.

Status at initial preparation: PROPOSAL ONLY. No schema, runtime profile, account policy, worker selector or route admission is changed. The existing 52 STORE capabilities remain independent. This preparation follows BACKOFFICE_COMPANY_AUTHORITY_COMPATIBILITY.md and does not satisfy production activation or hosted acceptance.

## Exact proposed delta

The small packet `ops/backup/lifecycle/backoffice-company-compatibility.proposed.json` binds exact byte hashes for both existing manifests, their column reviews and current app/worker guard sources. `buildBackofficeCompanyProposal` deterministically generates full proposed documents in memory. The only manifest differences are its explicit proposed profile id, a ninth Account column `companyCapabilities jsonb NOT NULL`, and its reviewed JSON column entry. The column's intended default is an empty JSON array; existing and new accounts receive no company authority automatically. Schema default/constraint evidence must be collected separately: the existing lifecycle column triples do not encode defaults.

Company policy belongs to COMPANY SECURITY, never to a store. Account remains absent from store ownership nodes. No store ownership descriptor, deletion selector, reset rule, recovery payload or monthly inventory capability changes. Store grants remain retained as before. No JSON contents become ownership selectors.

| Proposal | Existing runtime profile | Existing plan hash | Proposed plan hash |
|---|---|---|---|
| BASE | BASE | ba554503bbb839524a1217af0149a6bf86b11384cb2dcb1bfc41d75a6d4290d4 | 87531261fbaaed42f2a25282042cd8f817c5991a0aa9e62bef1f1c92f727a20f |
| CAPTURE | MONTHLY_INVENTORY_CAPTURE_V1 | 59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2 | 8b298f318699a72d4b88b077d309953b9dc5f014f6f2ee763600103d0df93d95 |

Plan hashes use the native JSON.stringify SHA-256 convention. Byte hashes and generated review hashes are recorded in the packet; these are distinct from plan hashes. Current event-report profile compositions are deliberately not prepared by this packet. A runtime using either event-report profile cannot use a BASE/CAPTURE proposal as a substitute; its composed manifest needs a separate exact review first.

## App / worker / installed profile matrix

| App manifest | Worker manifest | Installed guards/schema | Result |
|---|---|---|---|
| Existing | Existing, identical plan | Existing exact eight-column Account | Existing behavior only |
| Proposed | Proposed, identical plan | Reviewed matching guards and exact nine-column Account | Offline-compatible candidate; not activation authority |
| Proposed | Existing | Either | Refuse |
| Existing | Proposed | Either | Refuse |
| Matching plans | Matching plans | Different installed plan or unexpected Account shape | Refuse |
| BASE | CAPTURE or event-report composition | Either | Refuse |

The current signed worker heartbeat binds manifestHash, workerRevision, row-digest format, storage verification and freshness. It does not itself inspect the new Account column or authorize migration. Native schema auditing and exact installed guards must remain mandatory alongside this heartbeat. The offline compatibility predicate checks exact ordered Account column triplets and matching plan hashes, not actual database state or HMAC credentials.

## Preflight and controlled transition plan

1. Capture actual runtime app/worker revisions, selected profile, installed manifest/guard hashes, full schema signature, Account column types/nullability/defaults/constraints, and active lifecycle fences/operations. Refuse a stale packet or unprepared profile. Verify immutable backup and full/selective recovery of the current schema first.
2. Drain all nonfinal lifecycle operations and recovery leases; prevent new lifecycle work during the transition using the native maintenance mechanism. Preserve existing leases/fences and never rewrite their plan hashes. Verify no old operations can be replayed against a new plan.
3. Review an explicit installer transaction and matching app/worker/profile release before writing schema. That future installer must verify live authorized installer identity, expected schema/plan/guard hashes and empty initial policies; it must not run from API reads, startup bootstrap, environment default or this offline verifier.
4. Install the reviewed empty-default column and regenerated guards only under the reviewed transition. Deploy the paired app and worker for the exact prepared profile, verify fresh signed worker capability with the new plan and perform actual schema/default/guard readback. Continue to refuse lifecycle execution until this evidence agrees.
5. Exercise isolated old/new mismatches, backup/restore, STORE reset/delete retention, account revision races and live company-grant revocation. Separately install company authorization routes only when native grant persistence/readback works. Record source CI separately from hosted acceptance. Reopen lifecycle work only after the exact pair is verified.

No migration/installer is supplied here. No current runtime selector recognizes the proposed profile ids. Preparation success must never be reported as a production migration or company permission being enabled.

## Rollback plan

Before column activation, revert only proposed code/artifacts; installed behavior is unchanged. After a future activation, stop company reads, drain nonfinal lifecycle work and explicitly revoke company policies and sessions using the reviewed security workflow, preserving immutable audit evidence. A destructive schema rollback is forbidden while any company policy is nonempty. Do not silently discard grants to make rollback pass.

Require verified backup, zero nonfinal operations, zero nonempty company policies and confirmed session revocation. Restore the reviewed old app/worker/profile/guards as a coordinated pair and verify the old exact eight-column schema before resuming lifecycle work. If these conditions cannot be met, retain the column and fail closed pending a forward repair. `assertBackofficeCompanyRollback` validates only supplied evidence fields; it performs no database observation or rollback.

## Later foundation implementation contract

Use a separate shared `staffCompanyCapabilities` allowlist initially containing stores.read, suppliers.read and customers.read. STORE presets and grants never imply these keys. Native account creation defaults to none; legacy update omission preserves policy, explicit empty array revokes it. Company policy changes share account expectedRevision fencing, session-version increment, session revocation and before/after security audit. Require a live Owner for explicit company policy changes while preserving the existing Store-only Super Admin path.

Return companyCapabilities independently in admin readback and `/me`, with native Account revision. Require `x-backoffice-company-id` equal to the live account company; reject store headers and conflicting selectors. Use a distinct company-grant context and fresh account/session/company/license/grant checks before and after each precise native GET. Keep initial list fields and module contracts in BACKOFFICE_COMPANY_READ_UI_CONTRACT.md. No company capability authorizes platform administration, writes, a foreign company or personal monthly capture enrollment.

## Observed runtime baseline — 18 November 2026

Read-only metadata observed before any activation: production app and backup cron both report revision `a7bb1c4c00662118dc0c5e794172ca6e3817b0d2`. The Account has exactly the existing eight columns, without companyCapabilities. The recovery heartbeat at `2026-11-18T07:50:37.287272Z` reports plan `59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2`, matching the current MONTHLY_INVENTORY_CAPTURE_V1 document, storagePolicyVerified=true and MWS_ROW_MULTISET_SHA256_V1. There were no lifecycle execution rows and zero maintenance fences at that observation. These are point-in-time metadata, not HMAC validation or a transition lease.

The latest backup reports SUCCEEDED / dryRunStatus PASSED, completed `2026-11-18T06:02:26Z`, at the same application revision, with no errorCode. The database catalogue contains 388 lifecycle-named functions and 388 lifecycle-named triggers. Counts and backup status do not prove expected guard definition hashes, immutable storage or the proposed schema's restore acceptance. Exact installed guard comparison and fresh drain/readback remain required before a future transition. No database, service setting, deployment or worker activation was changed during this inspection.
