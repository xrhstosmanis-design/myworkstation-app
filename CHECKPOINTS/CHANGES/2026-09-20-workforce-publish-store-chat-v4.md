# 2026-09-20 — Workforce schedule publish → Store Chat v4 — AWAITING LAB

When an already validated APPROVED schedule transitions to PUBLISHED, the same transaction creates one idempotent important SHIFT message in the selected store's existing Store Chat. It contains period and assigned employee/shift lines. No message is sent for DRAFT/PREVIEWED/APPROVED. Email remains separate until a configured mail provider is verified.
