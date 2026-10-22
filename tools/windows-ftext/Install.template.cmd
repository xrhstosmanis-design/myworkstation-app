@echo off
setlocal
set "MWS_FTEXT_SETUP_FILE=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$raw=[IO.File]::ReadAllText($env:MWS_FTEXT_SETUP_FILE);$source=($raw -split '(?m)^# MWS_FTEXT_POWERSHELL_BEGIN\r?$',2)[1];if(-not $source){throw 'Invalid ftext package'};& ([scriptblock]::Create($source))"
exit /b %ERRORLEVEL%
# MWS_FTEXT_POWERSHELL_BEGIN
$ErrorActionPreference='Stop'
try {
    $configJson=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__CONFIG_BASE64__'))
    $c=$configJson | ConvertFrom-Json
    foreach($key in @('companyId','storeId','terminalPos')) { if([string]$c.$key -notmatch '^[A-Za-z0-9_-]{2,120}$') { throw 'Invalid installation identity.' } }
    $directory=Join-Path $env:LOCALAPPDATA ('MyWorkStation\Ftext\'+$c.companyId+'\'+$c.storeId+'\'+$c.terminalPos)
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $files=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__FILES_BASE64__')) | ConvertFrom-Json
    foreach($file in $files.PSObject.Properties) {
        if($file.Name -notin @('Ftext.psm1','Cloud-Tools.psm1','Pair.ps1','Cloud-Test.ps1','Cloud-Connector.ps1','Setup.ps1')) { throw 'Unexpected package file.' }
        [IO.File]::WriteAllBytes((Join-Path $directory $file.Name),[Convert]::FromBase64String([string]$file.Value))
    }
    [IO.File]::WriteAllText((Join-Path $directory 'config.json'),$configJson,(New-Object Text.UTF8Encoding($false)))
    & (Join-Path $directory 'Setup.ps1') -ConfigPath (Join-Path $directory 'config.json')
} catch { Write-Host ('STOP: '+$_.Exception.Message) -ForegroundColor Red;Read-Host 'Press Enter to close';exit 1 }
