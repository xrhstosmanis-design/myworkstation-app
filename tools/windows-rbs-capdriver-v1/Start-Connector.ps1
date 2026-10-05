param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Connector-Tools.ps1')
$mutex = $null
try {
  $config = Read-MwsConnectorConfig $ConfigPath
  $Host.UI.RawUI.WindowTitle = 'MyWorkStation - RBS Connector - ' + $config.storeName
  $mutex = Enter-MwsConnectorLock
  Invoke-MwsConnectionCheck $config $PSScriptRoot
  Write-Host ('Connector: ' + $config.storeName + ' / ' + $config.terminalPos)
  Write-Host 'Κράτησε αυτό το παράθυρο ανοικτό. Το κλείσιμο διακόπτει τη σύνδεση.'
  & (Join-Path $PSScriptRoot 'Writer.ps1') -ApiBase $config.apiBase -DeviceToken '' -WorkFolder $config.workFolder
} catch {
  Write-Host ('STOP: ' + $_.Exception.Message) -ForegroundColor Red
  Read-Host 'Πατήστε Enter για κλείσιμο'
} finally { Exit-MwsConnectorLock $mutex }
