# 2026-09-19 — Windows Video Connector parser hotfix — AWAITING LAB

LAB installation exposed PowerShell parser corruption in VideoConnector.ps1 around the Dahua mediaFileFind CLIP flow. Rebuilt the CLIP block, removed duplicated/corrupted tail, retained read-only/outbound-only behavior, mediaFileFind recording check, bounded DAV retrieval and ffmpeg MP4 conversion.

Gate: CI green → merge → replace LAB VideoConnector.ps1 → visible one-shot/manual run → connector ONLINE → real health/snapshot/clip test.
