# 2026-09-20 — Remove remaining regex operators from Windows Video Connector — AWAITING LAB

LAB parser test on the commit-pinned script moved past Fail-Command and exposed additional Windows PowerShell parser failures at -notmatch/-match and another -replace. Removed regex operators from the connector's hot path: findFile OK is checked with Trim equality, found= is parsed line-by-line, numeric streamReference uses Int32.TryParse, and NVR health failure uses a fixed internal error code. Goal is parser-safe Windows PowerShell 5 syntax before any background execution.

Gate: CI green → merge → commit-pinned LAB download → static search for -match/-notmatch/-replace → -Once parser PASS → background ONLINE → clip.
