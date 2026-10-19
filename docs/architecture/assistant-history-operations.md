# Assistant history retention operations

This module runs on the existing backup service's five-minute schedule, after
the original full-backup slot (when due) and lifecycle worker. It adds no service,
timer, bucket, credential or lifecycle reset authority.

## Activation sequence

1. Require exact green PR/main full CI and the ordinary guarded application
   release containing the reviewed provisioning helper and catalogue additions.
2. Confirm `ASSISTANT_HISTORY_PROVISION` reports `available:true` and inspect the
   actual archive columns/index. An incompatible existing schema/enrolled plan
   is refused without repair, plan migration or interruption of POS startup.
3. Set only `ASSISTANT_HISTORY_CLEANUP_ENABLED=true` on the existing backup
   service, using a merging configuration operation. Preserve every other key.
   Verify its compatible image release and a scheduled `COMPLETED` cleanup.
4. Confirm a fresh `assistant-history-cleanup` runtime pulse for the current
   manifest/revision. The application independently verifies its HMAC using the
   existing monitor secret; the raw key must never be read or copied for checks.
5. Enable only `ASSISTANT_HISTORY_ENABLED=true` after that proof. Keep the
   reviewed configuration and actual runtime setting consistent, then use the
   ordinary exact guarded release rather than a manual deployment bypass.
6. Perform grouped selected-store, personal Owner and Super Admin acceptance.
   CI, schema metadata and a reported pulse alone are not a live chat PASS.

## Retention and recovery

Thirty days is the archive visibility deadline measured from creation/reset,
not an activity-based extension. Scheduled cleanup empties at most 256 expired
payloads per transaction. Busy rows are skipped; maintenance, retirement and
incompatible scope are deferred. This bounded job is not a fixed physical-erasure
SLA. Revision, request identity, digest, expiry and original physical generation
remain as stale-retry tombstones; cleanup does not delete or relabel rows.

Encrypted full backups retain their existing storage/retention policy unchanged.
Do not promise that historical full-backup bytes disappear after thirty days.
Restoring an expired archive cannot make it current: authorized reads hide and
empty expired prose, and the scheduled job empties it again without allowing an
old request to recreate removed text. Existing exact encrypted restore/reset
tests remain required alongside the new native provisioning/cleanup tests.

## Diagnostics and withdrawal

`ASSISTANT_HISTORY_CLEANUP` reports only state, bounded counters and redacted
failure codes. SQLSTATE diagnostics contain no SQL, prose, IDs or credentials.
The PostgreSQL password is passed through the child environment, never arguments.
No successful signed pulse is published for a missing schema, failed SQL or
failed pulse write. A missing, stale (over twelve minutes), tampered or wrong-plan
pulse makes native persistence unavailable. Existing session-only questions can
continue after the UI refreshes availability; failed questions are not replayed.

Investigate worker/configuration/storage failures before re-enabling persistence.
Do not bypass readiness or lifecycle guards, manually delete tombstones, or
rewrite an enrolled plan. To withdraw persistence, disable only its web flag and
apply the ordinary configuration release. Retain the reviewed table/catalogue
and cleanup: dropping them would invalidate the lifecycle inventory and recovery
contract. Production business acceptance remains read-only.
