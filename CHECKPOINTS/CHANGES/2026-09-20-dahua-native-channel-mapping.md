# 2026-09-20 — Dahua native channel mapping — AWAITING LAB

Manual LAB evidence showed the successful mediaFileFind request used condition.Channel=1. The connector's Get-Channel subtracted one from numeric camera/stream references, turning configured channel 1 into Dahua channel 0. Dahua CGI uses the native channel value in this verified NVR flow. Removed the subtraction so configured stream/channel 1 is sent as condition.Channel=1. The existing HttpClient is retained across factory.create/findFile/findNextFile, preserving the stateful Dahua session.

LAB prerequisite: change D1 IPC stream/vendor ref from 0 to 1 and save cameras. Then deploy connector and retry a real clip.
