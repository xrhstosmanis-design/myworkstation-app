# 2026-09-19 — Backoffice Cameras / Video Audit manager — AWAITING LAB

- Moves normal store Video Audit operations into Backoffice → Commercial operation → Cameras / Video Audit.
- Owner/Admin only; requires active VIDEO_EVENTS module and store tenancy.
- Shows connector status and protected NVR configuration summary without exposing NVR password.
- Creates a one-time 15-minute Video Connector pairing code for the selected store.
- Shows and saves camera-to-zone mappings.
- Super Admin technical screen remains available for technical oversight/configuration.
- LAB-first; no production store configuration changed.

Gate: CI green → merge/deploy → generate LAB pairing code → complete Windows connector install → ONLINE → real Dahua test/snapshot → historical Audit clip.
