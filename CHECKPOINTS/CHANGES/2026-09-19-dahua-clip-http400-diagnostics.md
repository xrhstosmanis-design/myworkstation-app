# 2026-09-19 — Dahua clip HTTP 400 diagnostics — AWAITING LAB

LAB connector is ONLINE and receives real clip commands, but the NVR returns HTTP 400 during the clip pipeline. The connector now labels the failing Dahua stage (CREATE_SEARCH, FIND_FILE, FIND_NEXT, LOAD_FILE) and adds the verified DAV type filter to findFile, matching the successful manual mediaFileFind query used on this 4KS3 NVR.

Gate: CI green → merge → replace LAB script → retry one real event → inspect stage-specific result; if search passes, validate bounded loadfile and MP4 artifact.
