param([switch]$DryRun)
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
$stateChecksum=(Get-FileHash -LiteralPath $stateFile -Algorithm SHA256).Hash.ToLowerInvariant()
$shortcutChecksum=if(Test-Path -LiteralPath $shortcut){(Get-FileHash -LiteralPath $shortcut -Algorithm SHA256).Hash.ToLowerInvariant()}else{"MISSING"}
$recoveryRoot=Join-Path $env:ProgramData "MyWorkStation\RecoveryBackups"
if(!$DryRun){
  New-Item -ItemType Directory -Path $recoveryRoot -Force|Out-Null
  if(Test-Path -LiteralPath $shortcut){
    $stamp=Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item -LiteralPath $shortcut -Destination (Join-Path $recoveryRoot ($safeName+"-before-recovery-"+$stamp+".url")) -Force
  }
  $temp=Join-Path $env:TEMP ("mws-kat-recovery-"+[guid]::NewGuid().ToString("N")+".url")
  @("[InternetShortcut]","URL="+$uri.AbsoluteUri,"IconFile=%SystemRoot%\System32\SHELL32.dll","IconIndex=14")|Set-Content -LiteralPath $temp -Encoding ASCII
  Move-Item -LiteralPath $temp -Destination $shortcut -Force
}

$report=Join-Path ([Environment]::GetFolderPath("Desktop")) "MyWorkStation_KAT_Recovery.txt"
@(
  "MYWORKSTATION KAT STORE MODE RECOVERY",
  "Date: "+(Get-Date -Format "yyyy-MM-dd HH:mm:ss"),
  "Store Mode: "+$uri.AbsoluteUri,
  "Terminal: "+([string]$state.terminalPos),
  "Installation schema: "+([string]$state.schemaVersion),
  "App revision: "+([string]$state.appRevision),
  "State SHA-256: "+$stateChecksum,
  "Previous shortcut SHA-256: "+$shortcutChecksum,
  "Shortcut: "+$shortcut,
  "Mode: "+$(if($DryRun){"DRY RUN / NO SHORTCUT CHANGE"}else{"CONTROLLED RECOVERY"}),
  "Result: "+$(if($DryRun){"DRY_RUN_PASSED"}else{"SHORTCUT_RECOVERED"}),
  "Rollback checkpoint: "+$(if($shortcutChecksum -eq "MISSING"){"NO PREVIOUS SHORTCUT"}else{"PREVIOUS SHORTCUT BACKUP REQUIRED"}),
  "Next manual action: "+$(if($DryRun){"Run RECOVER_KAT.cmd only inside the approved maintenance window."}else{"Open Store Mode and confirm health/login without fiscal test."}),
  "Safety: NO RBS / NO KIOSK MANAGER / NO CAPDRIVER CHANGES"
)|Set-Content -LiteralPath $report -Encoding UTF8
Write-Host $(if($DryRun){"Το recovery dry-run πέρασε χωρίς αλλαγή συντόμευσης."}else{"Η συντόμευση Store Mode ανακτήθηκε με ασφάλεια."})
Write-Host "Report: $report"
