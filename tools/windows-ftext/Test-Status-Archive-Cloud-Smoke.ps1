$ErrorActionPreference='Stop'
$module=Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force -PassThru | Where-Object {$_.Path -ieq (Join-Path $PSScriptRoot 'Cloud-Tools.psm1')} | Select-Object -First 1
$root=Join-Path ([IO.Path]::GetTempPath()) ('mws-status-history-cloud-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $root
try {
 $c=[pscustomobject]@{companyId='history-company';storeId='history-store';terminalPos='POS-01';serialNumber='HISTORY123';workFolder='C:\FText';settingsHash=('a'*64);apiBase='https://fixture.invalid';fiscalDeviceCode='FISCAL-01';protocol='SOLIDUS(II)T';configurationId='fixture-configuration';lifecycleGeneration='0'}
 $config=Join-Path $root 'config.json';$c | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
 $ids=@(('1'*32),('2'*32))
 $ack=[pscustomobject]@{version=1;companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;serialNumber=$c.serialNumber;settingsHash=$c.settingsHash;configurationId=$c.configurationId;lifecycleGeneration=$c.lifecycleGeneration;settings=$c;acknowledgedIds=$ids;fiscalExecution=$false;fiscalCheckoutEnabled=$false;readinessVerified=$false}
 & $module {
  param($Ids)
  $script:HistoryFixtureIds=$Ids;$script:HistoryFixtureModes=New-Object 'Collections.Generic.List[string]';$script:HistoryFixtureCalls=0
  function script:Read-FtextDeviceToken($Config) {'fixture-not-a-real-token'}
  function script:Invoke-FtextStatusArchive {
   param($ConfigPath,$Mode,$AcknowledgedIds)
   $script:HistoryFixtureModes.Add([string]$Mode)
   if($Mode -ceq 'Plan') {return [pscustomobject]@{candidateIds=$script:HistoryFixtureIds}}
   if($Mode -ceq 'Apply' -and (@($AcknowledgedIds).Count -ne 2 -or $AcknowledgedIds[0] -cne $script:HistoryFixtureIds[0])) {throw 'Fixture did not receive validated acknowledgements.'}
   return [pscustomobject]@{mode=$Mode}
  }
  function script:Invoke-RestMethod {
   param($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec)
   if($Method -cne 'Post' -or $Uri -cne 'https://fixture.invalid/api/ftext/v1/device/status-history' -or $Headers.Authorization -cne 'Bearer fixture-not-a-real-token' -or @((ConvertFrom-Json $Body).requestIds).Count -ne 2) {throw 'Unexpected history HTTP request.'}
   $script:HistoryFixtureCalls++
   return $script:HistoryFixtureAck
  }
 } $ids
 function Set-HistoryFixture($Response) {& $module {param($Value);$script:HistoryFixtureAck=$Value;$script:HistoryFixtureModes.Clear();$script:HistoryFixtureCalls=0} $Response}
 Set-HistoryFixture $ack
 $r=Invoke-FtextStatusMaintenance -ConfigPath $config -Mode Apply
 if($r.mode -cne 'Apply') {throw 'Validated archive was not reached.'}
 foreach($change in @(
  @{storeId='foreign-store'},@{serialNumber='FOREIGN'},@{settingsHash=('b'*64)},@{lifecycleGeneration='1'},
  @{acknowledgedIds=@(('3'*32))},@{acknowledgedIds=@($ids[0],$ids[0])},@{readinessVerified=$true},@{readinessVerified=0},@{fiscalExecution=$true},@{version=2}
 )) {
  $bad=$ack | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  foreach($key in $change.Keys) {$bad.$key=$change[$key]}
  Set-HistoryFixture $bad;$failed=$false
  try {Invoke-FtextStatusMaintenance -ConfigPath $config -Mode Apply | Out-Null} catch {$failed=$true}
  $modes=& $module {$script:HistoryFixtureModes.ToArray()}
  if(-not $failed -or @($modes | Where-Object {$_ -ceq 'Apply'}).Count -ne 0) {throw 'Invalid acknowledgement reached archive mutation.'}
 }
 $bad=$ack | ConvertTo-Json -Depth 8 | ConvertFrom-Json;$bad.settings.workFolder='C:\Foreign'
 Set-HistoryFixture $bad;$failed=$false
 try {Invoke-FtextStatusMaintenance -ConfigPath $config -Mode Apply | Out-Null} catch {$failed=$true}
 if(-not $failed) {throw 'Changed signed folder reached archive mutation.'}
 Set-HistoryFixture $null
 $r=Invoke-FtextStatusMaintenance -ConfigPath $config -Mode Restore
 $calls=& $module {$script:HistoryFixtureCalls}
 if($r.mode -cne 'Restore' -or $calls -ne 0) {throw 'Local rollback required cloud availability.'}
 Write-Host 'PASS: history HTTP binding, scoped signed settings, malformed/foreign/duplicate acknowledgement refusal before mutation and offline rollback.'
} finally {
 Remove-Module Cloud-Tools -Force
 Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
 Remove-Item -LiteralPath $root -Recurse -Force
}
