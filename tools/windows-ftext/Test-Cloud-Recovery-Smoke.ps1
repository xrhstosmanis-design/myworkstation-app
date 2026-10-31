$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
function AssertRecovery([bool]$Value,[string]$Message) {if(-not $Value){throw $Message}}
function RecoveryHash([byte[]]$Bytes) {$sha=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
$root=Join-Path ([IO.Path]::GetTempPath()) ('ftext-original-report-fixture-'+[Guid]::NewGuid().ToString('N'))
$oldLog=$env:MWS_FTEXT_REPORT_LOG;$oldState=$env:MWS_FTEXT_REPORT_STATE
New-Item -ItemType Directory -Path $root | Out-Null
try {
 foreach($name in @('Cloud-Connector.ps1','Cash.psm1','Ftext.psm1')) {Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $root $name)}
 $cloud=@'
$script:pings=0
function Get-FtextCloudConfig($Path){return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json}
function Invoke-FtextCloudPing($Config){$script:pings++;if($script:pings -eq 1){throw 'Synthetic heartbeat loss'};return @{ok=$true}}
function Invoke-FtextCloudReadiness($ConfigPath){return $false}
function Invoke-FtextCloudPoll($Config,$Recovering){
 Invoke-FtextCloudPing $Config | Out-Null
 [IO.File]::AppendAllText($env:MWS_FTEXT_REPORT_LOG,((@{action='work-poll';body=@{recovering=$Recovering}}|ConvertTo-Json -Compress)+"`n"))
 return @{request=$null;lateReceipt=$null;errorEvidence=$null}
}
function Invoke-FtextCashApi($Config,$Action,$Body){
 [IO.File]::AppendAllText($env:MWS_FTEXT_REPORT_LOG,((@{action=$Action;body=$Body}|ConvertTo-Json -Depth 16 -Compress)+"`n"))
 if($Action -ceq 'cash-result'){
  $attempts=@(Get-Content -LiteralPath $env:MWS_FTEXT_REPORT_LOG | ForEach-Object {$_ | ConvertFrom-Json} | Where-Object {$_.action -ceq 'cash-result'}).Count
  if($attempts -eq 1 -and -not $Config.fixtureCommitBeforeLoss){throw 'Synthetic response lost before server commit'}
  if(-not (Test-Path -LiteralPath $env:MWS_FTEXT_REPORT_STATE)){[IO.File]::WriteAllText($env:MWS_FTEXT_REPORT_STATE,'1')}
  if($attempts -eq 1){throw 'Synthetic response lost after server commit'}
  return @{ok=$true;status=[string]$Config.fixtureAckStatus}
 }
 if($Action -in @('cash-poll','void-poll','late-receipt-poll','error-evidence-poll')){return @{request=$null}}
 throw 'Unexpected API action in original-report recovery fixture'
}
Export-ModuleMember -Function Get-FtextCloudConfig,Invoke-FtextCloudPing,Invoke-FtextCloudPoll,Invoke-FtextCloudReadiness,Invoke-FtextCashApi
'@
 Set-Content -LiteralPath (Join-Path $root 'Cloud-Tools.psm1') -Value $cloud -Encoding UTF8
 $cases=@(@{method='CASH';format='OPERATOR_CONFIRMATION';ack='SALE_COMMITTED'},@{method='CARD';format='OPERATOR_CONFIRMATION';ack='CONFIRMED'},@{method='CARD';format='POS_LINE8_OS7';ack='SALE_COMMITTED'})
 foreach($case in $cases){foreach($commitBeforeLoss in @($false,$true)){
  $caseRoot=Join-Path $root ([Guid]::NewGuid().ToString('N'));$work=Join-Path $caseRoot 'work';New-Item -ItemType Directory -Path $work -Force | Out-Null
  $configPath=Join-Path $caseRoot 'config.json';$env:MWS_FTEXT_REPORT_LOG=Join-Path $caseRoot 'calls.jsonl';$env:MWS_FTEXT_REPORT_STATE=Join-Path $caseRoot 'server-result-state'
  $config=[pscustomobject]@{companyId='fixture-company';storeId='fixture-store';terminalPos='POS-01';fiscalDeviceCode='FISCAL-01';serialNumber='TEST12345';workFolder=$work;settingsHash=('a'*64);configurationId=[Guid]::NewGuid().ToString();protocol='SOLIDUS(II)T';lifecycleGeneration='0';apiBase='https://fixture.invalid';cashEnabled=$true;cashDepartments=@([pscustomobject]@{department=4;vatRate=13;vatCode='2'});cardEnabled=$true;cardPayment=[pscustomobject]@{code=2;posTerminalId=1;transactionType=$(if($case.format -ceq 'OPERATOR_CONFIRMATION'){1}else{6});resultFormat=$case.format;confirmed=$true};fixtureCommitBeforeLoss=$commitBeforeLoss;fixtureAckStatus=$case.ack}
  $scope=[pscustomobject]@{companyId=$config.companyId;storeId=$config.storeId;terminalPos=$config.terminalPos;fiscalDeviceCode=$config.fiscalDeviceCode}
  $request=[pscustomobject]@{id=[Guid]::NewGuid().ToString();kind='FTEXT_CASH';settingsHash=$config.settingsHash;scope=$scope;serialNumber=$config.serialNumber;plan=[pscustomobject]@{schemaVersion='MWS_FTEXT_SALE_PLAN_V1';configurationId=$config.configurationId;settingsHash=$config.settingsHash;scope=$scope;total='1.25';payment=[pscustomobject]@{method=$case.method;code=$(if($case.method -ceq 'CASH'){1}else{2});amount='1.25'};lines=@([pscustomobject]@{description='SYNTHETIC';quantity='1.000';unitPrice='1.25';discount='0.00';lineTotal='1.25';department='4';vatRate='13.00';vatCode='2'})}}
  $resultPath=Join-Path $work ('mws-cash-'+$request.id+'.res');$intentPath=Join-Path $work ('mws-cash-'+$request.id+'.intent.json');$reportPath=Join-Path $work ('mws-cash-'+$request.id+'.report.json');$activePath=Join-Path $work '.mws-ftext-cash.json'
  $posLine=if($case.method -ceq 'CARD' -and $case.format -ceq 'POS_LINE8_OS7'){'#Visa Debit;1.25;416598******5605'}else{''}
  $raw=[Text.Encoding]::GetEncoding(1253).GetBytes("0`r`n17`r`n42`r`nTEST12345`r`n31/10/2026 09:32`r`n0`r`nhttps://www1.aade.gr/tameiakes/myweb/q1.php?SIG=TEST12345ABC26103109321.25`r`n"+$posLine+"`r`n671`r`n")
  $report=Read-FtextCashResult $raw $config $request;AssertRecovery ([string]$report.outcome -ceq 'CONFIRMED') 'Cached report fixture was not actual verified production-parser evidence.'
  $utf8=New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($configPath,($config | ConvertTo-Json -Depth 16),$utf8)
  [IO.File]::WriteAllBytes($resultPath,$raw)
  [IO.File]::WriteAllText($intentPath,(([ordered]@{commandHash=(RecoveryHash (New-FtextCashCommand $config $request $resultPath));settingsHash=$config.settingsHash;requestId=$request.id}) | ConvertTo-Json -Compress),$utf8)
  [IO.File]::WriteAllText($reportPath,($report | ConvertTo-Json -Depth 16 -Compress),$utf8)
  [IO.File]::WriteAllText($activePath,(([ordered]@{companyId=$config.companyId;storeId=$config.storeId;terminalPos=$config.terminalPos;serialNumber=$config.serialNumber;settingsHash=$config.settingsHash;request=$request}) | ConvertTo-Json -Depth 18 -Compress),$utf8)
  $before=@(Get-ChildItem -LiteralPath $work -File | Where-Object {$_.Name -cne '.mws-ftext-cash.json'} | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash) | ConvertTo-Json -Compress
  for($restart=0;$restart -lt 2;$restart++){
   & {
    param($path,$limit)
    $script:recoveryCycles=0;$script:recoveryLimit=$limit
    function Start-Sleep {param($Seconds);$script:recoveryCycles++;if($script:recoveryCycles -ge $script:recoveryLimit){throw 'Synthetic original-report process stopped'}}
    try{& (Join-Path $root 'Cloud-Connector.ps1') -ConfigPath $path}catch{if($_.Exception.Message -cne 'Synthetic original-report process stopped'){throw}}
   } $configPath $(if($restart -eq 0){2}else{4})
   if($restart -eq 0){AssertRecovery (Test-Path -LiteralPath $activePath) 'Lost acknowledgement removed the durable active marker before confirmation.'}
  }
  $calls=@(Get-Content -LiteralPath $env:MWS_FTEXT_REPORT_LOG | ForEach-Object {$_ | ConvertFrom-Json});$posts=@($calls | Where-Object {$_.action -ceq 'cash-result'})
  AssertRecovery (@($calls | Where-Object {$_.action -ceq 'work-poll' -and $_.body.recovering -eq $true}).Count -ge 2) 'Original local result did not suppress new work claims across restart.'
  AssertRecovery ($posts.Count -eq 2 -and ($posts[0].body | ConvertTo-Json -Depth 16 -Compress) -ceq ($posts[1].body | ConvertTo-Json -Depth 16 -Compress)) 'Restart/lost result acknowledgement changed or duplicated the original report identity.'
  AssertRecovery ((Get-Content -LiteralPath $env:MWS_FTEXT_REPORT_STATE -Raw) -ceq '1') 'The fixture server did not preserve one durable result.'
  AssertRecovery (-not (Test-Path -LiteralPath $activePath)) 'Acknowledged original result did not release its local active marker.'
  $after=@(Get-ChildItem -LiteralPath $work -File | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash) | ConvertTo-Json -Compress
  AssertRecovery ($before -ceq $after -and @(Get-ChildItem -LiteralPath $work -Filter '*.txt').Count -eq 0 -and @(Get-ChildItem -LiteralPath $work -Filter '*.pending').Count -eq 0) 'A restart republished a fiscal command or changed immutable evidence.'
 }}
 Write-Host 'PASS: actual Windows connector and cash module recover original CASH/operator-CARD/strict-CARD reports across heartbeat loss, before/after-commit response loss and process restart; zero fiscal files.'
}finally{$env:MWS_FTEXT_REPORT_LOG=$oldLog;$env:MWS_FTEXT_REPORT_STATE=$oldState;Remove-Item -LiteralPath $root -Recurse -Force}
