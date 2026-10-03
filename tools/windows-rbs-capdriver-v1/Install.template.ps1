param([ValidateSet('MENU','PREPARE')][string]$Action = 'MENU')
$ErrorActionPreference = 'Stop'
$config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__CONFIG_BASE64__')) | ConvertFrom-Json
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__FILES_BASE64__')) | ConvertFrom-Json
$directory = Join-Path $env:LOCALAPPDATA ('MyWorkStation\RbsCapDriverV1\packages\' + $config.storeId)
New-Item -ItemType Directory -Path $directory -Force | Out-Null
foreach ($file in $payload.PSObject.Properties) {
  if ($file.Name -notin @('Pair.ps1','Test-Connection.ps1','Writer.ps1')) { throw 'Unexpected package file.' }
  [IO.File]::WriteAllBytes((Join-Path $directory $file.Name), [Convert]::FromBase64String([string]$file.Value))
}
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'installation.json') -Encoding UTF8
Write-Host ('MyWorkStation - ' + $config.storeName + ' / ' + $config.terminalPos)
Write-Host ('RBS folder: ' + $config.workFolder)
Write-Host ('Package revision: ' + $config.revision)
Write-Host 'No pairing code or device token is included in this package.'
if ($Action -eq 'PREPARE') { Write-Host 'PREPARED ONLY: no network call, pairing, writer or fiscal command.'; return }

while ($true) {
  Write-Host ''
  Write-Host '1 - Pair on the final POS computer (one-time code from BackOffice)'
  Write-Host '2 - Test connection without sending a receipt'
  Write-Host '3 - Start Writer on the final POS computer (keep this window open)'
  Write-Host '0 - Exit'
  $choice = Read-Host 'Choose'
  try {
    switch ($choice) {
      '0' { return }
      '1' {
        Write-Host ('Target store: ' + $config.storeName + ' [' + $config.storeId + ']')
        if ((Read-Host 'On the final POS Windows user? Type POS to continue') -ne 'POS') { continue }
        & (Join-Path $directory 'Pair.ps1') -ApiBase $config.apiBase -ExpectedStoreId $config.storeId
      }
      '2' {
        & (Join-Path $directory 'Test-Connection.ps1') -ApiBase $config.apiBase -WorkFolder $config.workFolder -ExpectedStoreId $config.storeId
      }
      '3' {
        & (Join-Path $directory 'Test-Connection.ps1') -ApiBase $config.apiBase -WorkFolder $config.workFolder -ExpectedStoreId $config.storeId
        Write-Host 'Writer may claim pending transactions. Check RBS/EFTPOS and close any other Writer first.'
        if ((Read-Host 'Type START to start Writer') -ne 'START') { continue }
        & (Join-Path $directory 'Writer.ps1') -ApiBase $config.apiBase -WorkFolder $config.workFolder
      }
      default { Write-Host 'Choose 0, 1, 2 or 3.' }
    }
  } catch { Write-Host ('STOP: ' + $_.Exception.Message) -ForegroundColor Red }
}
