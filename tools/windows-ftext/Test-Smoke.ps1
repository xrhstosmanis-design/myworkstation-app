$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Ftext.psm1') -Force
$passed = 0
function Assert([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message }; $script:passed++ }
function MustThrow([scriptblock]$Action,[string]$Message) { $threw=$false; try { & $Action | Out-Null } catch { $threw=$true }; Assert $threw $Message }
$enc=[Text.Encoding]::GetEncoding(1253)
$serial='TEST12345'
$valid="0`r`n17`r`n42`r`n$serial`r`n20261022120000`r`n`r`n`r`n`r`n"
$result=Read-FtextStatusResult $enc.GetBytes($valid) $serial
Assert ($result.ok -and -not $result.fiscalExecution -and $result.dayCounter -eq '42') 'Valid status must not confirm fiscal execution.'
$failed=Read-FtextStatusResult $enc.GetBytes("101`r`nNo response from device`r`nSTATUS`r`n") $serial
Assert (-not $failed.ok -and $failed.code -eq 101) 'Vendor error must remain failure.'
foreach($bad in @('',"0`r`n",$valid.TrimEnd(),$valid.Replace($serial,'WRONG_SERIAL'),$valid.Replace("17`r`n","oops`r`n"),"101`r`nMissing command`r`n",("0`r`n"+[char]0))) {
    MustThrow { Read-FtextStatusResult $enc.GetBytes($bad) $serial } 'Invalid/partial/foreign response was accepted.'
}
$root=Join-Path ([IO.Path]::GetTempPath()) ('mws-ftext-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$config=Join-Path $root 'config.json'
$c=[ordered]@{companyId='test-company';storeId='test-store';terminalPos='TEST-POS-01';serialNumber=$serial;workFolder=$root}
$c | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
try {
    # Pending other-software input is never executed, overwritten or deleted.
    $other=Join-Path $root 'simple.txt';[IO.File]::WriteAllText($other,'DO NOT TOUCH')
    MustThrow { Invoke-FtextStatus -ConfigPath $config -TimeoutSeconds 1 } 'Existing input must block STATUS.'
    Assert ((Get-Content -LiteralPath $other -Raw) -eq 'DO NOT TOUCH') 'Other input changed.'
    Remove-Item -LiteralPath $other
    # A real file dispatch to the isolated folder, then timeout: no mock callbacks.
    MustThrow { Invoke-FtextStatus -ConfigPath $config -TimeoutSeconds 1 } 'Missing driver must time out.'
    $inputs=@(Get-ChildItem -LiteralPath $root -Filter '*.txt')
    Assert ($inputs.Count -eq 1) 'Exactly one command must be published.'
    $inputPath=$inputs[0].FullName
    $command=[IO.File]::ReadAllText($inputPath,$enc)
    $lines=@($command -split '\r\n')
    Assert ($lines[0].StartsWith('RESULT_FILENAME|') -and $lines[1] -ceq 'STATUS' -and $lines.Length -eq 3) 'Only STATUS may be emitted.'
    $resultPath=$lines[0].Substring('RESULT_FILENAME|'.Length)
    Assert ($resultPath -ne $inputPath -and [IO.Path]::GetDirectoryName($resultPath) -eq $root) 'Unique result must stay in the selected folder.'
    # Resume a wrong device result must neither resend nor resolve the marker.
    [IO.File]::WriteAllBytes($resultPath,$enc.GetBytes($valid.Replace($serial,'OTHER123')))
    MustThrow { Invoke-FtextStatus -ConfigPath $config -TimeoutSeconds 1 } 'Wrong device must fail.'
    Assert (@(Get-ChildItem -LiteralPath $root -Filter '*.txt').Count -eq 1) 'Timeout/wrong serial resent a command.'
    Assert (Test-Path -LiteralPath (Join-Path $root '.mws-ftext-status.json')) 'Uncertainty marker was lost.'
    # Correct late response resolves the original request, not a new command.
    [IO.File]::WriteAllBytes($resultPath,$enc.GetBytes($valid))
    $evidence=Invoke-FtextStatus -ConfigPath $config -TimeoutSeconds 1
    Assert ($evidence.result.ok -and $evidence.terminalPos -eq 'TEST-POS-01') 'Late verified result was not recovered.'
    Assert (@(Get-ChildItem -LiteralPath $root -Filter '*.txt').Count -eq 1) 'Recovery resent a command.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $root '.mws-ftext-status.json'))) 'Completed marker not resolved.'
    Assert (Test-Path -LiteralPath (Join-Path $root ('mws-status-'+$evidence.requestId+'.json'))) 'Durable evidence missing.'
    Remove-Item -LiteralPath $inputPath
    # A second installation cannot take ownership of an unresolved check.
    MustThrow { Invoke-FtextStatus -ConfigPath $config -TimeoutSeconds 1 } 'Expected a new isolated timeout.'
    $c.storeId='foreign-store';$c | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
    MustThrow { Invoke-FtextStatus -ConfigPath $config -TimeoutSeconds 1 } 'Foreign scope must be rejected.'
    Assert (@(Get-ChildItem -LiteralPath $root -Filter '*.txt').Count -eq 1) 'Foreign scope wrote another input.'
    # Hold the same folder mutex in a distinct process; the other process must refuse.
    $c.storeId='test-store';$c | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
    $sha=[Security.Cryptography.SHA256]::Create()
    try { $hash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToUpperInvariant()))).Replace('-','') } finally { $sha.Dispose() }
    $mutex=New-Object Threading.Mutex($false,('Global\MyWorkStationFtext_'+$hash))
    $held=$mutex.WaitOne(0);$job=$null
    try {
        Assert $held 'Could not acquire test folder mutex.'
        $job=Start-Job -ArgumentList (Join-Path $PSScriptRoot 'Ftext.psm1'),$config -ScriptBlock {
            param($module,$config)
            Import-Module $module -Force
            try { Invoke-FtextStatus -ConfigPath $config -TimeoutSeconds 1 | Out-Null; 'UNEXPECTED_SUCCESS' } catch { $_.Exception.Message }
        }
        $done=Wait-Job $job -Timeout 15
        Assert ($null -ne $done) 'Concurrent process did not finish.'
        $message=Receive-Job $job
        Assert ([string]$message -match 'Another connector') 'Concurrent process did not reject the folder lock.'
    } finally { if ($null -ne $job) { Stop-Job $job; Remove-Job $job }; if ($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
    $c.storeId='test-store';$c.workFolder='C:\';$c | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
    MustThrow { Get-FtextConfig $config } 'Drive root must be rejected.'
    Write-Host "FTEXT STATUS isolated tests: $passed PASS"
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
