$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
$passed=0
function Assert([bool]$Value,[string]$Message) {if(-not $Value){throw $Message};$script:passed++}
function MustThrow([scriptblock]$Action) {$site=(Get-PSCallStack)[1].ScriptLineNumber;$rejected=$false;try{& $Action | Out-Null}catch{$rejected=$true};Assert $rejected ('Unsafe action was accepted at test line '+$site)}
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
 foreach($name in @('X|PAY','X{h}',"X`nPAY",([string][char]0+'X'),([string][char]0xD83D+[string][char]0xDE00))) {
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
 # Fresh isolated success consumes one command and returns its exact final document.
 $fresh=$r | ConvertTo-Json -Depth 10 | ConvertFrom-Json;$fresh.id=[Guid]::NewGuid().ToString()
 $job=Start-Job -ArgumentList $root,$fresh.id,$valid -ScriptBlock {
  param($folder,$id,$text)
  $target=Join-Path $folder ('mws-cash-'+$id+'.txt')
  for($i=0;$i -lt 100;$i++) {if(Test-Path -LiteralPath $target) {Remove-Item -LiteralPath $target;[IO.File]::WriteAllBytes((Join-Path $folder ('mws-cash-'+$id+'.res')),[Text.Encoding]::GetEncoding(1253).GetBytes($text));return};Start-Sleep -Milliseconds 100}
  throw 'Synthetic driver saw no command.'
 }
 try {
  $success=Invoke-FtextCashRequest -ConfigPath $configPath -Request $fresh -TimeoutSeconds 15
  Assert ($success.outcome -ceq 'CONFIRMED' -and $success.dayCounter -ceq '42') 'Native result exchange did not confirm the exact receipt.'
  Wait-Job $job | Out-Null;Receive-Job $job | Out-Null
  Complete-FtextCashReport $c $fresh.id
 } finally {Remove-Job $job -Force}

 # CARD uses the same durable one-shot exchange; only a matching line8 can confirm it.
 $c | Add-Member -NotePropertyName cardEnabled -NotePropertyValue $true
 $c | Add-Member -NotePropertyName cardPayment -NotePropertyValue ([pscustomobject]@{code=2;posTerminalId=1;transactionType=6;resultFormat='POS_LINE8_OS7';confirmed=$true})
 $c | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
 $card=$r | ConvertTo-Json -Depth 10 | ConvertFrom-Json;$card.id=[Guid]::NewGuid().ToString();$card.plan.payment.method='CARD';$card.plan.payment.code=2
 $cardPath=Join-Path $root ('mws-cash-'+$card.id+'.res')
 $cardCommand=$enc.GetString((New-FtextCashCommand $c $card $cardPath))
 Assert ($cardCommand.EndsWith("PAY||2`r`n")) 'Confirmed card payment ID was not serialized.'
 $cardResult=$valid+"#Visa Debit;1.25;416598******5605`r`n"
 $parsed=Read-FtextCashResult $enc.GetBytes($cardResult) $c $card
 Assert ($parsed.outcome -ceq 'CONFIRMED' -and $parsed.posPayments.Count -eq 1 -and $parsed.posPayments[0].amount -ceq '1.25') 'Exact masked card result was not confirmed.'
 foreach($bad in @($valid,$cardResult.Replace('1.25','1.24'),$cardResult.Replace('Visa Debit','IRIS'),$cardResult.Replace('416598******5605','4165981234565605'),$cardResult.Replace('#Visa Debit;1.25;416598******5605','#Visa Debit;1.25;416598******5605#Visa Debit;1.25;416598******5605'),"48`r`nEFT-POS ERROR`r`nPAY`r`n")) {
  Assert ((Read-FtextCashResult $enc.GetBytes($bad) $c $card).outcome -ceq 'REQUIRES_CHECK') 'Invalid card evidence confirmed a payment.'
 }
 foreach($change in @('DISABLED','CODE','MODE','FORMAT','UNCONFIRMED')) {
  $wrong=$c | ConvertTo-Json -Depth 10 | ConvertFrom-Json
  switch($change){'DISABLED'{$wrong.cardEnabled=$false} 'CODE'{$wrong.cardPayment.code=3} 'MODE'{$wrong.cardPayment.transactionType=7} 'FORMAT'{$wrong.cardPayment.resultFormat='UNKNOWN'} 'UNCONFIRMED'{$wrong.cardPayment.confirmed=$false}}
  MustThrow {New-FtextCashCommand $wrong $card $cardPath}
 }
 $cardJob=Start-Job -ArgumentList $root,$card.id,$cardResult -ScriptBlock {
  param($folder,$id,$text)
  $target=Join-Path $folder ('mws-cash-'+$id+'.txt')
  for($i=0;$i -lt 100;$i++) {if(Test-Path -LiteralPath $target) {Remove-Item -LiteralPath $target;[IO.File]::WriteAllBytes((Join-Path $folder ('mws-cash-'+$id+'.res')),[Text.Encoding]::GetEncoding(1253).GetBytes($text));return};Start-Sleep -Milliseconds 100}
  throw 'Synthetic card driver saw no command.'
 }
 try {
  $success=Invoke-FtextCashRequest -ConfigPath $configPath -Request $card -TimeoutSeconds 15
  Assert ($success.outcome -ceq 'CONFIRMED' -and $success.posPayments[0].cardNumberMasked -ceq '416598******5605') 'Native card result exchange failed.'
  Wait-Job $cardJob | Out-Null;Receive-Job $cardJob | Out-Null
  Complete-FtextCashReport $c $card.id
  MustThrow {Invoke-FtextCashRequest -ConfigPath $configPath -Request $card -TimeoutSeconds 1}
  Assert (-not (Test-Path -LiteralPath (Join-Path $root ('mws-cash-'+$card.id+'.txt')))) 'Acknowledged card was resent.'
 } finally {Remove-Job $cardJob -Force}
 # Legacy operator-confirmed card: final fiscal receipt is required, POS line8 is optional.
 $manual=$c | ConvertTo-Json -Depth 12 | ConvertFrom-Json
 $manual | Add-Member -Force NoteProperty cardEnabled $true
 $manual | Add-Member -Force NoteProperty cardPayment ([pscustomobject]@{code=2;posTerminalId=1;transactionType=1;resultFormat='OPERATOR_CONFIRMATION';confirmed=$true})
 $mr=$r | ConvertTo-Json -Depth 12 | ConvertFrom-Json;$mr.plan.payment.method='CARD';$mr.plan.payment.code=2
 Assert ($enc.GetString((New-FtextCashCommand $manual $mr $resultPath)).EndsWith("PAY||2`r`n")) 'Operator card did not use the configured code.'
 Assert ((Read-FtextCashResult $enc.GetBytes($valid) $manual $mr).outcome -ceq 'CONFIRMED') 'Legacy final receipt was not accepted for operator review.'
 foreach($bad in @($valid.Replace('TEST12345','FOREIGN'),$valid.Replace('https://www1.aade.gr/dcl/fixture',''),"48`r`nEFT-POS ERROR`r`nPAY||2`r`n")) {
  Assert ((Read-FtextCashResult $enc.GetBytes($bad) $manual $mr).outcome -ceq 'REQUIRES_CHECK') 'Operator mode accepted an unverified receipt.'
 }
 $manual.cardPayment.resultFormat='POS_LINE8_OS7'
 Assert ((Read-FtextCashResult $enc.GetBytes($valid) $manual $mr).outcome -ceq 'REQUIRES_CHECK') 'Strict OS7 unexpectedly accepted missing line8.'

 Write-Host ('PASS: '+$passed+' cash command/result/scope/timeout/restart/tombstone boundaries; synthetic folder only.')
} finally {Remove-Item -LiteralPath $root -Recurse -Force}
