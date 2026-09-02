param(
  [Parameter(Mandatory=$true)][string]$StoreModeUrl,
  [string]$ShortcutName="MyWorkStation - KAT"
)
$ErrorActionPreference="Stop"
$installerRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$preflight=Join-Path $installerRoot "Preflight-KAT.ps1"
$manifestPath=Join-Path $installerRoot "package-manifest.json"

if(!(Test-Path -LiteralPath $preflight)){throw "Official Preflight-KAT.ps1 was not found."}
if(!(Test-Path -LiteralPath $manifestPath)){throw "package-manifest.json was not found. Installation stopped without changes."}
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($manifest.schemaVersion -ne 1 -or !($manifest.files -is [array]) -or $manifest.files.Count -lt 1){throw "The package manifest is invalid."}
foreach($entry in $manifest.files){
  $name=[string]$entry.name
  if(!$name -or [IO.Path]::GetFileName($name) -ne $name){throw "The package manifest contains an unsafe file name."}
  $file=Join-Path $installerRoot $name
  if(!(Test-Path -LiteralPath $file)){throw "A package file is missing: $name"}
  $actual=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if($actual -ne ([string]$entry.sha256).ToLowerInvariant()){throw "Package integrity check failed: $name. Installation stopped without changes."}
}
$uri=$null
if(![Uri]::TryCreate($StoreModeUrl,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne "https" -or $uri.AbsolutePath -notmatch '^/store/[^/]+/?$' -or $uri.Query -notmatch '^\?terminal=([A-Za-z0-9_-]{2,40})&activation=([A-Za-z0-9_-]{32,200})$'){
  throw "Enter the one-time HTTPS installation link from Super Admin > Installations / Terminals."
}
$terminalPos=$Matches[1].ToUpperInvariant()
$canonicalStoreModeUrl=$uri.GetLeftPart([UriPartial]::Authority)+$uri.AbsolutePath

Write-Host "1/3 - Running read-only preflight..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $preflight -ApiBase ($uri.GetLeftPart([UriPartial]::Authority))
if($LASTEXITCODE -ne 0){throw "Installation stopped because preflight found blockers."}
$health=Invoke-RestMethod -Uri (($uri.GetLeftPart([UriPartial]::Authority)).TrimEnd("/")+"/api/health") -Method Get -TimeoutSec 20
if($health.ok -ne $true -or ![string]$health.revision){throw "Installation stopped because the exact app revision was not confirmed."}

Write-Host "2/3 - Creating the safe Store Mode shortcut..."
$desktop=[Environment]::GetFolderPath("CommonDesktopDirectory")
if(!$desktop -or !(Test-Path -LiteralPath $desktop)){$desktop=[Environment]::GetFolderPath("Desktop")}
$safeName=($ShortcutName -replace '[\\/:*?"<>|]','-').Trim()
if(!$safeName){$safeName="MyWorkStation - KAT"}
$shortcut=Join-Path $desktop ($safeName+".url")
$backupRoot=Join-Path $env:ProgramData "MyWorkStation\InstallerBackups"
New-Item -ItemType Directory -Path $backupRoot -Force|Out-Null
if(Test-Path -LiteralPath $shortcut){
  $stamp=Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item -LiteralPath $shortcut -Destination (Join-Path $backupRoot ($safeName+"-"+$stamp+".url")) -Force
}
$temp=Join-Path $env:TEMP ("mws-kat-"+[guid]::NewGuid().ToString("N")+".url")
@("[InternetShortcut]","URL="+$canonicalStoreModeUrl,"IconFile=%SystemRoot%\System32\SHELL32.dll","IconIndex=14")|Set-Content -LiteralPath $temp -Encoding ASCII
Move-Item -LiteralPath $temp -Destination $shortcut -Force
$stateRoot=Join-Path $env:ProgramData "MyWorkStation\KAT"
New-Item -ItemType Directory -Path $stateRoot -Force|Out-Null
$stateFile=Join-Path $stateRoot "store-mode-installation.json"
@{
  schemaVersion=2
  installedAt=(Get-Date).ToUniversalTime().ToString("o")
  storeModeUrl=$canonicalStoreModeUrl
  terminalPos=$terminalPos
  appRevision=[string]$health.revision
  appVersion=[string]$health.version
  shortcutPath=$shortcut
  shortcutName=$safeName
}|ConvertTo-Json|Set-Content -LiteralPath $stateFile -Encoding UTF8

Write-Host "3/3 - Recording the installation result..."
$report=Join-Path ([Environment]::GetFolderPath("Desktop")) "MyWorkStation_KAT_Installation.txt"
@(
  "MYWORKSTATION KAT STORE MODE INSTALLATION",
  "Date: "+(Get-Date -Format "yyyy-MM-dd HH:mm:ss"),
  "Store Mode: "+$canonicalStoreModeUrl,
  "Terminal: "+$terminalPos,
  "Shortcut: "+$shortcut,
  "Recovery state: "+$stateFile,
  "Package integrity: VERIFIED",
  "Result: READY FOR NON-FISCAL PILOT TEST",
  "Safety: NO RBS / NO KIOSK MANAGER / NO CAPDRIVER CHANGES",
  "Observer: NOT INSTALLED - separate technical activation required"
)|Set-Content -LiteralPath $report -Encoding UTF8
Write-Host "Opening one-time activation for $terminalPos..."
Start-Process $uri.AbsoluteUri
Write-Host "Store Mode installation completed."
Write-Host "Shortcut: $shortcut"
Write-Host "Report: $report"
