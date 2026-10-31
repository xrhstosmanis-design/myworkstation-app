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
    $recheckAttempted=@{}
    $nextReadiness=[DateTime]::MinValue
    while($true) {
      $connected=$false
      try {
        Invoke-FtextCloudPing $c | Out-Null
        $connected=$true
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
            if(-not $request) {
                # Read the original result only; never republish a cash/card command after timeout.
                $late=(Invoke-FtextCashApi $c 'late-receipt-poll' @{}).request
                if($late) {
                    $proof=$null
                    try {$proof=Read-FtextLateReceiptEvidence $c $late} catch { }
                    if($proof) {
                        $accepted=Invoke-FtextCashApi $c 'late-receipt-result' $proof
                        if($accepted.ok -ne $true -or [string]$accepted.requestId -cne [string]$late.id -or $accepted.status -notin @('CONFIRMED','SALE_COMMITTED') -or $accepted.allowResend -ne $false) {throw 'Original receipt was not acknowledged.'}
                        Write-Host ('Original receipt recovered: '+$accepted.status+'. No new receipt or payment was sent.')
                    }
                }
                $recheck=(Invoke-FtextCashApi $c 'error-evidence-poll' @{}).request
                if($recheck -and (-not $recheckAttempted.ContainsKey([string]$recheck.id) -or [DateTime]$recheckAttempted[[string]$recheck.id] -le [DateTime]::UtcNow)) {
                    $evidence=$null
                    try {$evidence=Read-FtextLateErrorEvidence $c $recheck} catch {
                        $recheckAttempted[[string]$recheck.id]=[DateTime]::UtcNow.AddSeconds(15)
                        Write-Host 'Original error files could not be verified. No payment or cancellation was sent.'
                    }
                    if($evidence) {
                        $accepted=Invoke-FtextCashApi $c 'error-evidence-result' $evidence
                        if($accepted.ok -ne $true -or [string]$accepted.requestId -cne [string]$recheck.id -or [string]$accepted.evidenceHash -notmatch '^[a-f0-9]{64}$' -or [string]$accepted.status -cne 'REQUIRES_CHECK') {throw 'Original error evidence was not acknowledged.'}
                        $recheckAttempted[[string]$recheck.id]=[DateTime]::UtcNow.AddMinutes(5)
                        Write-Host 'Original error evidence delivered. No payment or cancellation was sent.'
                    }
                }
                if(-not $late -and -not $recheck -and [DateTime]::UtcNow -ge $nextReadiness) {
                    $nextReadiness=[DateTime]::UtcNow.AddSeconds(10)
                    $ready=Invoke-FtextCloudReadiness $ConfigPath
                    if($ready) {Write-Host 'Register ready: verified nonfiscal STATUS.'} else {Write-Host 'Register is not ready. No payment was sent.'}
                }
            }
        }
      } catch {
        $connected=$false
        Write-Host 'Connection or recovery pending. Original files retained; retrying without resending payment.'
      }
      if($connected) {Write-Host ([DateTime]::Now.ToString('HH:mm:ss')+' connector connected')}
      Start-Sleep -Seconds 5
    }
} finally { if($held) { $mutex.ReleaseMutex() };$mutex.Dispose() }
