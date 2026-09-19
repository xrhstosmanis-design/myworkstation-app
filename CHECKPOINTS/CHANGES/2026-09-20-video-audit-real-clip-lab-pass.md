# 2026-09-20 — Video Audit real clip — LAB PASS

LAB validation PASS. MyWorkStation successfully requested and displayed a real 90-second historical clip from the local Dahua NVR for D1 IPC / POS 1, event time 20/09/2026 00:02:09, window 00:01:39–00:03:09. The browser player shows the NVR timestamp overlay and 1:30 duration. Validated end-to-end path: audit event → outbound connector command → Dahua recording lookup → DAV download → bounded FFmpeg DAV→MP4 transcode → chunk upload → authenticated browser playback. Connector mapping: D1 IPC → POS 1 → native Dahua channel/stream 1. FFmpeg has a 60-second timeout protection so a bad transcode cannot indefinitely block heartbeats.

Status: LAB PASS. Ready to retain as the reference Video Audit implementation before rollout to other stores/NVRs.
