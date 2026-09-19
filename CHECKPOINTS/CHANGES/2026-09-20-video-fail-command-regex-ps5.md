# 2026-09-20 — Video Fail-Command Regex.Replace PS5 hotfix — AWAITING LAB

LAB visible parse test proved Windows PowerShell 5 still tokenizes the -replace expression in Fail-Command incorrectly. Replaced the operator expression entirely with [regex]::Replace($safeCode,'[^A-Z0-9_-]','_'), then bounds the result separately. This removes the parser ambiguity rather than rearranging it.

Gate: CI green → merge → replace LAB connector → -Once parser test → background Running/ONLINE → clip.
