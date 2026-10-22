$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
$passed=0
function Assert([bool]$Value,[string]$Message) {if(-not $Value){throw $Message};$script:passed++}
function MustThrow([scriptblock]$Action) {$rejected=$false;try{& $Action | Out-Null}catch{$rejected=$true};Assert $rejected 'Unsafe action was accepted.'}
$root=Join-Path ([IO.Path]::GetTempPath()) ('ftext-cash-fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try {
 $configPath=Join-Path $root 'config.json'
 $c=[pscustomobject]@{companyId='fixture-company';storeId='fixture-store';terminalPos='POS-01';fiscalDeviceCode='FISCAL-01';serialNumber='TEST12345';workFolder=$root;settingsHash=('a'*64);configurationId=[Guid]::NewGuid().ToString();cashEnabled=$true;cashDepartments=@([pscustomobject]@{department=4;vatRate=13;vatCode='2'})}
 $c | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
 $scope=[pscustomobject]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;fiscalDeviceCode=$c.fiscalDeviceCode}
 $r=[pscustomobject]@{id=[Guid]::NewGuid().ToString();settingsHash=$c.settingsHash;scope=$scope;serialNumber=$c.serialNumber;plan=[pscustomobject]@{schemaVersion='MWS_FTEXT_SALE_PLAN_V1';configurationId=$c.configurationId;settingsHash=$c.settingsHash;scope=$scope;total='1.25';payment=[pscustomobject]@{method='CASH';code=1;amount='1.25'};lines=@([pscustomobject]@{description='SYNTHETIC';quantity='1.000';unitPrice='1.25';discount='0.00';lineTotal='1.25';department='4';vatRate='13.00';vatCode='2'})}}
 $enc=[Text.Encoding]::GetEncoding(1253);$resultPath=Join-Path $root ('mws-cash-'+$r.id+'.res')
 $command=$enc.GetString((New-FtextCashCommand $c $r $resultPath))
 Assert ($command -ceq "RESULT_FILENAME|$resultPath`r`nS|SYNTHETIC|1.000|1.25||4`r`nPAY||1`r`n") 'Unexpected cash command.'
 foreach($key in @('companyId','storeId','terminalPos','fiscalDeviceCode')) {
  $wrong=$r | ConvertTo-Json -Depth 10 | ConvertFrom-Json;$wrong.scope.$key='foreign';MustThrow {New-FtextCashCommand $c $wrong $resultPath}
 }
 foreach($name in @('X|PAY','X{h}',"X`nPAY",[char]0+'X',[char]0xD83D+[string][char]0xDE00)) {
  $wrong=$r | ConvertTo-Json -Depth 10 | ConvertFrom-Json;$wrong.plan.lines[0].description=$name;MustThrow {New-FtextCashCommand $c $wrong $resultPath}
 }
 foreach($change in @('CARD','DEPT','TOTAL','QUANTITY','DISCOUNT')) {
  $wrong=$r | ConvertTo-Json -Depth 10 | ConvertFrom-Json
  switch($change){'CARD'{$wrong.plan.payment.method='CARD'} 'DEPT'{$wrong.plan.lines[0].department='5'} 'TOTAL'{$wrong.plan.total='9.00'} 'QUANTITY'{$wrong.plan.lines[0].quantity='0.500'} 'DISCOUNT'{$wrong.plan.lines[0].discount='0.01'}}
  MustThrow {New-FtextCashCommand $c $wrong $resultPath}
 }
 $valid="0`r`n17`r`n42`r`nTEST12345`r`n20261022120000`r`n`r`nhttps://www1.aade.gr/dcl/fixture`r`n"
 Assert ((Read-FtextCashResult $enc.GetBytes($valid) $c $r).outcome -ceq 'CONFIRMED') 'Final receipt was not verified.'
 foreach($bad in @('', $valid.Replace('TEST12345','OTHER123'),$valid.Replace('https://www1.aade.gr/dcl/fixture',''),$valid.Replace('aade.gr','aade.gr.evil.invalid'),$valid.Replace("42`r`n","0`r`n"),"101`r`nNo response`r`nS`r`n")) {
  Assert ((Read-FtextCashResult $enc.GetBytes($bad) $c $r).outcome -ceq 'REQUIRES_CHECK') 'Unverified result confirmed a sale.'
 }
 # Native isolated filesystem dispatch, timeout, persistent uncertainty and restart.
 $report=Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1
 Assert ($report.outcome -ceq 'REQUIRES_CHECK') 'Timeout must remain unknown.'
 $inputPath=Join-Path $root ('mws-cash-'+$r.id+'.txt')
 Assert ([IO.File]::ReadAllText($inputPath,$enc) -ceq $command) 'Dispatched command changed.'
 Remove-Item -LiteralPath $inputPath
 [IO.File]::WriteAllBytes($resultPath,$enc.GetBytes($valid))
 $reopened=Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1
 Assert ($reopened.outcome -ceq 'REQUIRES_CHECK') 'A late receipt changed an already reported unknown outcome.'
 Assert (-not (Test-Path -LiteralPath $inputPath)) 'Restart resent a consumed command.'
 $next=$r | ConvertTo-Json -Depth 10 | ConvertFrom-Json;$next.id=[Guid]::NewGuid().ToString()
 MustThrow {Invoke-FtextCashRequest -ConfigPath $configPath -Request $next -TimeoutSeconds 1}
 Complete-FtextCashReport $c $r.id
 MustThrow {Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1}
 Assert (Test-Path -LiteralPath (Join-Path $root ('mws-cash-'+$r.id+'.intent.json'))) 'Acknowledgement removed the tombstone.'
 # A pre-existing result never authorizes a fresh command.
 [IO.File]::WriteAllBytes((Join-Path $root ('mws-cash-'+$next.id+'.res')),$enc.GetBytes($valid))
 MustThrow {Invoke-FtextCashRequest -ConfigPath $configPath -Request $next -TimeoutSeconds 1}
 Assert (@(Get-ChildItem -LiteralPath $root -Filter '*.txt').Count -eq 0) 'A rejected request emitted input.'
 Write-Host ('PASS: '+$passed+' cash command/result/scope/timeout/restart/tombstone boundaries; synthetic folder only.')
} finally {Remove-Item -LiteralPath $root -Recurse -Force}
