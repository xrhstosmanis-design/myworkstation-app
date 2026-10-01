# MyWorkStation attended Windows Remote Assist

**01/10/2026 — ASSIGNED `codex/remote-windows-agent-20261001` (installation page):** Owner requests MyWorkStation-owned attended Windows remote desktop for installation/support, using existing Render/Cloudflare only. Existing REMOTE is metadata/acceptance only; screen transport/input/Windows agent NOT IMPLEMENTED. Bounded first version: short-lived single-use pairing, explicit local consent, SuperAdmin creator-only controller, screen/mouse/key with stop/revocation and audit. No unattended service, credentials, automatic installer execution, fiscal API commands or POS activation. AWAITING CI/WINDOWS LAB; no physical PASS. Checkpoint `CHECKPOINTS/CHANGES/2026-10-01-remote-windows-agent.md`.

## Baseline
Current main 7c21270f17ddaa33b403c829dcd1f03559c5a3a8. Existing job creation/acceptance stores status only. No screen capture, controller transport or installed agent present in tree. Diadochou POS activation reserved for physical store. Published POS layout and financial/stock behavior protected. No new remote session started.

## Acceptance
Windows executable build and real two-PC attended session: local consent, display/control, stop/expiry/offline recovery; unauthorized/foreign creator rejection; exact deploy and audit readback. CI alone cannot be called LIVE/LAB PASS. Default production feature gate off until explicit activation and Windows acceptance.

## Implementation — AWAITING CI / WINDOWS LAB
Added attended .NET8 Windows Forms agent, owner-only browser controller and outbound HTTPS frame/input relay. Feature gated OFF by default (`REMOTE_AGENT_ENABLED` unset). Single-use atomic pairing, local consent, 256-bit in-memory device secret,20-minute maximum,15-second disconnect,100-command queue,3-second local input age limit, screen frames memory-only and expiry/stop audit. No service/autostart/elevation, file transfer or installer execution. One Render instance only. Existing code-only accept flow retained; new Windows pairing is separate.

Six targeted Node tests PASS; frontend build PASS on isolated existing checkout. Windows SDK unavailable in this Linux workspace; dedicated windows-latest CI builds self-contained win-x64 artifact. Actual Windows screen/input/UAC/stop behavior NOT TESTED. No environment flag, device access, POS activation or production session changed. Current owner remains `codex/remote-windows-agent-20261001`; next action is verify exact Windows CI artifact, then owner-supervised two-PC LAB before production activation.
