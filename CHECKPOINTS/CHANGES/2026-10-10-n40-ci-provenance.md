# N40 CI provenance investigation — OPEN / NOT MERGED

Same logical owner `codex/n40-full-twin-navigation-audit-20261010`; PR #2065, source branch `fix/n40-twin-navigation-20261010`. User explicitly requested continuation. This supplements the final-review checkpoint; it does not supersede any accepted visual phase or another owner's scope.

## Observed blocker

Normal CI 38043352112 on source 545be5c5701c4a5019dd07e13adb0ac40c287604 failed its server tests (reported 2089 PASS, 1 FAIL, 4 SKIP); remaining build/invariants/HTTP E2E were not completed. The reported phase14 Stock assertion at line192 is absent from the 158-line test returned for both exact source and merge commit. No causal conclusion or PASS is inferred.

The classify-changes job 114187856921 checkout log identifies merge f13f4f9a44ea459ed671bb8ad199188b94ff1d39, with parents eb805e79bbbad949dc88276c88f51db9801a3302 and 545be5c5701c4a5019dd07e13adb0ac40c287604. Git commit metadata independently confirms both parents and tree 3e8a2d47f9c3a8088024651f24d6c3d946b4bbfc. The event's BASE_SHA was 0050ae16e9014df756bffd168b397e385b69dab7. This identifies the actual merge base but does not by itself explain the discrepancy: the exact merge and eb805 test reads still return blob fb4c693f895ddbfff80378977ea3958ed31ed737.

Latest main observed a90bfd3ce242b68d130250546bd761c87799f4ee includes other owners' work. No force merge, overwrite or rollback is authorized by this investigation.

## Bounded diagnostic plan / LOW operational risk

A temporary branch-only workflow may read the exact historical checkout and failing job log, record test/source hashes before and after normal server preparation/tests, and export repository-source-only archives for review. It uses contents:read and actions:read, no deployment, production/LAB credentials, database connection, API/business/device command, upstream git write, secrets export or runtime application changes. Any merge simulation is disposable and local to that isolated runner. Existing CI, tests, Windows and release gates are unchanged. Remove the temporary diagnostic workflow before final normal CI/release.

Preserve central and scoped Workforce entry, all six selected-store transitions, invalidation/return behavior, existing Stock support exchange, tenant/auth/module boundaries and visual phases1–14. No test may be deleted, weakened or skipped to clear this blocker. After a demonstrated correction/reconciliation, require final exact-head full normal CI before any merge, then verify the deployed revision before authenticated virtual-LAB navigation.

Overall No40 OPEN. Existing focused synthetic results remain historical; actual six-tile LAB and real Stock return remain NOT TESTED. No manual PASS or business mutation. Central tracker/active/pending owner remains unchanged; central PDF synchronization remains pending with final publication.
