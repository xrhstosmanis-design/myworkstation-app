param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
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
    $choice=Read-Host 'Select 1-8'
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
        }
    } catch { Write-Host ('STOP: '+$_.Exception.Message) -ForegroundColor Red }
}
