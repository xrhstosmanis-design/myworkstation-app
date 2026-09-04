MYWORKSTATION RBS / CAPDRIVER OBSERVER 1.1.3 - PC KAT

SAFETY
- READ ONLY / SHADOW MODE.
- Does not issue, cancel or resend receipts.
- Does not send commands to Kiosk Manager, CapDriver or RBS.
- Does not upload/store raw fiscal content or filenames.
- Ignores CapDriverSVC_log.txt and its rotated diagnostic copies.
- Collapses repeated Windows notifications for the same unchanged file.
- "Command observed" never means that a receipt was issued or accepted.
- If Internet is temporarily unavailable, only hash, byte length, source and
  timestamp are queued locally and delivered automatically after reconnection.
- Kiosk Manager / RBS remains the only fiscal route.

INSTALLATION
1. In MyWorkStation Platform Admin, technically activate CONNECTOR_RBS for KAT.
2. Open KAT store, create a 15-minute Cloud Store Connector pairing code.
3. Copy this whole folder to the KAT PC.
4. First run PRECHECK_OBSERVER_KAT.cmd. It creates a safe text report on
   the desktop and does not change Kiosk Manager, CapDriver or RBS.
5. Right-click INSTALL_OBSERVER_KAT.cmd and choose Run as administrator.
6. Enter the pairing code. No passwords, Git or Node are required.
7. Wait for INSTALLATION COMPLETE - READ ONLY.
8. Open desktop shortcut "MyWorkStation Observer - Katastasi".

The installer first backs up existing C:\_km, C:\Kiosk Manager,
C:\CapDriverService and C:\capture under C:\MyWorkStation_Backups.
If backup fails, installation stops before making Observer changes.
