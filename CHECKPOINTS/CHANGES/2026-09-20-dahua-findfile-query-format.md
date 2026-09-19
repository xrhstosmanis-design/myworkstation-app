# 2026-09-20 — Dahua findFile query format — AWAITING LAB

LAB stage diagnostics isolated the clip failure to FIND_FILE. The successful manual 4KS3 request used Dahua's accepted timestamp query form with spaces encoded as %20 while preserving date/time punctuation. The connector previously used Uri.EscapeDataString, which percent-encoded colons and did not match the verified request. Connector now emits the verified timestamp encoding and keeps condition.Types[0]=dav.

Gate: CI green → merge → replace LAB connector → real event clip → expect FIND_FILE pass; continue through FIND_NEXT/LOAD_FILE/MP4.
