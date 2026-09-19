# 2026-09-20 — Video Fail-Command no-regex PS5 hotfix — AWAITING LAB

LAB proved both PowerShell -replace and [regex]::Replace forms are parsed incorrectly in this deployed Windows PowerShell environment at the Fail-Command pattern literal. Removed regex sanitization entirely from the local connector failure reporter. Error codes are already generated internally by the connector; Fail-Command now only supplies COMMAND_FAILED for blank values and bounds length to 120 characters.

Gate: CI green → merge → cache-busted LAB download → findstr verification → -Once parser test → background ONLINE → clip.
