# 2026-09-20 — Video command stale-claim requeue — AWAITING LAB

LAB showed the UI could wait for a clip while the live connector reported commands=0. Root cause: enqueueVideoCommand reused any unexpired CLAIMED command for the same VideoOperationalEvent, even when that claim belonged to an earlier failed/timed-out connector attempt. A CLAIMED command older than 90 seconds is now marked FAILED with STALE_CLAIM_REQUEUED and a fresh command is inserted. Fresh PENDING commands and actively claimed (<90s) commands remain idempotent.

Gate: CI green → merge → retry same event → connector heartbeat commands=1 → Dahua clip pipeline.
