@echo off
setlocal
set "MWS_GUIDED_SETUP_FILE=%~f0"
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -Command "$raw=[IO.File]::ReadAllText($env:MWS_GUIDED_SETUP_FILE); $source=($raw -split '(?m)^# MWS_GUIDED_POWERSHELL_BEGIN\r?$',2)[1]; if(-not $source){throw 'Invalid setup package'}; & ([scriptblock]::Create($source))"
exit /b %ERRORLEVEL%
# MWS_GUIDED_POWERSHELL_BEGIN
$ErrorActionPreference = 'Stop'
try {
  $legacySource = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__LEGACY_BASE64__'))
  & ([scriptblock]::Create($legacySource)) -Action PREPARE
  # Legacy preparation is offline and leaves the existing credential untouched.
  $legacyConfigBase64 = [regex]::Match($legacySource, "FromBase64String\('([^']+)'\)").Groups[1].Value
  $config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($legacyConfigBase64)) | ConvertFrom-Json
  $directory = Join-Path $env:LOCALAPPDATA ('MyWorkStation\RbsCapDriverV1\packages\' + $config.storeId)
  $files = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__GUIDED_FILES_BASE64__')) | ConvertFrom-Json
  foreach ($file in $files.PSObject.Properties) {
    if ($file.Name -notin @('Guided-Setup.ps1','Connector-Tools.ps1','Start-Connector.ps1')) { throw 'Unexpected guided package file.' }
    [IO.File]::WriteAllBytes((Join-Path $directory $file.Name), [Convert]::FromBase64String([string]$file.Value))
  }
  & (Join-Path $directory 'Guided-Setup.ps1') -ConfigPath (Join-Path $directory 'installation.json')
} catch {
  Write-Host ('STOP: ' + $_.Exception.Message) -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}
