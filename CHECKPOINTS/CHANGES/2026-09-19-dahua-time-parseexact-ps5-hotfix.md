# 2026-09-19 — Dahua time ParseExact PowerShell 5 hotfix — AWAITING LAB

LAB now reads the Dahua result time but Windows PowerShell 5 reports no matching 4-argument ParseExact overload. Switched the local Dahua timestamp parse to the compatible 3-argument overload; timezone offset is still attached separately using GTB Standard Time, so DST behavior remains correct.

Gate: CI green → merge → replace LAB connector → -Once → HEARTBEAT OK nvrOnline=True.
