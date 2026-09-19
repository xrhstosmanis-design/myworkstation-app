MYWORKSTATION DAHUA VIDEO CONNECTOR - KAT-10 LAB

Purpose
  Read-only local access to a Dahua NVR/camera and outbound-only HTTPS communication to MyWorkStation.
  No RTSP/HTTP port is exposed to the internet. Continuous recording remains on the NVR.

Before installation
  1. Connect the DHI-NVR2104-4KS3 and DH-IPC-T1E20-A to the same router/switch as the POS PC.
  2. Create a Dahua account with playback/live-view permissions only. Do not grant configuration/admin permissions.
  3. Set the NVR, camera and Windows PC timezone/NTP to Europe/Athens.
  4. Enable VIDEO_EVENTS and create a 15-minute Cloud Store Connector pairing code for this store.
  5. Install FFmpeg and pass its full ffmpeg.exe path if browser-compatible MP4 clips are required.

Installation
  Run PRECHECK_VIDEO_CONNECTOR_KAT.cmd, then run INSTALL_VIDEO_CONNECTOR_KAT.cmd as Administrator.
  The installer performs ONVIF WS-Discovery on the LAN and suggests the first endpoint found.
  Confirm the local NVR endpoint, then enter the pairing code and read-only Dahua credentials.

Security
  The device token and Dahua credentials are protected locally with Windows DPAPI LocalMachine.
  Logs never contain passwords, bearer tokens or raw authenticated URLs.
  The agent polls outbound; there is no inbound listener and no port forwarding.
  Snapshot/clip artifacts are temporary, authenticated and expire on the backend.

LAB defaults
  NVR endpoint: http://192.168.1.108 (change to the assigned LAN IP)
  Protocol: DAHUA_CGI
  Camera key/channel: 1 (Dahua CGI channel index is converted to zero-based)

Validation
  Open Video Events / Connection recorder, verify ONLINE, run Real connection test,
  request a test image, verify NVR_API time, then open an Audit event video (30 seconds before / 60 seconds after).
