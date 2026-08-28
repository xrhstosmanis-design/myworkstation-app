@echo off
setlocal
echo MYWORKSTATION - KAT STORE MODE RECOVERY DRY RUN
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Recover-KAT.ps1" -DryRun
set code=%ERRORLEVEL%
echo.
if %code%==0 (
  echo KAT RECOVERY DRY RUN PASSED - NO SHORTCUT CHANGE
) else (
  echo KAT RECOVERY DRY RUN STOPPED SAFELY
)
pause
exit /b %code%
