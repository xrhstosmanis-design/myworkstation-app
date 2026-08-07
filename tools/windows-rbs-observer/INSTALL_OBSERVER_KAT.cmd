@echo off
chcp 65001 >nul
net session >nul 2>&1
if not %errorlevel%==0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Observer.ps1"
if errorlevel 1 pause
