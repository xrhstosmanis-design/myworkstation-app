# MyWorkStation Windows Remote Agent V2 — AWAITING WINDOWS LAB

## Attended POS invitations (candidate, not physical PASS)

The V2 mode requires `REMOTE_SUPPORT_ENABLED=true`. By default only exact IDs listed in `REMOTE_SUPPORT_TERMINALS` are eligible. The explicitly approved `REMOTE_SUPPORT_ALL_ENROLLED=true` mode instead admits every currently active enrolled terminal under an active store/company, including terminals enrolled after startup. This filter never replaces live database scope/active checks or local Accept. Unknown, inactive and customer-demo targets remain closed; omitting the new flag preserves the whitelist. Keep the old whitelist for rollback. Installation of the Agent once on each Windows PC remains required; no browser or server setting installs it silently. Publishing this source grants no device access. Keep it disabled until the exact revision passes CI, Windows build and supervised physical LAB acceptance. This mode is separate from the legacy PIN trial below.

The Super Admin chooses one store and physical POS in Device Operations, then sends an invitation. The signed-in operator sees the requesting administrator, store and POS in a foreground dialog and chooses Accept or Decline. Accept hands a single-use 60-second transport grant to the already running Windows Agent; no PIN or second consent is required. That transport expiry is not a session duration limit. Each administrator may have up to three independent invitations/sessions, each in its own named browser window. Closing or stopping one revokes only that session.

The Windows Agent must first be installed and opened locally. Its optional local checkbox starts it with the current Windows user in waiting mode; it does not accept requests automatically. Browser local-network permission may require a one-time local approval. The bridge listens only on `127.0.0.1:17861`, accepts only the exact production HTTPS origin and exposes status, accept and stop only. It does not accept shell or filesystem commands. No inbound LAN/public port or new hosting service is added.

An accepted session has no fixed duration while both endpoints and their authorized logins remain connected. Local STOP, closing the controller or Agent, logout, access revocation and server restart end access. Loss of heartbeats closes access within 15 seconds. SSE keeps controller windows active without relying on throttled browser timers. Each received active packet is explicitly acknowledged by its authorized controller; server writes alone never renew access after a half-open network loss. This remains an in-memory single-server implementation; do not enable multiple server replicas without shared session routing.

Files travel in either direction, up to 25 MiB per file, in authenticated 256 KiB chunks. Two in-flight files per session share a global 64 MiB buffer budget. Full length, chunk order and SHA-256 must match; abandoned files expire after 10 minutes. Native file selection and Save As remain explicit. Transfers never execute files automatically. STOP removes server buffers; cancelled native downloads remove their temporary file. No remote directory browser, UAC bypass or unattended acceptance is provided.

Required physical acceptance: three distinct company/store/POS targets at once; reject and accept; named-window identities; primary-screen scaling and Greek input; background-window continuity; STOP each side while other sessions continue; logout/revocation/disconnect; bidirectional near-limit files, cancel, corruption and cleanup. Record the exact build/deploy revision and unchanged business controls. Automated tests or compilation alone are not this acceptance.

## Version 2.0.2 command delivery — awaiting owner physical retest

The owner reports2–5seconds click/typing delay with2.0.1; that physical failure remains open.2.0.2 uses an independent authenticated10-second long poll for commands instead of waiting for the next screenshot POST. One consumer drains the queue once, fresh terminal/admin/operator authority is checked again before delivery, and STOP wakes the poll to reject it. Command polling renews neither heartbeat.2.0.2 screenshot requests leave commands for that separate channel; older Agents keep their frame-response fallback unchanged. There is no retry after an uncertain command response.

Input wakes a follow-up screenshot after75ms while the900ms idle capture cadence remains unchanged. The command loop runs on the UI context, rejects commands older than3seconds and checks consent/cancellation before each native input. Closing/STOP cancels and joins the old command loop before clearing or reusing session identity. Install the complete verified2.0.2 Windows ZIP, close the old Agent and open the new executable; after deployment use a new invitation and local Accept. Automated HTTP/Windows lifecycle results do not establish physical response speed, desktop input/files or stability acceptance. Owner personally retests harmless new Notepad content, never POS payment input.

## Version 2.0.1 controller changes — awaiting physical user acceptance

After local Accept, click the displayed remote desktop to focus plain/Greek typing and the supported Enter/Tab/Backspace/Delete/Escape/arrows/Home/End/PageUp/PageDown keys. The controller displays keyboard focus and an explicit release button. Clicking another control, changing windows, logout, stale frames or STOP discards unsent keys. The existing text field and key buttons remain as alternatives. Ctrl/Alt/Windows shortcuts and dragging are not implemented. Explicit Ctrl+V paste supports a single control-free text fragment up to200 characters; there is no background clipboard read or automatic clipboard synchronization. Uncertain requests are never replayed.

Fresh frames are forwarded on arrival; the one-second quiet-stream fallback continues fresh authority/liveness checks. Windows2.0.1 keeps idle capture900ms and takes a follow-up image after75ms when input was applied. The isolated localhost relay benchmark is not a physical Windows/Internet latency claim. Install the complete verified2.0.1 ZIP on the attended store PC for this follow-up behavior;2.0.0 is still protocol-compatible. Close the old Agent before starting the new executable, keeping the published DLLs together. Reopen a controller with a fresh invitation and local Accept after a terminated session.

STOP audit events now carry a fixed reason suffix, covering stream closure/error/backpressure, device/controller idle, local operator/controller/device stop, authority checks and audit rollback. No desktop, typed text, file contents or device bearer is logged. The historical03Nov09:59termination cause remains unknown; this telemetry does not prove a fix for it. The15-second disconnect closure and attended consent boundaries remain unchanged. All new physical keyboard/speed/disconnect acceptance belongs to the owner; automated tests are not USER/LAB PASS.

## Legacy PIN trial (unchanged)

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
