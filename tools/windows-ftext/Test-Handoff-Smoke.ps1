$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
function AssertHandoff([bool]$Value,[string]$Message){if(-not $Value){throw $Message}}
function HandoffHash([byte[]]$Bytes){$sha=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
function MustRefuseHandoff([scriptblock]$Action){$refused=$false;try{& $Action | Out-Null}catch{$refused=$true};AssertHandoff $refused 'Unsafe handoff was accepted'}
$root=Join-Path ([IO.Path]::GetTempPath()) ('ftext-handoff-fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try{
 foreach($method in @('CASH','CARD-OPERATOR','CARD-STRICT')){foreach($loss in @('BEFORE','AFTER')){
  $folder=Join-Path $root ([Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $folder | Out-Null
  $configPath=Join-Path $folder 'config.json'
  $c=[pscustomobject]@{companyId='fixture-company';storeId='fixture-store';terminalPos='POS-01';fiscalDeviceCode='FISCAL-01';serialNumber='TEST12345';workFolder=$folder;settingsHash=('a'*64);configurationId=[Guid]::NewGuid().ToString();cashEnabled=$true;cashDepartments=@([pscustomobject]@{department=4;vatRate=13;vatCode='2'});cardEnabled=$true;cardPayment=[pscustomobject]@{code=2;posTerminalId=1;transactionType=$(if($method -ceq 'CARD-STRICT'){6}else{1});resultFormat=$(if($method -ceq 'CARD-STRICT'){'POS_LINE8_OS7'}else{'OPERATOR_CONFIRMATION'});confirmed=$true}}
  $c | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $configPath -Encoding UTF8
  $scope=[pscustomobject]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;fiscalDeviceCode=$c.fiscalDeviceCode}
  $r=[pscustomobject]@{id=[Guid]::NewGuid().ToString();settingsHash=$c.settingsHash;scope=$scope;serialNumber=$c.serialNumber;plan=[pscustomobject]@{schemaVersion='MWS_FTEXT_SALE_PLAN_V1';configurationId=$c.configurationId;settingsHash=$c.settingsHash;scope=$scope;total='1.25';payment=[pscustomobject]@{method=$(if($method -ceq 'CASH'){'CASH'}else{'CARD'});code=$(if($method -ceq 'CASH'){1}else{2});amount='1.25'};lines=@([pscustomobject]@{description='SYNTHETIC';quantity='1.000';unitPrice='1.25';discount='0.00';lineTotal='1.25';department='4';vatRate='13.00';vatCode='2'})}}
  $resultPath=Join-Path $folder ('mws-cash-'+$r.id+'.res');$intentPath=Join-Path $folder ('mws-cash-'+$r.id+'.intent.json');$activePath=Join-Path $folder '.mws-ftext-cash.json';$target=Join-Path $folder ('mws-cash-'+$r.id+'.txt')
  $digest=HandoffHash (New-FtextCashCommand $c $r $resultPath)
  $r | Add-Member NoteProperty handoff ([pscustomobject]@{version=1;nonce=[Guid]::NewGuid().ToString();commandHash=$digest})
  MustRefuseHandoff {Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1}
  AssertHandoff (@(Get-ChildItem -LiteralPath $folder -Filter '*.txt').Count -eq 0 -and -not (Test-Path -LiteralPath $intentPath)) 'Missing callback reached durable/fiscal execution'
  $state=@{calls=0;accepted=$false;loss=$loss;intent=$intentPath;active=$activePath;expected=$digest;requestId=$r.id}
  $grant={param($job,$hash)
   if(-not ((Test-Path -LiteralPath $state.intent) -and (Test-Path -LiteralPath $state.active))){throw 'Grant requested before durable original intent/active marker'}
   $intent=Get-Content -LiteralPath $state.intent -Raw | ConvertFrom-Json
   if(-not ([string]$intent.commandHash -ceq $state.expected -and [string]$intent.requestId -ceq $state.requestId -and $hash -ceq $state.expected -and [string]$job.id -ceq $state.requestId)){throw 'Original intent/command identity changed before grant'}
   $state.calls++
   if($state.calls -eq 1){if($state.loss -ceq 'AFTER'){$state.accepted=$true};throw 'Synthetic lost grant reply'}
   if($state.accepted){return $false};$state.accepted=$true;return $true
  }.GetNewClosure()
  MustRefuseHandoff {Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1 -AcceptHandoff $grant}
  AssertHandoff (-not (Test-Path -LiteralPath $target) -and @(Get-ChildItem -LiteralPath $folder -Filter '*.pending').Count -eq 0) 'A lost grant acknowledgement published a fiscal command'
  $intentBefore=HandoffHash ([IO.File]::ReadAllBytes($intentPath))
  $report=Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1 -AcceptHandoff $grant
  AssertHandoff ($report.outcome -ceq 'REQUIRES_CHECK') 'Synthetic missing hardware result became a receipt'
  AssertHandoff ((HandoffHash ([IO.File]::ReadAllBytes($intentPath))) -ceq $intentBefore) 'Original intent was rewritten across lost response'
  if($loss -ceq 'BEFORE'){
   AssertHandoff (Test-Path -LiteralPath $target) 'New first grant did not publish the original command once'
   $published=HandoffHash ([IO.File]::ReadAllBytes($target));AssertHandoff ($published -ceq $digest) 'Published command differs from granted original bytes'
  }else{AssertHandoff (-not (Test-Path -LiteralPath $target)) 'Repeated acceptance after committed grant republished a payment'}
  # Model driver consumption plus a crash before the local report was durable.
  # The original irreversible intent/active marker and server acceptance remain.
  $reportPath=Join-Path $folder ('mws-cash-'+$r.id+'.report.json')
  Remove-Item -LiteralPath $target -ErrorAction SilentlyContinue;Remove-Item -LiteralPath $reportPath
  $afterConsumption=Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1 -AcceptHandoff $grant
  AssertHandoff (-not (Test-Path -LiteralPath $target) -and $afterConsumption.outcome -ceq 'REQUIRES_CHECK') 'Consumed fiscal input was published again after restart'
  $before=@(Get-ChildItem -LiteralPath $folder -File | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash) | ConvertTo-Json -Compress
  $calls=$state.calls;Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
  $reopened=Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1 -AcceptHandoff $grant
  AssertHandoff ($state.calls -eq $calls -and $reopened.requestId -ceq $report.requestId) 'Cached original report after module restart requested new permission'
  $after=@(Get-ChildItem -LiteralPath $folder -File | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash) | ConvertTo-Json -Compress
  AssertHandoff ($before -ceq $after) 'Restart changed original evidence or fiscal input bytes'
  Complete-FtextCashReport $c $r.id
  MustRefuseHandoff {Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1 -AcceptHandoff $grant}
  AssertHandoff ($state.calls -eq $calls) 'Acknowledged intent was revived into another grant'
 }}
 Write-Host 'PASS: actual CASH/both CARD modules retain original files across before/after-commit grant loss, exactly one fresh permitted publication and no publication after accepted-reply loss/restart.'
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
