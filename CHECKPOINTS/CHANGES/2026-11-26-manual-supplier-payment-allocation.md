# 26/11/2026 — Manual supplier payment allocation

Issue #4232; refreshed draft PR #4272 replaces #4235. Owner approved central release after checks. Existing unallocated cash settlement only; authorized owner or super admin; preview version, scoped transaction, audit and no new cash or stock. Differences above EUR 1 are not applied in this initial version; bank payments excluded.

Previous head 6fad74af passed CI #11187 and isolated PostgreSQL authorization, preview, stale preview, rollback and replay protection test. Rebased head 2dd0ebd8 failed CI #11219 at documentation policy before build-and-test; wholesale LAB succeeded. This commit records the active list and checkpoint without bypassing policy. Fresh full CI and specific UI validation still required. No production deploy or mutation performed. HELL invoice 35375 is INVOICED/APPROVED; 90.17 existing payment still awaits allocation at last verified snapshot.

The owner store BackOffice uses OwnerPendingApprovals, a separate entry point from the central review. Both now use the same manual allocation form. The owner entry is restricted to the current store and excluded from delegated read-only approvals. A fresh browser acceptance and CI are required before production.

Manual allocation routes honor central Super Admin sessions with an OWNER token role and keep support sessions confined to their company and selected store.
