@echo off
setlocal
echo MYWORKSTATION - KAT STORE MODE INSTALLER
echo.
if "%~1"=="" (
  echo Usage: INSTALL_KAT.cmd "https://myworkstation-app.onrender.com/store/STORE_ID?terminal=KAT-POS-01^&activation=ONE_TIME_TOKEN"
  echo.
  echo Copy the one-time installation link from Super Admin - Installations / Terminals.
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-KAT.ps1" -StoreModeUrl "%~1"
set code=%ERRORLEVEL%
echo.
if %code%==0 (
  echo KAT STORE MODE INSTALLATION COMPLETED
) else (
  echo KAT STORE MODE INSTALLATION STOPPED SAFELY
)
pause
exit /b %code%
