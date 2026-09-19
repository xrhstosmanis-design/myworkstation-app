@echo off
setlocal
net session >nul 2>&1 || (echo Run as Administrator.& pause & exit /b 1)
schtasks.exe /Delete /TN "MyWorkStation Dahua Video Connector" /F
echo Startup task removed. Protected configuration remains in C:\ProgramData\MyWorkStation\VideoConnector for recovery.
pause
endlocal
