param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Ftext.psm1') -Force
$c=Get-FtextCloudConfig $ConfigPath
while($true) {
    Write-Host ('MyWorkStation ftext / '+$c.storeName+' / '+$c.terminalPos+' / '+$c.serialNumber)
    Write-Host '1. Pair this Windows user'
    Write-Host '2. Check register STATUS and send result'
    if($c.PSObject.Properties['cashEnabled'] -and $c.cashEnabled -eq $true) {Write-Host '3. Start connector (cash requests for this POS)'} else {Write-Host '3. Start cloud connection (communication only)'}
    Write-Host '4. Close setup'
    Write-Host '5. Preview completed STATUS history (connector must be closed)'
    Write-Host '6. Archive verified completed STATUS history (no receipt/payment files)'
    Write-Host '7. Restore the last STATUS history archive'
    if($c.PSObject.Properties['outputVersion'] -and $c.outputVersion -eq 1) {Write-Host '8. Prepare existing OUTPUT history automatically (FTEXT+ and connector closed)'}
    Write-Host '9. Safe STATUS communication recovery (connector CLOSED; no payment resend)'
    $choice=Read-Host 'Select 1-9'
    try {
        switch($choice) {
            '1' { & (Join-Path $PSScriptRoot 'Pair.ps1') -ConfigPath $ConfigPath }
            '2' { & (Join-Path $PSScriptRoot 'Cloud-Test.ps1') -ConfigPath $ConfigPath }
            '3' { Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'Cloud-Connector.ps1')+'"'),'-ConfigPath',('"'+$ConfigPath+'"')) }
            '4' { return }
            '5' { Invoke-FtextStatusMaintenance -ConfigPath $ConfigPath -Mode Plan | Select-Object candidatePairs,acknowledgedPairs,retainedPairs,rejectedPairs,resuming | Format-List }
            '6' { Invoke-FtextStatusMaintenance -ConfigPath $ConfigPath -Mode Apply | Format-List }
            '7' { Invoke-FtextStatusMaintenance -ConfigPath $ConfigPath -Mode Restore | Format-List }
            '8' { Invoke-FtextOutputPreparation -ConfigPath $ConfigPath | Format-List }
            '9' {
                $confirm=Read-Host 'Close the connector first. Type RECOVER to inspect and safely recover only orphan STATUS'
                if($confirm -cne 'RECOVER'){Write-Host 'No changes made.';continue}
                $current=Get-FtextCloudConfig $ConfigPath
                # The scoped status-report queue is immutable until safely acknowledged.
                $pendingReport=(Get-FtextCredentialPath $current)+'.pending-report.json'
                if(Test-Path -LiteralPath $pendingReport){throw 'STOP: pending cloud STATUS acknowledgement; preserve it and use option 2.'}
                Invoke-FtextCloudPing $current | Out-Null
                $recovery=Invoke-FtextOrphanStatusRecovery -ConfigPath $ConfigPath
                Write-Host ('STATUS RECOVERY: '+$recovery.state)
                if($recovery.archivePath){Write-Host ('Original files preserved at: '+$recovery.archivePath)}
                # The existing signed, serialized, nonfiscal STATUS + cloud acknowledgement remains authoritative.
                $ready=Invoke-FtextCloudReadiness -ConfigPath $ConfigPath -TimeoutSeconds 30
                $freshUntil=Get-FtextCloudReadinessRefreshAt
                if(-not $ready -or $freshUntil -le [DateTime]::UtcNow) {
                    throw 'STOP: FTEXT has not supplied fresh acknowledged readiness. No payment was sent.'
                }
                Write-Host 'SUCCESS: verified device STATUS and fresh cloud readiness. No receipt or payment was issued.' -ForegroundColor Green
                Write-Host 'Restart the connector with option 3 and verify that readiness remains available.'
            }
        }
    } catch { Write-Host ('STOP: '+$_.Exception.Message) -ForegroundColor Red }
}
