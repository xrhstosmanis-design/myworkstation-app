# FTEXT-STATUS-ORPHAN-01 — CMD option 9 source and CI checkpoint (2026-11-08)

Owner: retained FTEXT recovery owner; draft PR #3724. Branch: fix/ftext-cmd9-status-recovery-20261108.
Status: DRAFT / NOT INSTALLED / PHYSICAL NOT TESTED. Production store operation previously restored by operator-supervised original STATUS isolation; do not replay sales.

Scope: add option 9 to existing CMD setup menu (Setup.ps1), guarded orphan STATUS isolation in Ftext.psm1 and isolated Windows/installer smoke regression. Existing options 1-8 and payment/CARD/VOID/server fiscal behavior unchanged. Do not merge or deploy without separate owner authorization.

First CI source head 8c6f8db79fd1ab0c64c63f488fa208031e7a6b9f failed Windows status-foundation because PowerShell parse encountered malformed newly inserted source; build-and-test failed checkpoint policy because ACTIVE_WORK_2026.md and new CHECKPOINTS/CHANGES file were missing. Correct both without relaxing validators or modifying long historical registries.

Required remaining gates: actual Windows PowerShell 5.1 script parser and all FTEXT tests, complete full PR CI and independent review. Verify STATUS-only, exact preserved bytes, pending/res/foreign/late/fiscal/collision/dual-owner cases and successful cloud acknowledgement. Physical on-PC installation and uptime measurement remain OPEN. Release must retain existing original payment and receipt evidence and fail closed on ambiguity.

## 2026-11-08 — native option 2/9 lock test repair, CI retrigger

The Windows status-foundation run for source 416a9fcd failed AFTER reporting `PASS CMD option 9 blocks concurrent option 2 STATUS without changing input`: the added test left its Read-Host input stub active for the existing bad-installer rejection fixture, which then raised `Unexpected menu prompt`. The test restores the original option-4 stub after the concurrency fixture in source 0b428865; source code/financial/fiscal behavior is not changed by this fix. This note triggers a fresh PR validation after branch-only reconciliation with current main. No CI PASS is claimed before its exact new head checks finish; no merge, deploy, Windows installer update or physical sale is authorized.

## 08/11/2026 — authorized merge gate, documentation #3721 complete

Documentation claim PR #3721 was merged as 14422e62 after its five checks passed. Owner explicitly approved reconciliation, required verification and merge of PR #3724, **not** physical installation. Previous source d6fc79589918a4cc0d853b115b0c602cfac0622b passed six/ six CI checks including native Windows status-foundation and complete build-and-test. Current branch reconciliation imports only newer main work and updates this scoped checkpoint; full exact-head CI must pass again before merge. No real fiscal/financial operation, vendor update, file replay, readiness relaxation or on-PC installation. Physical acceptance remains OPEN.
