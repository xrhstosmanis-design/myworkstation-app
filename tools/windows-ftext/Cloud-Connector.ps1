param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
$c=Get-FtextCloudConfig $ConfigPath
$sha=[Security.Cryptography.SHA256]::Create()
try { $hash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($c.companyId+'|'+$c.storeId+'|'+$c.terminalPos))).Replace('-','') } finally { $sha.Dispose() }
$mutex=New-Object Threading.Mutex($false,('Global\MyWorkStationFtextCloud_'+$hash));$held=$false
try {
    try { $held=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held=$true }
    if(-not $held) { throw 'The ftext connector is already running for this POS.' }
    Write-Host ('MyWorkStation ftext / '+$c.storeId+' / '+$c.terminalPos)
    Write-Host 'Communication only. Fiscal checkout is not enabled. Keep this window open.'
    while($true) { Invoke-FtextCloudPing $c | Out-Null; Write-Host ([DateTime]::Now.ToString('HH:mm:ss')+' connected');Start-Sleep -Seconds 5 }
} finally { if($held) { $mutex.ReleaseMutex() };$mutex.Dispose() }
