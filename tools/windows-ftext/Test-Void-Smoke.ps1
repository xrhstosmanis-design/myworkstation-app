$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
$count=0
function Assert([bool]$Value,[string]$Message) {if(-not $Value){throw $Message};$script:count++}
function MustThrow([scriptblock]$Action) {$caught=$false;try{& $Action | Out-Null}catch{$caught=$true};Assert $caught 'Unsafe VOID was accepted.'}
$root=Join-Path ([IO.Path]::GetTempPath()) ('ftext-void-fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try {
 $enc=[Text.Encoding]::GetEncoding(1253)
 $c=[pscustomobject]@{companyId='fixture-company';storeId='fixture-store';terminalPos='POS-01';fiscalDeviceCode='FISCAL-01';serialNumber='TEST12345';workFolder=$root;settingsHash=('a'*64);configurationId=[Guid]::NewGuid().ToString();cashEnabled=$true}
 $scope=[pscustomobject]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;fiscalDeviceCode=$c.fiscalDeviceCode}
 $originalId=[Guid]::NewGuid().ToString();$original=$enc.GetBytes("48`r`nEFT-POS ERROR`r`nPAY||2`r`n")
 $sha=[Security.Cryptography.SHA256]::Create();try{$originalHash=[BitConverter]::ToString($sha.ComputeHash($original)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 $r=[pscustomobject]@{id=[Guid]::NewGuid().ToString();kind='FTEXT_VOID';originalRequestId=$originalId;originalRawResultHash=$originalHash;settingsHash=$c.settingsHash;scope=$scope;serialNumber=$c.serialNumber;plan=[pscustomobject]@{schemaVersion='MWS_FTEXT_SALE_PLAN_V1';configurationId=$c.configurationId;settingsHash=$c.settingsHash;scope=$scope;payment=[pscustomobject]@{method='CARD';code=2}}}
 $configPath=Join-Path $root 'config.json';$c | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8
 $resultPath=Join-Path $root ('mws-cash-'+$r.id+'.res')
 $command=$enc.GetString((New-FtextCashCommand $c $r $resultPath))
 Assert ($command -ceq "RESULT_FILENAME|$resultPath`r`nVOID_DOCUMENT`r`n") 'VOID batch contains unexpected sale/payment command.'
 $valid="0`r`n17`r`n42`r`nTEST12345`r`nfixture time`r`n`r`n`r`n`r`n"
 $proof=Read-FtextCashResult $enc.GetBytes($valid) $c $r
 Assert ($proof.outcome -ceq 'VOID_CONFIRMED') 'Receipt-free VOID not accepted.'
 Assert ($proof.originalRequestId -ceq $originalId) 'Original request binding lost.'
 foreach($bad in @('', $valid.Replace('TEST12345','OTHER'),$valid.Replace("fixture time`r`n`r`n`r`n", "fixture time`r`n`r`nhttps://www1.aade.gr/receipt`r`n"),"48`r`nEFT-POS ERROR`r`nVOID_DOCUMENT`r`n")) {Assert ((Read-FtextCashResult $enc.GetBytes($bad) $c $r).outcome -ceq 'REQUIRES_CHECK') 'Unknown/final receipt was accepted as VOID.'}
 MustThrow {Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1}
 Assert (-not (Test-Path -LiteralPath (Join-Path $root ('mws-cash-'+$r.id+'.txt')))) 'Missing original result emitted VOID.'
 $originalPath=Join-Path $root ('mws-cash-'+$originalId+'.res');[IO.File]::WriteAllBytes($originalPath,$original)
 $report=Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1
 Assert ($report.outcome -ceq 'REQUIRES_CHECK') 'Timeout became confirmed cancellation.'
 $inputPath=Join-Path $root ('mws-cash-'+$r.id+'.txt');Assert ([IO.File]::ReadAllText($inputPath,$enc) -ceq $command) 'Actual emitted VOID bytes differ.'
 Remove-Item -LiteralPath $inputPath
 [IO.File]::WriteAllBytes($resultPath,$enc.GetBytes($valid))
 $reopened=Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1
 Assert ($reopened.outcome -ceq 'REQUIRES_CHECK') 'Late reply overwrote durable unknown.'
 Assert (-not (Test-Path -LiteralPath $inputPath)) 'Reopening reissued VOID.'
 Complete-FtextCashReport $c $r.id
 MustThrow {Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1}
 $r.id=[Guid]::NewGuid().ToString();[IO.File]::WriteAllText($originalPath,'changed result',$enc)
 MustThrow {Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1}
 [IO.File]::WriteAllBytes($originalPath,$original);$r.id=[Guid]::NewGuid().ToString()
 $successInput=Join-Path $root ('mws-cash-'+$r.id+'.txt');$successResult=Join-Path $root ('mws-cash-'+$r.id+'.res')
 $driver=Start-Job -ScriptBlock {param($inputFile,$resultFile,$reply);$deadline=[DateTime]::UtcNow.AddSeconds(15);while(-not (Test-Path -LiteralPath $inputFile) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 100};if(-not (Test-Path -LiteralPath $inputFile)){throw 'No synthetic VOID input'};$text=[IO.File]::ReadAllText($inputFile,[Text.Encoding]::GetEncoding(1253));if($text -notmatch 'VOID_DOCUMENT' -or $text -match 'PAY\|'){throw 'Unexpected synthetic command'};Remove-Item -LiteralPath $inputFile;[IO.File]::WriteAllBytes($resultFile,[Text.Encoding]::GetEncoding(1253).GetBytes($reply))} -ArgumentList $successInput,$successResult,$valid
 try {
  $success=Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 20
  Assert ($success.outcome -ceq 'VOID_CONFIRMED') 'Actual isolated VOID round-trip did not confirm.'
  Wait-Job $driver -Timeout 5 | Out-Null;Receive-Job $driver -ErrorAction Stop | Out-Null
  Complete-FtextCashReport $c $r.id
  MustThrow {Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 1}
 }finally{Remove-Job $driver -Force -ErrorAction SilentlyContinue}
 Write-Host ('FTEXT isolated VOID cases passed: '+$count)
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
