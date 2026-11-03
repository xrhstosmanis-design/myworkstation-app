$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
$root=Join-Path ([IO.Path]::GetTempPath()) ('mws-output-cloud-'+[Guid]::NewGuid().ToString('N'))
function Check-OutputCloud($Condition,[string]$Message) {if(-not $Condition) {throw $Message}}
try {
 $folder=Join-Path $root 'input';$null=[IO.Directory]::CreateDirectory($folder)
 $c=[pscustomobject]@{companyId='output-company';storeId='output-store';terminalPos='POS-01';serialNumber='OUTPUT123';settingsHash=('a'*64);workFolder=$folder;apiBase='https://fixture.invalid';configurationId='fixture-config';lifecycleGeneration='0';fiscalDeviceCode='FISCAL-01';protocol='SOLIDUS(II)T';outputVersion=1;cashEnabled=$true}
 $config=Join-Path $root 'config.json';[IO.File]::WriteAllText($config,($c | ConvertTo-Json -Depth 8))
 $id='22222222-2222-4222-8222-222222222222';[IO.File]::WriteAllText((Join-Path $folder ('mws-cash-'+$id+'.report.json')),'retained original')
 foreach($i in 1..3) {[IO.File]::WriteAllText((Join-Path $folder ('mws-status-'+$i.ToString('x32')+'.json')),'retained original')}
 $before=@(Get-ChildItem -LiteralPath $folder -File | ForEach-Object {(Get-FileHash -LiteralPath $_.FullName).Hash})
 & (Get-Module 'Cloud-Tools') {
  param($ConfigPath,$Config,$CashId)
  $script:OutputFixtureConfig=$Config;$script:OutputWrong=$false;$script:OutputDuplicate=$false;$script:OutputCalls=0
  function script:Read-FtextDeviceToken($Config) {return 'fixture-token'}
  function script:Invoke-RestMethod {
   param($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec)
   $script:OutputCalls++;$b=$Body | ConvertFrom-Json
   if($Method -cne 'Post' -or $Headers.Authorization -cne 'Bearer fixture-token' -or $b.requestIds.Count -lt 1) {throw 'Unscoped OUTPUT request.'}
   $c=$script:OutputFixtureConfig
   $reply=[ordered]@{version=1;companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;serialNumber=$c.serialNumber;settingsHash=$c.settingsHash;configurationId=$c.configurationId;lifecycleGeneration=$c.lifecycleGeneration;fiscalExecution=$false;readinessVerified=$false}
   if($script:OutputWrong) {$reply.storeId='foreign'}
   if($Uri.EndsWith('/output-history')) {if($b.requestIds.Count -gt 20) {throw 'Unbounded fiscal history.'};$reply.completed=@([pscustomobject]@{requestId=$b.requestIds[0]})}
   elseif($Uri.EndsWith('/status-history')) {if($b.requestIds.Count -gt 100) {throw 'Unbounded STATUS history.'};$reply.acknowledgedIds=@($b.requestIds);if($script:OutputDuplicate) {$reply.acknowledgedIds=@($b.requestIds[0],$b.requestIds[0])}}
   else {throw 'OUTPUT attempted work/fiscal/readiness action.'}
   return [pscustomobject]$reply
  }
  try {
   $r=Invoke-FtextOutputDiscovery $ConfigPath
   if($r.entries.Count -ne 4 -or $script:OutputCalls -ne 2 -or $r.cashCursor -cne ('mws-cash-'+$CashId+'.report.json')) {throw 'Bounded OUTPUT history did not reconcile.'}
   $script:OutputWrong=$true;$refused=$false;try {Invoke-FtextOutputDiscovery $ConfigPath | Out-Null} catch {$refused=$true};if(-not $refused) {throw 'Foreign history accepted.'}
   $script:OutputWrong=$false;$script:OutputDuplicate=$true;$refused=$false;try {Invoke-FtextOutputDiscovery $ConfigPath | Out-Null} catch {$refused=$true};if(-not $refused) {throw 'Duplicate history accepted.'}
  } finally {Remove-Item Function:script:Invoke-RestMethod,Function:script:Read-FtextDeviceToken -ErrorAction SilentlyContinue}
 } $config $c $id
 $after=@(Get-ChildItem -LiteralPath $folder -File | ForEach-Object {(Get-FileHash -LiteralPath $_.FullName).Hash})
 Check-OutputCloud (($before -join ',') -ceq ($after -join ',')) 'Metadata worker changed input evidence.'
 foreach($name in @('Cloud-Connector.ps1','Cash.psm1','Ftext.psm1')) {Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $root $name)}
 $fake=@'
