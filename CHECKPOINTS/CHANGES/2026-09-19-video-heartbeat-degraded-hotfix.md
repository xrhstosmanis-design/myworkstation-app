# 2026-09-19 — Video Connector degraded heartbeat hotfix

LAB proved the connector parser is fixed, but Dahua NVR time discovery can return NVR_TIME_UNAVAILABLE. The connector previously dereferenced null NVR state into the heartbeat payload, producing backend HTTP 400. Heartbeat now omits unavailable optional NVR fields and reports processRunning=true, nvrOnline=false with a sanitized errorCode. Backend failures also log the response detail safely.

Gate: CI green → merge → replace LAB script → -Once → expect connector DEGRADED/online-presence rather than stale OFFLINE; then fix Dahua time API separately and reach ONLINE.
