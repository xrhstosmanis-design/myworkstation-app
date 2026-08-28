@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Requesting administrator permission...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo MYWORKSTATION - KAT STORE MODE INSTALLER
echo.
if "%~1"=="" (
  echo Paste the one-time installation link from:
  echo Super Admin - Installations / Terminals - New link
  echo.
  set /p "installUrl=Installation link: "
) else (
  set "installUrl=%~1"
)
if not defined installUrl (
  echo No installation link was entered. Nothing changed.
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-KAT.ps1" -StoreModeUrl "%installUrl%"
set "installUrl="
set code=%ERRORLEVEL%
echo.
if %code%==0 (
  echo KAT STORE MODE INSTALLATION COMPLETED
) else (
  echo KAT STORE MODE INSTALLATION STOPPED SAFELY
)
pause
exit /b %code%
