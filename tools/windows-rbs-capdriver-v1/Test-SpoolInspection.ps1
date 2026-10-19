$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'Inspect-Spool.ps1'
$tokens = $null
$errors = $null
[Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$tokens,[ref]$errors) | Out-Null
if ($errors.Count) { throw ($errors | Out-String) }
$root = Join-Path ([IO.Path]::GetTempPath()) ('mws-spool-test-' + [guid]::NewGuid().ToString('N'))
$spool = Join-Path $root 'capture'
New-Item -ItemType Directory -Path $spool -Force | Out-Null
function Assert-True($Value,[string]$Message) { if (-not $Value) { throw $Message } }
try {
  $emptyReport = Join-Path $root 'empty.json'
  & $scriptPath -CompanyId 'isolated-company' -StoreId 'isolated-store' -TerminalPos 'FIXTURE-02' -WorkFolder $spool -ReportPath $emptyReport | Out-Null
  $empty = Get-Content -LiteralPath $emptyReport -Raw | ConvertFrom-Json
  Assert-True ($empty.format -eq 'MWS_CAP_SPOOL_OBSERVATION_V1' -and $empty.terminalPos -eq 'FIXTURE-02') 'Explicit diagnostic scope lost.'
  Assert-True ($empty.samples.Count -eq 2 -and $empty.samples[0].fileCount -eq 0 -and $empty.unchangedBetweenSamples) 'Empty observation differs.'
  Assert-True (-not $empty.readyForDeletion -and -not $empty.cloudDrainVerified -and -not $empty.offlineDevicesAccountedFor) 'Observation falsely authorizes cleanup.'
  $command = Join-Path $spool 'rbs.fixture.txt'
  $legacy = Join-Path $spool 'unknown-legacy-command.txt'
  $temporary = Join-Path $spool '.rbs.fixture.tmp'
  foreach ($path in @($command,$legacy,$temporary)) { [IO.File]::WriteAllText($path,'SECRET_FIXTURE_NEVER_DISPATCH') }
  New-Item -ItemType Directory -Path (Join-Path $spool 'unreviewed-subfolder') | Out-Null
  $before = @($command,$legacy,$temporary | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash })
  $pendingReport = Join-Path $root 'pending.json'
  & $scriptPath -CompanyId 'isolated-company' -StoreId 'isolated-store' -TerminalPos 'FIXTURE-01' -WorkFolder $spool -ReportPath $pendingReport | Out-Null
  $json = Get-Content -LiteralPath $pendingReport -Raw
  $pending = $json | ConvertFrom-Json
  Assert-True ($pending.samples[1].fileCount -eq 3 -and $pending.samples[1].directoryCount -eq 1 -and $pending.samples[1].rbsCommandFileCount -eq 1 -and $pending.samples[1].temporaryFileCount -eq 1 -and $pending.samples[1].otherFileCount -eq 1) 'Legacy or temporary entry was hidden.'
  Assert-True ($json -notmatch 'SECRET_FIXTURE|rbs.fixture|unknown-legacy-command|unreviewed-subfolder') 'Report exported file contents or names.'
  $after = @($command,$legacy,$temporary | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash })
  Assert-True (($before -join ',') -eq ($after -join ',')) 'Read-only inspection changed a command.'
  $savedHash = (Get-FileHash -LiteralPath $pendingReport).Hash
  $refused = $false
  try { & $scriptPath -TerminalPos 'FIXTURE-01' -WorkFolder $spool -ReportPath $pendingReport | Out-Null } catch { $refused = $true }
  Assert-True ($refused -and (Get-FileHash -LiteralPath $pendingReport).Hash -eq $savedHash) 'Existing report was overwritten.'
  $inside = Join-Path $spool 'forbidden-report.json'
  $refused = $false
  try { & $scriptPath -TerminalPos 'FIXTURE-01' -WorkFolder $spool -ReportPath $inside | Out-Null } catch { $refused = $true }
  Assert-True ($refused -and -not (Test-Path -LiteralPath $inside)) 'Inspection wrote inside the physical CAP folder.'
  Write-Host 'Spool inspection Windows PASS: actual collector, empty/pending/legacy/subfolder observations, no contents or names, commands unchanged, no overwrite, no CAP-folder writes, no reset-clearance assertion.'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
