# 2026-09-20 — Video Connector structural duplicate cleanup — AWAITING LAB

Commit-pinned LAB parser test exposed structural corruption rather than another regex issue: an orphan duplicate Fail-Command body remained after the real function, and a duplicated/corrupted old connector fragment was appended after NvrClient.Dispose (including the line-111 unexpected tokens). Removed the orphan block and truncated the file cleanly after the intended Dispose. This addresses the exact line 59 and line 111 parser errors shown in LAB.

Gate: CI green → merge → pinned download → -Once parser PASS → background ONLINE → clip.
