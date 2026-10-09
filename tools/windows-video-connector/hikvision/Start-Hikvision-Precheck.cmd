@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Preflight-Hikvision.ps1"
set "HIKVISION_CHECK_EXIT=%ERRORLEVEL%"
echo.
echo Check finished with code %HIKVISION_CHECK_EXIT%. Keep the report for review.
pause
exit /b %HIKVISION_CHECK_EXIT%
