param([string]$PairingCode,[string]$ApiBase="https://myworkstation.gr",[string]$WatchPath="C:\capture\micrelec")
$ErrorActionPreference="Stop"
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw "Run INSTALL_OBSERVER_KAT.cmd as Administrator."}
if([string]::IsNullOrWhiteSpace($PairingCode)){$PairingCode=Read-Host "Pairing code from MyWorkStation"}
if($PairingCode.Length -lt 6){throw "Invalid pairing code."}
$source=Split-Path -Parent $MyInvocation.MyCommand.Path
$preflight=Join-Path $source "Preflight-Observer.ps1"
if(!(Test-Path -LiteralPath $preflight)){throw "Preflight-Observer.ps1 is missing. Use the complete official package."}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $preflight -ApiBase $ApiBase -WatchPath $WatchPath -ForInstall
if($LASTEXITCODE -ne 0){throw "Pre-installation checks failed. Open MyWorkStation_Observer_Precheck.txt on the desktop."}
$root="C:\ProgramData\MyWorkStation\RbsObserver"
$backupRoot="C:\MyWorkStation_Backups\KAT_{0}" -f (Get-Date -Format "yyyyMMdd_HHmmss")
$protected=@("C:\_km","C:\Kiosk Manager","C:\CapDriverService","C:\capture")
New-Item -ItemType Directory -Path $backupRoot -Force|Out-Null
foreach($path in $protected){
  if(Test-Path -LiteralPath $path){
    $name=Split-Path $path -Leaf
    & robocopy $path (Join-Path $backupRoot $name) /E /COPY:DAT /DCOPY:T /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS
    if($LASTEXITCODE -ge 8){throw "Backup failed for $path. Installation stopped before changes."}
  }
}
if(!(Test-Path -LiteralPath $WatchPath)){throw "Observation path $WatchPath was not found. Installation stopped before pairing."}
New-Item -ItemType Directory -Path $root -Force|Out-Null
Copy-Item (Join-Path $source "Observer.ps1") $root -Force
Copy-Item (Join-Path $source "Status-Observer.ps1") $root -Force
Copy-Item $preflight $root -Force
$pairBody=@{code=$PairingCode;deviceName=("KAT-PC RBS Observer - "+$env:COMPUTERNAME);platform="Windows Read-Only Observer";metadata=@{observerMode="READ_ONLY";commandsEnabled=$false}}|ConvertTo-Json -Depth 4 -Compress
$pair=Invoke-RestMethod -Uri ($ApiBase.TrimEnd("/")+"/api/cloud/v1/pair") -Method Post -ContentType "application/json; charset=utf-8" -Body $pairBody -TimeoutSec 30
$tokenBytes=[Text.Encoding]::UTF8.GetBytes($pair.token)
$protectedToken=[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($tokenBytes,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine))
@{apiBase=$ApiBase.TrimEnd("/");watchPath=$WatchPath;protectedToken=$protectedToken;deviceId=$pair.device.id;storeId=$pair.device.storeId;installedAt=[DateTime]::UtcNow.ToString("o");mode="READ_ONLY"}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root "observer.config.json") -Encoding UTF8
$taskName="MyWorkStation RBS Read-Only Observer"
$taskCommand="powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\Observer.ps1`""
& schtasks.exe /Create /TN $taskName /SC ONSTART /RU SYSTEM /RL HIGHEST /TR $taskCommand /F|Out-Null
if($LASTEXITCODE -ne 0){throw "Could not create Observer startup task."}
& schtasks.exe /Run /TN $taskName|Out-Null
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "MyWorkStation Observer - Katastasi.lnk"))
$shortcut.TargetPath="powershell.exe";$shortcut.Arguments="-NoProfile -ExecutionPolicy Bypass -File `"$root\Status-Observer.ps1`""";$shortcut.WorkingDirectory=$root;$shortcut.Save()
Write-Host "INSTALLATION COMPLETE - READ ONLY" -ForegroundColor Green
Write-Host "Backup: $backupRoot"
Write-Host "No Kiosk Manager or CapDriver files were modified."
Read-Host "Press Enter to close"
