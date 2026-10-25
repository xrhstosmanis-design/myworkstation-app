param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
$c=Get-FtextCloudConfig $ConfigPath
$sha=[Security.Cryptography.SHA256]::Create()
try { $hash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($c.companyId+'|'+$c.storeId+'|'+$c.terminalPos))).Replace('-','') } finally { $sha.Dispose() }
$mutex=New-Object Threading.Mutex($false,('Global\MyWorkStationFtextCloud_'+$hash));$held=$false
try {
    try { $held=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held=$true }
    if(-not $held) { throw 'The ftext connector is already running for this POS.' }
    Write-Host ('MyWorkStation ftext / '+$c.storeId+' / '+$c.terminalPos)
    $cashEnabled=$c.PSObject.Properties['cashEnabled'] -and $c.cashEnabled -eq $true
    if($cashEnabled) {Write-Host 'Cash connector enabled for this installation. Keep this window open.'} else {Write-Host 'Communication only. Fiscal checkout is not enabled. Keep this window open.'}
    while($true) {
        Invoke-FtextCloudPing $c | Out-Null
        if($cashEnabled) {
            # Recover durable local result first. Neither a network retry nor restart republishes a fiscal file.
            $pending=Get-FtextCashPending $c
            $request=if($pending) {$pending.request} else {$voidRequest=(Invoke-FtextCashApi $c 'void-poll' @{}).request;if($voidRequest){$voidRequest}else{(Invoke-FtextCashApi $c 'cash-poll' @{}).request}}
            if($request) {
                $report=Invoke-FtextCashRequest -ConfigPath $ConfigPath -Request $request
                $endpoint=if($request.PSObject.Properties['kind'] -and [string]$request.kind -ceq 'FTEXT_VOID') {'void-result'} else {'cash-result'}
                $ack=Invoke-FtextCashApi $c $endpoint $report
                if($ack.ok -ne $true -or $ack.status -notin @('CONFIRMED','REQUIRES_CHECK','SALE_COMMITTED')) {throw 'Cash result was not acknowledged. The local evidence was retained.'}
                Complete-FtextCashReport $c ([string]$request.id)
                Write-Host ('Cash request '+$request.id+': '+$ack.status)
            }
        }
        Write-Host ([DateTime]::Now.ToString('HH:mm:ss')+' connected');Start-Sleep -Seconds 5
    }
} finally { if($held) { $mutex.ReleaseMutex() };$mutex.Dispose() }
