@echo off
chcp 65001 >nul
net session >nul 2>&1
if not %errorlevel%==0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
schtasks /End /TN "MyWorkStation RBS Read-Only Observer" >nul 2>&1
schtasks /Delete /TN "MyWorkStation RBS Read-Only Observer" /F >nul 2>&1
echo Observer stopped and startup task removed.
echo Backups, logs, Kiosk Manager, CapDriver and capture files were not deleted or modified.
pause
