param(
  [Parameter(Mandatory=$true)][string]$StoreModeUrl,
  [string]$ShortcutName="MyWorkStation - Κυλικείο ΚΑΤ"
)
$ErrorActionPreference="Stop"
$installerRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$preflight=Join-Path $installerRoot "Preflight-KAT.ps1"
$manifestPath=Join-Path $installerRoot "package-manifest.json"

if(!(Test-Path -LiteralPath $preflight)){throw "Δεν βρέθηκε το επίσημο Preflight-KAT.ps1."}
if(!(Test-Path -LiteralPath $manifestPath)){throw "Δεν βρέθηκε το package-manifest.json. Η εγκατάσταση σταμάτησε χωρίς αλλαγές."}
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($manifest.schemaVersion -ne 1 -or !($manifest.files -is [array]) -or $manifest.files.Count -lt 1){throw "Το package manifest δεν είναι έγκυρο."}
foreach($entry in $manifest.files){
  $name=[string]$entry.name
  if(!$name -or [IO.Path]::GetFileName($name) -ne $name){throw "Το package manifest περιέχει μη ασφαλές όνομα αρχείου."}
  $file=Join-Path $installerRoot $name
  if(!(Test-Path -LiteralPath $file)){throw "Λείπει αρχείο του πακέτου: $name"}
  $actual=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if($actual -ne ([string]$entry.sha256).ToLowerInvariant()){throw "Αποτυχία ελέγχου ακεραιότητας: $name. Η εγκατάσταση σταμάτησε χωρίς αλλαγές."}
}
$uri=$null
if(![Uri]::TryCreate($StoreModeUrl,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne "https" -or $uri.AbsolutePath -notmatch '^/store/[^/]+/?$' -or $uri.Query -notmatch '^\?terminal=([A-Za-z0-9_-]{2,40})&activation=([A-Za-z0-9_-]{32,200})$'){
  throw "Δώσε το εφάπαξ HTTPS link εγκατάστασης από Super Admin > Εγκαταστάσεις / Τερματικά."
}
$terminalPos=$Matches[1].ToUpperInvariant()
$canonicalStoreModeUrl=$uri.GetLeftPart([UriPartial]::Authority)+$uri.AbsolutePath

Write-Host "1/3 - Εκτέλεση read-only προελέγχου..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $preflight -ApiBase ($uri.GetLeftPart([UriPartial]::Authority))
if($LASTEXITCODE -ne 0){throw "Η εγκατάσταση σταμάτησε επειδή ο προέλεγχος έχει blockers."}

Write-Host "2/3 - Δημιουργία ασφαλούς συντόμευσης Store Mode..."
$desktop=[Environment]::GetFolderPath("CommonDesktopDirectory")
if(!$desktop -or !(Test-Path -LiteralPath $desktop)){$desktop=[Environment]::GetFolderPath("Desktop")}
$safeName=($ShortcutName -replace '[\\/:*?"<>|]','-').Trim()
if(!$safeName){$safeName="MyWorkStation - Κυλικείο ΚΑΤ"}
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
  shortcutPath=$shortcut
  shortcutName=$safeName
}|ConvertTo-Json|Set-Content -LiteralPath $stateFile -Encoding UTF8

Write-Host "3/3 - Καταγραφή αποτελέσματος..."
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
Write-Host "Άνοιγμα εφάπαξ ενεργοποίησης για το $terminalPos..."
Start-Process $uri.AbsoluteUri
Write-Host "Η εγκατάσταση Store Mode ολοκληρώθηκε."
Write-Host "Shortcut: $shortcut"
Write-Host "Report: $report"
