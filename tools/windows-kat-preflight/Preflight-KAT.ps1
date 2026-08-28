param(
  [string]$ApiBase="https://myworkstation-app.onrender.com",
  [string]$ObserverPath="C:\ProgramData\MyWorkStation\RbsObserver",
  [string]$CapturePath="C:\capture\micrelec"
)
$ErrorActionPreference="Stop"
$checks=New-Object Collections.Generic.List[object]
function Add-Check([string]$Name,[bool]$Ok,[string]$Detail,[string]$Level="BLOCKER"){
  $checks.Add([pscustomobject]@{Name=$Name;Status=if($Ok){"OK"}else{"FAIL"};Level=$Level;Detail=$Detail})
}

$os=[Environment]::OSVersion.VersionString
Add-Check "Windows" ($env:OS -eq "Windows_NT") $os
Add-Check "PowerShell" ($PSVersionTable.PSVersion.Major -ge 5) ("Version "+$PSVersionTable.PSVersion)

try{
  $drive=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  $freeGb=[math]::Round($drive.FreeSpace/1GB,2)
  Add-Check "Free disk" ($freeGb -ge 2) ("$freeGb GB available")
}catch{Add-Check "Free disk" $false $_.Exception.Message}

$browserCandidates=@(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser=@($browserCandidates|Where-Object {$_ -and (Test-Path -LiteralPath $_)})|Select-Object -First 1
Add-Check "Supported browser" ($null -ne $browser) $(if($browser){$browser}else{"Chrome or Edge not found"})

try{
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $health=Invoke-RestMethod -Uri ($ApiBase.TrimEnd("/")+"/api/health") -Method Get -TimeoutSec 20
  Add-Check "MyWorkStation API" ($health.ok -eq $true) ("Connected to "+$ApiBase.TrimEnd("/"))
}catch{Add-Check "MyWorkStation API" $false $_.Exception.Message}

$protected=@("C:\_km","C:\Kiosk Manager","C:\CapDriverService","C:\capture")
$found=@($protected|Where-Object {Test-Path -LiteralPath $_})
Add-Check "Existing fiscal folders detected" ($found.Count -gt 0) $(if($found.Count){$found -join ", "}else{"No known fiscal folders found"}) "WARNING"
Add-Check "Capture path" (Test-Path -LiteralPath $CapturePath) $CapturePath "WARNING"
Add-Check "RBS Observer installed" (Test-Path -LiteralPath (Join-Path $ObserverPath "observer.config.json")) $ObserverPath "WARNING"

$report=@(
  "MYWORKSTATION KAT PILOT PREFLIGHT",
  ("Date: "+(Get-Date -Format "yyyy-MM-dd HH:mm:ss")),
  "Mode: READ ONLY / NO INSTALLATION / NO FISCAL COMMANDS",
  ""
)
$report+=($checks|ForEach-Object {"[{0}] [{1}] {2} - {3}" -f $_.Status,$_.Level,$_.Name,$_.Detail})
$blockers=@($checks|Where-Object {$_.Status -eq "FAIL" -and $_.Level -eq "BLOCKER"})
$report+=""
if($blockers.Count){
  $report+="RESULT: NOT READY ($($blockers.Count) blockers)"
}else{
  $report+="RESULT: SOFTWARE PREFLIGHT READY"
}
$path=Join-Path ([Environment]::GetFolderPath("Desktop")) "MyWorkStation_KAT_Preflight.txt"
$report|Set-Content -LiteralPath $path -Encoding UTF8
$report|ForEach-Object {Write-Host $_}
Write-Host "Report: $path"
if($blockers.Count){exit 1}
exit 0
