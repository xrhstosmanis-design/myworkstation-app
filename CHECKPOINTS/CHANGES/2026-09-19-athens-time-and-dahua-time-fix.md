# 2026-09-19 — Athens display time + Dahua time parser — AWAITING LAB

- Purchase-order/OCR timestamps explicitly render in Europe/Athens rather than inheriting browser/server ambiguity.
- Platform audit timestamps explicitly render in Europe/Athens.
- Dahua connector accepts the verified 4KS3 current-time response form: result=YYYY-MM-DD HH:mm:ss, in addition to legacy time/result.time forms.
- Database timestamps remain UTC; no fixed +3 offset is stored, preserving DST correctness.

Gate: CI green → merge → LAB verify 22:10 display vs 19:10 raw UTC case → replace connector script → -Once → NVR time available → ONLINE.
