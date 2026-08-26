@echo off
setlocal
echo MYWORKSTATION - KAT STORE MODE RECOVERY
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Recover-KAT.ps1"
set code=%ERRORLEVEL%
echo.
if %code%==0 (
  echo KAT STORE MODE RECOVERY COMPLETED
) else (
  echo KAT STORE MODE RECOVERY STOPPED SAFELY
)
pause
exit /b %code%
