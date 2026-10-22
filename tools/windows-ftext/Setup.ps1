param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
$c=Get-FtextCloudConfig $ConfigPath
while($true) {
    Write-Host ('MyWorkStation ftext / '+$c.storeName+' / '+$c.terminalPos+' / '+$c.serialNumber)
    Write-Host '1. Pair this Windows user'
    Write-Host '2. Check register STATUS and send result'
    Write-Host '3. Start cloud connection (communication only)'
    Write-Host '4. Close setup'
    $choice=Read-Host 'Select 1-4'
    try {
        switch($choice) {
            '1' { & (Join-Path $PSScriptRoot 'Pair.ps1') -ConfigPath $ConfigPath }
            '2' { & (Join-Path $PSScriptRoot 'Cloud-Test.ps1') -ConfigPath $ConfigPath }
            '3' { Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'Cloud-Connector.ps1')+'"'),'-ConfigPath',('"'+$ConfigPath+'"')) }
            '4' { return }
        }
    } catch { Write-Host ('STOP: '+$_.Exception.Message) -ForegroundColor Red }
}
