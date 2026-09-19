# 2026-09-20 — Video Fail-Command PowerShell parser hotfix — AWAITING LAB

LAB scheduled task exited with Last Result 1 before heartbeat. Visible execution exposed a PowerShell parser error in Fail-Command line 52: a method call was chained directly onto a parenthesized -replace expression inside a hashtable value. Rewritten into explicit $safeCode normalization, bounded length, then backend failure report. This is parser-safe on Windows PowerShell 5.

Gate: CI green → merge → replace LAB connector → visible continuous run → scheduled task Running → connector ONLINE → retry video command.
