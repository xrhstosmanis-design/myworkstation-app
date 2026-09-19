# 2026-09-20 — Video Connector zero-regex static verification — AWAITING LAB

Full-file source inspection found duplicated/stale regex operator occurrences that earlier targeted edits missed. This change transforms the complete VideoConnector.ps1 and verifies before commit that zero lines contain -match, -notmatch or -replace. Parse-Dahua uses IndexOf/Substring, ONVIF extraction uses XML helper, channel parsing uses Int32.TryParse, timestamp encoding uses String.Replace method, find responses use equality/line parsing, and failure paths use bounded internal codes.

Gate: CI green → merge → commit-pinned LAB download → findstr zero results → -Once parser PASS → background ONLINE → clip.
