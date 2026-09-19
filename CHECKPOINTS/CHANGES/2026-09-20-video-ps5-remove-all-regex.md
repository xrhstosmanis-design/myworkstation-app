# 2026-09-20 — Remove all regex parsing from Windows Video Connector — AWAITING LAB

Static LAB check correctly found remaining regex operators in logging, ONVIF helpers, and NVR error-stage detection. Removed all remaining -match/-notmatch/-replace usage from the script. Logging no longer regex-redacts because credentials are never intentionally logged; ONVIF value extraction uses XML DOM/local-name; HTTP stage detection uses String.Contains; SOAP fault handling relies on HTTP status in this connector path.

Gate: CI green → merge → commit-pinned download → findstr must return no -match/-notmatch/-replace lines → -Once parser PASS → background ONLINE → clip.
