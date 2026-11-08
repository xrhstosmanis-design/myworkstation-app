# FTEXT-STATUS-ORPHAN-01 — CMD option 9 source and CI checkpoint (2026-11-08)

Owner: retained FTEXT recovery owner; draft PR #3724. Branch: fix/ftext-cmd9-status-recovery-20261108.
Status: DRAFT / NOT INSTALLED / PHYSICAL NOT TESTED. Production store operation previously restored by operator-supervised original STATUS isolation; do not replay sales.

Scope: add option 9 to existing CMD setup menu (Setup.ps1), guarded orphan STATUS isolation in Ftext.psm1 and isolated Windows/installer smoke regression. Existing options 1-8 and payment/CARD/VOID/server fiscal behavior unchanged. Do not merge or deploy without separate owner authorization.

First CI source head 8c6f8db79fd1ab0c64c63f488fa208031e7a6b9f failed Windows status-foundation because PowerShell parse encountered malformed newly inserted source; build-and-test failed checkpoint policy because ACTIVE_WORK_2026.md and new CHECKPOINTS/CHANGES file were missing. Correct both without relaxing validators or modifying long historical registries.

Required remaining gates: actual Windows PowerShell 5.1 script parser and all FTEXT tests, complete full PR CI and independent review. Verify STATUS-only, exact preserved bytes, pending/res/foreign/late/fiscal/collision/dual-owner cases and successful cloud acknowledgement. Physical on-PC installation and uptime measurement remain OPEN. Release must retain existing original payment and receipt evidence and fail closed on ambiguity.
