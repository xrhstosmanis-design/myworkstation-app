param(
  [string]$ApiBase="https://myworkstation.gr",
  [string]$WatchPath="C:\capture\micrelec",
  [switch]$ForInstall
)
$ErrorActionPreference="Stop"
$results=New-Object Collections.Generic.List[object]
function Add-Check([string]$Name,[bool]$Ok,[string]$Detail){
  $results.Add([pscustomobject]@{Check=$Name;Status=if($Ok){"OK"}else{"FAIL"};Detail=$Detail})
}

$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Add-Check "Administrator" $isAdmin $(if($isAdmin){"Elevated session"}else{"Run the installer as administrator"})
Add-Check "PowerShell" ($PSVersionTable.PSVersion.Major -ge 5) ("Version "+$PSVersionTable.PSVersion)
Add-Check "Observation path" (Test-Path -LiteralPath $WatchPath) $WatchPath

$protected=@("C:\_km","C:\Kiosk Manager","C:\CapDriverService","C:\capture")
$found=@($protected|Where-Object {Test-Path -LiteralPath $_})
Add-Check "KAT protected folders" ($found.Count -gt 0) $(if($found.Count){$found -join ", "}else{"No known KAT folder found"})

try{
  $drive=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  $freeGb=[math]::Round($drive.FreeSpace/1GB,2)
  Add-Check "Free disk" ($freeGb -ge 1) ("$freeGb GB available")
}catch{Add-Check "Free disk" $false $_.Exception.Message}

try{
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $health=Invoke-RestMethod -Uri ($ApiBase.TrimEnd("/")+"/api/health") -Method Get -TimeoutSec 20
  Add-Check "MyWorkStation API" ($health.ok -eq $true) ("Connected to "+$ApiBase.TrimEnd("/"))
}catch{Add-Check "MyWorkStation API" $false $_.Exception.Message}

$report=@("MYWORKSTATION OBSERVER PRECHECK",("Date: "+(Get-Date -Format "yyyy-MM-dd HH:mm:ss")),"Mode: READ ONLY / NO FISCAL COMMANDS","")
$report+=($results|ForEach-Object {"[{0}] {1} - {2}" -f $_.Status,$_.Check,$_.Detail})
$failed=@($results|Where-Object {$_.Status -eq "FAIL"})
$report+=""
if($failed.Count){
  $report+="RESULT: NOT READY ($($failed.Count) checks failed)"
}else{
  $report+="RESULT: READY FOR READ-ONLY OBSERVER INSTALLATION"
}
$reportPath=Join-Path ([Environment]::GetFolderPath("Desktop")) "MyWorkStation_Observer_Precheck.txt"
$report|Set-Content -LiteralPath $reportPath -Encoding UTF8
$report|ForEach-Object {Write-Host $_ -ForegroundColor $(if($_ -like "[FAIL]*"){"Red"}elseif($_ -like "[OK]*" -or $_ -like "RESULT: READY*"){"Green"}else{"White"})}
Write-Host "Report: $reportPath"
if($ForInstall -and $failed.Count){exit 1}
