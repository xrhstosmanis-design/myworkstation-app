# 2026-09-20 — Video FFmpeg timeout / heartbeat protection — AWAITING LAB

LAB process inspection proved the real clip pipeline reached a downloaded Dahua .dav file and then hung inside ffmpeg transcoding. Because PowerShell invoked ffmpeg synchronously, the connector stopped heartbeats and BackOffice became OFFLINE while both powershell.exe and ffmpeg.exe remained alive. Replaced direct invocation with Start-Process, -nostdin, a 60-second WaitForExit bound, forced kill on timeout, and explicit FFMPEG_TIMEOUT/FFMPEG_TRANSCODE_FAILED errors. This guarantees the connector loop can recover and resume heartbeats after a bad/hanging DAV transcode.

Gate: CI green → merge → stop current stuck task/ffmpeg → pinned connector download → -Once parser PASS → background ONLINE → real clip. If ffmpeg cannot transcode the DAV within 60s, expect FFMPEG_TIMEOUT while connector stays ONLINE.
