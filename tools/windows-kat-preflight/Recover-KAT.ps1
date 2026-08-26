param()
$ErrorActionPreference="Stop"
$stateFile=Join-Path $env:ProgramData "MyWorkStation\KAT\store-mode-installation.json"
if(!(Test-Path -LiteralPath $stateFile)){throw "Δεν βρέθηκε έγκυρο KAT installation state. Εκτέλεσε πρώτα το INSTALL_KAT.cmd."}

$state=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
$uri=$null
if(@(1,2) -notcontains [int]$state.schemaVersion -or ![Uri]::TryCreate([string]$state.storeModeUrl,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne "https" -or $uri.AbsolutePath -notmatch '^/store/[^/]+/?$' -or $uri.Query){
  throw "Το αποθηκευμένο Store Mode URL δεν είναι ασφαλές. Η ανάκτηση σταμάτησε χωρίς αλλαγές."
}
$desktop=[Environment]::GetFolderPath("CommonDesktopDirectory")
if(!$desktop -or !(Test-Path -LiteralPath $desktop)){$desktop=[Environment]::GetFolderPath("Desktop")}
$safeName=([string]$state.shortcutName -replace '[\\/:*?"<>|]','-').Trim()
if(!$safeName){throw "Το αποθηκευμένο όνομα συντόμευσης δεν είναι έγκυρο."}
$shortcut=Join-Path $desktop ($safeName+".url")
$recoveryRoot=Join-Path $env:ProgramData "MyWorkStation\RecoveryBackups"
New-Item -ItemType Directory -Path $recoveryRoot -Force|Out-Null
if(Test-Path -LiteralPath $shortcut){
  $stamp=Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item -LiteralPath $shortcut -Destination (Join-Path $recoveryRoot ($safeName+"-before-recovery-"+$stamp+".url")) -Force
}
$temp=Join-Path $env:TEMP ("mws-kat-recovery-"+[guid]::NewGuid().ToString("N")+".url")
@("[InternetShortcut]","URL="+$uri.AbsoluteUri,"IconFile=%SystemRoot%\System32\SHELL32.dll","IconIndex=14")|Set-Content -LiteralPath $temp -Encoding ASCII
Move-Item -LiteralPath $temp -Destination $shortcut -Force

$report=Join-Path ([Environment]::GetFolderPath("Desktop")) "MyWorkStation_KAT_Recovery.txt"
@(
  "MYWORKSTATION KAT STORE MODE RECOVERY",
  "Date: "+(Get-Date -Format "yyyy-MM-dd HH:mm:ss"),
  "Store Mode: "+$uri.AbsoluteUri,
  "Terminal: "+([string]$state.terminalPos),
  "Shortcut: "+$shortcut,
  "Result: SHORTCUT RECOVERED",
  "Safety: NO RBS / NO KIOSK MANAGER / NO CAPDRIVER CHANGES"
)|Set-Content -LiteralPath $report -Encoding UTF8
Write-Host "Η συντόμευση Store Mode ανακτήθηκε με ασφάλεια."
Write-Host "Report: $report"
