# 2026-09-20 — Super Admin Video Connector installer — AWAITING LAB

Adds a BackOffice/Super Admin action to generate a store-scoped Video Connector installer download. The backend creates a one-hour pairing code and serves a Windows CMD bootstrap that downloads the pinned LAB-PASS connector package from commit 3b87f976, then launches the existing protected installer. This avoids relying on mutable/cached main for store installations.

Separate installer and Super Admin PDF guides were generated for operational handoff.

Gate: CI green → merge/deploy → LAB download button → clean-PC installer validation.
