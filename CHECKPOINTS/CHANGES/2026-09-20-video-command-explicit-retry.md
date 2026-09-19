# 2026-09-20 — Explicit Video command retry after CLAIMED — AWAITING LAB

LAB now has a parser-clean, continuously Running/ONLINE connector, yet opening the same Video event yields UI timeout while every heartbeat reports commands=0. The enqueue service still reuses a CLAIMED command for 90 seconds. For an explicit user retry of the event context this can point the UI at a command already consumed by an earlier connector attempt, so no new PENDING work exists. Changed enqueue behavior: PENDING remains idempotent, but any existing CLAIMED command for an explicit retry is closed as CLAIM_REPLACED_BY_USER_RETRY and a fresh PENDING command is inserted.

Gate: CI green → merge/deploy → open same event once → connector heartbeat commands=1 → observe Dahua pipeline result.
