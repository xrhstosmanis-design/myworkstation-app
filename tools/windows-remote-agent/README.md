# MyWorkStation Windows Remote Agent — AWAITING WINDOWS LAB

First attended prototype; not a completed production installation feature. The server refuses all agent routes unless enabled for one exact `REMOTE_AGENT_TRIAL_TERMINAL_ID` with a future `REMOTE_AGENT_TRIAL_UNTIL` no more than30 minutes from process startup; `REMOTE_AGENT_ENABLED=true` alone never opens access. Keep this unset in production until explicit acceptance. No new production session or device permission has been granted by publishing this code.

Build on Windows with .NET8 SDK:

```powershell
dotnet publish tools/windows-remote-agent/MyWorkStation.RemoteAgent.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o remote-agent-build
```

The Windows Remote Agent build workflow produces a self-contained win-x64 executable artifact. It is not yet Authenticode signed; the Windows build alone is not a physical desktop test. Do not instruct stores to bypass Windows security warnings. First test under the owner's supervision on two non-production Windows PCs.

Proposed test flow (NOT VERIFIED):
1. Super Admin selects one store terminal and creates REMOTE_ASSIST in Installation Center.
2. The user manually launches the agent on that store PC, enters only the six-digit code, ticks local consent and presses Accept.
   The server resolves exactly one unexpired pending job for the configured trial terminal. Zero or multiple matches are rejected; IDs are never typed by the local user. The previous three-field binary cannot use this simplified UI; download the new build.
3. The session creator opens Windows Remote Assist in the same Super Admin session. Only that creator may view/control. The code is consumed atomically and a random device token lives only in memory.
4. Click left/right, scroll or send text/special keys through the controller. The local agent window stays visible and on top.
5. Local STOP or unchecking consent cancels capture/input immediately. Closing either endpoint makes the other fail closed within15 seconds. Explicit server stop revokes the token. Absolute maximum20 minutes; reconnect requires a fresh code.

Architecture: outbound HTTPS to the existing Render application only, no incoming Windows port or new hosting service. JPEG primary-screen images are relayed in process memory, approximately1fps, not stored in PostgreSQL or audit. Commands are capped and locally rejected when older than3 seconds. Restarting/deploying the server ends all sessions. It currently requires one Render instance; do not enable across replicas without shared session routing. The existing Cloudflare front end does not require new TURN/Workers credentials for this prototype.

Limits: primary screen only; click/scroll/text/special keys, no drag/modifier shortcuts, no audio, no clipboard sharing, no file transfer, no unattended service/startup and no automatic installer execution. Windows UAC/secure desktop and elevated windows cannot be controlled; the local user handles required elevation. No fiscal API commands are added. Desktop control could open other Windows apps, so local consent covers the whole displayed desktop.

Acceptance still required: Windows compilation, executable start, screenshot dimensions/click mapping/Greek typing, stop before queued input, controller/device disconnect, expiry/single-use/unauthorized creator, protected desktop behavior and exact deployment/audit readback. Existing POS activation remains reserved for the store PC. Never mark this feature PASS from Node tests or CI alone.
