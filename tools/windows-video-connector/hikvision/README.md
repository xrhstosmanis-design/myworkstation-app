# Hikvision preflight — preparation, not an installed connector

For Diadochou's photographed iDS-7116HQHI-M1/S. Windows PowerShell 5.1; no Python,
Node or FFmpeg installation needed. Extract all files together, then double-click
`Start-Hikvision-Precheck.cmd`. Enter the local HTTP/HTTPS URL shown in DVR network
settings (for example `http://192.168.x.x`, replacing it with the actual private IP
and configured port), then enter the DVR read-only/playback credentials in the
Windows credential dialog. These are not MyWorkStation credentials.

The probe reads model/firmware, device clock with its timezone offset, streaming
channel IDs, recording track IDs and search profile. It creates
`MyWorkStation_Hikvision_Precheck.json` on the Desktop. The report excludes password,
username, serial, endpoint, raw XML and playback URLs. Camera names may identify
store areas; share the report only as needed for this integration.

After visually confirming which camera covers the POS, run from PowerShell with
an explicitly selected recording track (do not assume channel 1 = track 101):

```powershell
.\Preflight-Hikvision.ps1 -NvrEndpoint 'http://ACTUAL_PRIVATE_IP' -TrackId VERIFIED_TRACK_ID
```

The optional query searches five minutes ending one minute before PC UTC now.
It is an ISAPI search POST, not a configuration/recording write. Time correction
is not applied: inspect reported clock offset first. NO MATCHES means the query
worked but no recording matched; it is not playback PASS. Zero TrackId deliberately
skips historical search. Any unsupported/unauthorized endpoint appears as a separate
FAIL, without preventing the other checks. A FAIL exits 1; all attempted checks
passing exits 0, even when historical search was deliberately NOT TESTED.

This package does not download media, pair a cloud device, upload data, install a
service/task, change the DVR clock/network/firewall, enable ONVIF/ISAPI, or alter
POS data. It allows only six explicit query paths, private IPv4 endpoints, no
redirects, normal HTTPS validation, 12-second request deadlines and 2 MiB XML limit.
Credentials remain in memory for the run; no credentials are saved. Do not use a
public IP, port forwarding, the LAB address or an unrelated store's login.

Official model datasheet documents Ethernet/ONVIF/HTTPS/NTP. It does not certify
this unit's current firmware, API permissions or historical download path. Hikvision
ISAPI guidance documents search then download, but actual availability on this DVR
must be observed. Next: real store preflight, snapshot and bounded historical clip
adapter, then correct camera/time/30s-before/60s-after authenticated playback PASS.
The existing Dahua connector remains unchanged.

Sources:
- https://assets.hikvision.com/prd/public/all/doc/m000058561/Datasheet-of-iDS-7116HQHI-M1_S_V4.71.000_20231218.pdf
- https://www.hikvisioneurope.com/eu/portal/portal/Technology%20Partner%20Program/03-How%20to/How%20to%20search%20and%20download%20the%20video%20file%20from%20NVR%20via%20ISAPI.pdf
