# Video Audit — LAB PASS 20/09/2026

- Dahua Connector parser PASS.
- Scheduled Task Running και BackOffice ONLINE.
- D1 IPC → POS 1 → native Dahua channel/stream 1 στο LAB reference.
- Πραγματικό ιστορικό clip 90s: 30s πριν + 60s μετά.
- End-to-end PASS: Audit event → command → NVR → DAV → FFmpeg → MP4 → upload → authenticated browser playback.
- FFmpeg hard timeout 60s προστατεύει το heartbeat από μόνιμο transcode hang.

Για νέο κατάστημα απαιτείται νέο πραγματικό PASS· δεν αντιγράφονται τυφλά IP/channel/credentials του LAB.