function Get-FtextCloudConfig($Path) {return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json}
$script:outputFixturePolls=0;$script:outputFixtureWorker=$null
function Invoke-FtextCloudPoll($Config,$Recovering,$StopVersion) {
 if($Recovering) {throw 'Read-only OUTPUT worker blocked fiscal claims.'}
 $script:outputFixturePolls++
 [IO.File]::AppendAllText(($Config.workFolder+'.log'),'poll'+[Environment]::NewLine)
 if($script:outputFixturePolls -eq 3 -and $script:outputFixtureWorker) {$script:outputFixtureWorker.Async.IsCompleted=$true}
 return @{request=$null;lateReceipt=$null;errorEvidence=$null}
}
function Start-FtextCloudReadiness($Path) {return [pscustomobject]@{Async=@{IsCompleted=$true}}}
function Receive-FtextCloudReadiness($Worker) {$Worker | Add-Member -NotePropertyName RefreshAt -NotePropertyValue ([DateTime]::UtcNow.AddSeconds(10)) -Force;return $true}
function Stop-FtextCloudReadiness($Worker) {}
function Start-FtextOutputDiscovery($Path,$Cash,$Status) {$script:outputFixtureWorker=[pscustomobject]@{Async=@{IsCompleted=$false}};return $script:outputFixtureWorker}
function Receive-FtextOutputDiscovery($Worker) {return [pscustomobject]@{cashCursor='cash';statusCursor='status';entries=@([pscustomobject]@{kind='STATUS';proof=@{requestId=('1'*32)}})}}
function Invoke-FtextCloudOutputArchive($Config,$Kind,$Proof) {[IO.File]::AppendAllText(($Config.workFolder+'.log'),'move'+[Environment]::NewLine);return @{movedFiles=2}}
Export-ModuleMember -Function Get-FtextCloudConfig,Invoke-FtextCloudPoll,Start-FtextCloudReadiness,Receive-FtextCloudReadiness,Stop-FtextCloudReadiness,Start-FtextOutputDiscovery,Receive-FtextOutputDiscovery,Invoke-FtextCloudOutputArchive
'@
 [IO.File]::WriteAllText((Join-Path $root 'Cloud-Tools.psm1'),$fake)
 $script:outputFixtureCycles=0
 $stopped=$false
 try {
  & {param($Production,$ConfigPath)
   function Start-Sleep {param($Seconds);$script:outputFixtureCycles++;if($script:outputFixtureCycles -ge 5) {throw 'OUTPUT_FIXTURE_DONE'}}
   & $Production -ConfigPath $ConfigPath
  } (Join-Path $root 'Cloud-Connector.ps1') $config
 } catch {$stopped=$_.Exception.Message -like '*OUTPUT_FIXTURE_DONE*'}
 Check-OutputCloud $stopped 'Actual loop did not complete its fixture cycles.'
 $log=@(Get-Content -LiteralPath ($folder+'.log'))
 Check-OutputCloud (@($log | Where-Object {$_ -ceq 'poll'}).Count -eq 5) 'Metadata discovery stopped heartbeat/work polling.'
 Check-OutputCloud (@($log | Where-Object {$_ -ceq 'move'}).Count -eq 1) 'Joined output was not moved once during idle work window.'
 Write-Host 'OUTPUT cloud smoke PASS: bounded authenticated metadata, foreign/duplicate refusal, untouched input and actual loop polling during asynchronous discovery.'
} finally {if(Test-Path -LiteralPath $root) {Remove-Item -LiteralPath $root -Recurse -Force}}
