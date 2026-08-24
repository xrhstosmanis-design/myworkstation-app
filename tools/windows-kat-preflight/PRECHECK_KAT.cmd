@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Preflight-KAT.ps1"
set code=%ERRORLEVEL%
echo.
if %code%==0 (
  echo KAT SOFTWARE PREFLIGHT READY
) else (
  echo KAT SOFTWARE PREFLIGHT HAS BLOCKERS
)
pause
exit /b %code%
