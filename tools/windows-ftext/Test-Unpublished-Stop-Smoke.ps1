$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
function AssertStop([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function RefuseStop([scriptblock]$Action){$refused=$false;try{& $Action | Out-Null}catch{$refused=$true};AssertStop $refused 'Unsafe terminal stop was accepted'}
function StopHash([byte[]]$Bytes){$sha=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
$root=Join-Path ([IO.Path]::GetTempPath()) ('ftext-unpublished-stop-'+[Guid]::NewGuid().ToString('N'))
$oldLog=$env:MWS_FTEXT_STOP_LOG
New-Item -ItemType Directory -Path $root | Out-Null
function New-StopFixture([string]$Method){
 $folder=Join-Path $root ([Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $folder | Out-Null
 $c=[pscustomobject]@{companyId='fixture-company';storeId='fixture-store';terminalPos='POS-01';fiscalDeviceCode='FISCAL-01';serialNumber='TEST12345';workFolder=$folder;settingsHash=('a'*64);configurationId=[Guid]::NewGuid().ToString();protocol='SOLIDUS(II)T';lifecycleGeneration='0';apiBase='https://fixture.invalid';cashEnabled=$true;cashDepartments=@([pscustomobject]@{department=4;vatRate=13;vatCode='2'});cardEnabled=$true;cardPayment=[pscustomobject]@{code=2;posTerminalId=1;transactionType=$(if($Method -ceq 'CARD-STRICT'){6}else{1});resultFormat=$(if($Method -ceq 'CARD-STRICT'){'POS_LINE8_OS7'}else{'OPERATOR_CONFIRMATION'});confirmed=$true}}
 $scope=[pscustomobject]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;fiscalDeviceCode=$c.fiscalDeviceCode}
 $r=[pscustomobject]@{id=[Guid]::NewGuid().ToString();settingsHash=$c.settingsHash;scope=$scope;serialNumber=$c.serialNumber;plan=[pscustomobject]@{schemaVersion='MWS_FTEXT_SALE_PLAN_V1';configurationId=$c.configurationId;settingsHash=$c.settingsHash;scope=$scope;total='1.25';payment=[pscustomobject]@{method=$(if($Method -ceq 'CASH'){'CASH'}else{'CARD'});code=$(if($Method -ceq 'CASH'){1}else{2});amount='1.25'};lines=@([pscustomobject]@{description='SYNTHETIC';quantity='1.000';unitPrice='1.25';discount='0.00';lineTotal='1.25';department='4';vatRate='13.00';vatCode='2'})}}
 $prefix=Join-Path $folder ('mws-cash-'+$r.id);$digest=StopHash (New-FtextCashCommand $c $r ($prefix+'.res'))
 $r | Add-Member NoteProperty handoff ([pscustomobject]@{version=1;nonce=[Guid]::NewGuid().ToString();commandHash=$digest;stopVersion=1})
 $path=Join-Path $folder 'config.json';[IO.File]::WriteAllText($path,($c | ConvertTo-Json -Depth 16),(New-Object Text.UTF8Encoding($false)))
 return @{config=$c;request=$r;path=$path;prefix=$prefix;digest=$digest;active=(Join-Path $folder '.mws-ftext-cash.json')}
}
function Set-StopCloudMock($F,[string]$Mode){
 $state=@{calls=0;mode=$Mode;requestId=$F.request.id;settingsHash=$F.config.settingsHash;nonce=$F.request.handoff.nonce;digest=$F.digest}
 & (Get-Command Invoke-FtextCloudHandoff).Module {
  param($state)
  $script:stopState=$state
  function script:Invoke-FtextCashApi($Config,[string]$Action,$Body){
   if($Action -cne 'cash-handoff-accept' -or $Body.requestId -cne $script:stopState.requestId -or $Body.commandHash -cne $script:stopState.digest){throw 'Wrong original stop RPC'}
   $script:stopState.calls++
   if($script:stopState.mode -ceq 'LOST' -and $script:stopState.calls -eq 1){throw 'Synthetic lost terminal acknowledgement'}
   $ack=@{ok=$true;version=1;requestId=$Body.requestId;settingsHash=$Body.settingsHash;nonce=$Body.nonce;commandHash=$Body.commandHash;state='STOPPED';authorization=$null;requiresReadiness=$false;allowResend=$false;stop=@{version=1;id=('b'*64);at='2026-10-31T12:00:00.000Z';nonce=$Body.nonce;commandHash=$Body.commandHash}}
   if($script:stopState.mode -ceq 'FOREIGN'){$ack.stop.nonce=[Guid]::NewGuid().ToString()}
   if($script:stopState.mode -ceq 'AUTHORIZED'){$ack.authorization=@{id=$Body.nonce}}
   return $ack
  }
  function script:Invoke-FtextCloudReadiness($ConfigPath){throw 'Terminal stop must not request STATUS or another authorization'}
 } $state
 return $state
}
$callback={param($job,$digest,$path);Invoke-FtextCloudHandoff -ConfigPath $path -Request $job -CommandHash $digest}
try{
 # Capability must be requested by the new loop AND backed by its Cash module.
 $f=New-StopFixture 'CASH';$negotiation=@{config=$f.config;body=$null}
 & (Get-Command Invoke-FtextCloudPoll).Module {
  param($state)
  $script:negotiation=$state
  function script:Read-FtextDeviceToken($Config){return 'synthetic-token'}
  function script:Invoke-RestMethod($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec){
   $script:negotiation.body=$Body | ConvertFrom-Json;$c=$script:negotiation.config
   return [pscustomobject]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;settingsHash=$c.settingsHash;settings=$c;fiscalCheckoutEnabled=$false;request=$null;lateReceipt=$null;errorEvidence=$null}
  }
 } $negotiation
 Invoke-FtextCloudPoll $f.config $false | Out-Null
 AssertStop (-not $negotiation.body.PSObject.Properties['handoffStopVersion']) 'Old loop implicitly advertised terminal stop'
 Invoke-FtextCloudPoll $f.config $false 1 | Out-Null
 AssertStop ($negotiation.body.handoffStopVersion -eq 1) 'Matching new loop/Cash did not negotiate terminal stop'
 Remove-Module Cloud-Tools -Force
 Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force;Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
 foreach($method in @('CASH','CARD-OPERATOR','CARD-STRICT')){foreach($mode in @('NORMAL','LOST','CRASH')){
  Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force;Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
  $f=New-StopFixture $method;$state=Set-StopCloudMock $f $mode
  if($mode -ceq 'CRASH'){
   & (Get-Command Invoke-FtextCashRequest).Module {
    $script:stopOriginalDurable=(Get-Command Write-FtextCashDurable).ScriptBlock
    function script:Write-FtextCashDurable([string]$Path,$Value){& $script:stopOriginalDurable $Path $Value;if($Path.EndsWith('.stop.json')){throw 'Synthetic crash after terminal stop flush'}}
   }
  }
  if($mode -cne 'NORMAL'){RefuseStop {Invoke-FtextCashRequest -ConfigPath $f.path -Request $f.request -TimeoutSeconds 1 -AcceptHandoff $callback};AssertStop (Test-Path -LiteralPath $f.active) 'Lost acknowledgement removed the original active marker';Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force}
  $report=Invoke-FtextCashRequest -ConfigPath $f.path -Request $f.request -TimeoutSeconds 1 -AcceptHandoff $callback
  AssertStop ($report.outcome -ceq 'STOPPED_BEFORE_EXECUTION' -and $report.stopId -ceq ('b'*64)) 'Original terminal stop was not recovered'
  $intentHash=StopHash ([IO.File]::ReadAllBytes($f.prefix+'.intent.json'));$stopHash=StopHash ([IO.File]::ReadAllBytes($f.prefix+'.stop.json'));$calls=$state.calls
  Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
  $replay=Invoke-FtextCashRequest -ConfigPath $f.path -Request $f.request -TimeoutSeconds 1 -AcceptHandoff $callback
  AssertStop ($replay.stopId -ceq $report.stopId -and $state.calls -eq $calls) 'Restart retried terminal stop or retrieved execution permission'
  RefuseStop {Complete-FtextUnpublishedStop $f.config $f.request.id ('c'*64)}
  Complete-FtextUnpublishedStop $f.config $f.request.id $report.stopId
  AssertStop (-not (Test-Path -LiteralPath $f.active)) 'Terminal stop left the connector blocked'
  AssertStop ((StopHash ([IO.File]::ReadAllBytes($f.prefix+'.intent.json'))) -ceq $intentHash -and (StopHash ([IO.File]::ReadAllBytes($f.prefix+'.stop.json'))) -ceq $stopHash) 'Stop altered original immutable evidence'
  RefuseStop {Invoke-FtextCashRequest -ConfigPath $f.path -Request $f.request -TimeoutSeconds 1 -AcceptHandoff $callback}
  foreach($suffix in @('.publish.json','.pending','.txt','.res','.report.json')){AssertStop (-not (Test-Path -LiteralPath ($f.prefix+$suffix))) 'Terminal stop wrote fiscal/report evidence'}
  AssertStop ($state.calls -eq $(if($mode -ceq 'LOST'){2}else{1})) 'Stop acknowledgement was not idempotent across loss/crash'
 }}
 foreach($mode in @('FOREIGN','AUTHORIZED','OLD')){
  Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force;Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
  $f=New-StopFixture 'CASH';$state=Set-StopCloudMock $f $mode;if($mode -ceq 'OLD'){$f.request.handoff.PSObject.Properties.Remove('stopVersion')}
  RefuseStop {Invoke-FtextCashRequest -ConfigPath $f.path -Request $f.request -TimeoutSeconds 1 -AcceptHandoff $callback}
  AssertStop ((Test-Path -LiteralPath $f.active) -and -not (Test-Path -LiteralPath ($f.prefix+'.stop.json')) -and -not (Test-Path -LiteralPath ($f.prefix+'.txt'))) 'Bad/old stop acknowledgement cleared or executed original work'
 }
 foreach($bad in @('PARTIAL','NONCE','INTENT','PUBLISHED','FOREIGN-ACTIVE')){
  Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force;Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
  $f=New-StopFixture 'CASH';$state=Set-StopCloudMock $f 'NORMAL';$report=Invoke-FtextCashRequest -ConfigPath $f.path -Request $f.request -TimeoutSeconds 1 -AcceptHandoff $callback
  if($bad -ceq 'PARTIAL'){[IO.File]::WriteAllText($f.prefix+'.stop.json','{')}
  if($bad -ceq 'NONCE'){$s=Get-Content -LiteralPath ($f.prefix+'.stop.json') -Raw | ConvertFrom-Json;$s.nonce=[Guid]::NewGuid().ToString();$s | ConvertTo-Json -Compress | Set-Content -LiteralPath ($f.prefix+'.stop.json') -Encoding UTF8}
  if($bad -ceq 'INTENT'){Remove-Item -LiteralPath ($f.prefix+'.intent.json')}
  if($bad -ceq 'PUBLISHED'){[IO.File]::WriteAllText($f.prefix+'.publish.json','partial irreversible publication journal')}
  if($bad -ceq 'FOREIGN-ACTIVE'){$a=Get-Content -LiteralPath $f.active -Raw | ConvertFrom-Json;$a.request.id=[Guid]::NewGuid().ToString();$a | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $f.active -Encoding UTF8}
  $before=@(Get-ChildItem -LiteralPath $f.config.workFolder -File | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash) | ConvertTo-Json -Compress
  RefuseStop {Complete-FtextUnpublishedStop $f.config $f.request.id $report.stopId}
  RefuseStop {Invoke-FtextCashRequest -ConfigPath $f.path -Request $f.request -TimeoutSeconds 1 -AcceptHandoff $callback}
  $after=@(Get-ChildItem -LiteralPath $f.config.workFolder -File | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash) | ConvertTo-Json -Compress
  AssertStop ($before -ceq $after -and $state.calls -eq 1 -and (Test-Path -LiteralPath $f.active)) 'Corrupt/published/foreign stop changed files or retrieved authorization'
 }
 # Run the actual production connector loop and actual Cash module. Only cloud
 # responses are synthetic; terminal stop must never be sent as cash-result.
 $loop=Join-Path $root 'loop';New-Item -ItemType Directory -Path $loop | Out-Null
 foreach($name in @('Cloud-Connector.ps1','Cash.psm1','Ftext.psm1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $loop $name)}
 $cloud=@'
function Get-FtextCloudConfig($Path){Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json}
function Invoke-FtextCloudPoll($Config,$Recovering,$StopVersion){
 [IO.File]::AppendAllText($env:MWS_FTEXT_STOP_LOG,('poll:'+([string]$Recovering)+':'+([string]$StopVersion)+"`n"))
 if(-not $Recovering){throw 'Synthetic next-work discovery after completed stop'}
 return @{request=$null;lateReceipt=$null;errorEvidence=$null}
}
function Invoke-FtextCloudHandoff($ConfigPath,$Request,$CommandHash){return [pscustomobject]@{requestId=$Request.id;settingsHash=$Request.settingsHash;nonce=$Request.handoff.nonce;commandHash=$CommandHash;stopped=$true;stopId=('b'*64);stoppedAt='2026-10-31T12:00:00.000Z'}}
function Invoke-FtextCashApi($Config,$Action,$Body){[IO.File]::AppendAllText($env:MWS_FTEXT_STOP_LOG,('unexpected:'+([string]$Action)+"`n"));throw 'Terminal stop must not post a payment result'}
function Invoke-FtextCloudReadiness($ConfigPath){throw 'Unexpected STATUS in stop loop fixture'}
Export-ModuleMember -Function Get-FtextCloudConfig,Invoke-FtextCloudPoll,Invoke-FtextCloudHandoff,Invoke-FtextCashApi,Invoke-FtextCloudReadiness
'@
 $cloud | Set-Content -LiteralPath (Join-Path $loop 'Cloud-Tools.psm1') -Encoding UTF8
 foreach($method in @('CASH','CARD-OPERATOR','CARD-STRICT')){
  Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
  $f=New-StopFixture $method;$utf8=New-Object Text.UTF8Encoding($false);$env:MWS_FTEXT_STOP_LOG=Join-Path $f.config.workFolder 'loop.log'
  [IO.File]::WriteAllText($f.prefix+'.intent.json',(([ordered]@{commandHash=$f.digest;settingsHash=$f.config.settingsHash;requestId=$f.request.id}) | ConvertTo-Json -Compress),$utf8)
  [IO.File]::WriteAllText($f.active,(([ordered]@{companyId=$f.config.companyId;storeId=$f.config.storeId;terminalPos=$f.config.terminalPos;serialNumber=$f.config.serialNumber;settingsHash=$f.config.settingsHash;request=$f.request}) | ConvertTo-Json -Depth 20 -Compress),$utf8)
  & {
   function Start-Sleep {param($Seconds);throw 'Synthetic stop-loop process finished'}
   try{& (Join-Path $loop 'Cloud-Connector.ps1') -ConfigPath $f.path}catch{if($_.Exception.Message -cne 'Synthetic stop-loop process finished'){throw}}
  }
  $log=Get-Content -LiteralPath $env:MWS_FTEXT_STOP_LOG -Raw
  AssertStop ($log -match 'poll:True:1' -and $log -match 'poll:False:1' -and $log -notmatch 'unexpected:') 'Actual loop posted a stop as payment or remained in old recovery'
  AssertStop (-not (Test-Path -LiteralPath $f.active) -and (Test-Path -LiteralPath ($f.prefix+'.stop.json')) -and -not (Test-Path -LiteralPath ($f.prefix+'.txt'))) 'Actual loop failed durable stop without fiscal publication'
 }
 # A new loop combined with an old Cash module must send capability zero.
 $legacyCash=@'
function Get-FtextCashPending($Config){return $null}
function Invoke-FtextCashRequest {throw 'Mixed old Cash module must not execute'}
Export-ModuleMember -Function Get-FtextCashPending,Invoke-FtextCashRequest
'@
 $legacyCash | Set-Content -LiteralPath (Join-Path $loop 'Cash.psm1') -Encoding UTF8
 $f=New-StopFixture 'CASH';$env:MWS_FTEXT_STOP_LOG=Join-Path $f.config.workFolder 'mixed-loop.log'
 & {
  function Start-Sleep {param($Seconds);throw 'Synthetic mixed-loop process finished'}
  try{& (Join-Path $loop 'Cloud-Connector.ps1') -ConfigPath $f.path}catch{if($_.Exception.Message -cne 'Synthetic mixed-loop process finished'){throw}}
 }
 AssertStop ((Get-Content -LiteralPath $env:MWS_FTEXT_STOP_LOG -Raw) -match 'poll:False:0') 'Mixed old Cash module advertised terminal stop'
 Write-Host 'PASS: actual Windows CASH/both CARD terminal stop across lost replies, journal crash/restart, malformed/foreign/published evidence and actual connector loop; zero fiscal/payment output.'
}finally{
 $env:MWS_FTEXT_STOP_LOG=$oldLog
 Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force;Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
 Remove-Item -LiteralPath $root -Recurse -Force
}
