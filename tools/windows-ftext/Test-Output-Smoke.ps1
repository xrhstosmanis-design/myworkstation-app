$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Ftext.psm1') -Force
$root=Join-Path ([IO.Path]::GetTempPath()) ('mws-output-'+[Guid]::NewGuid().ToString('N'))
function Assert-Output($Condition,[string]$Message) {if(-not $Condition) {throw $Message}}
function Reject-Output([scriptblock]$Action) {$failed=$false;try {& $Action | Out-Null} catch {$failed=$true};Assert-Output $failed ('Expected OUTPUT refusal: '+$Action.ToString())}
try {
 $folder=Join-Path $root 'input';$null=[IO.Directory]::CreateDirectory($folder)
 $c=[pscustomobject]@{companyId='output-company';storeId='output-store';terminalPos='POS-01';serialNumber='OUTPUT123';settingsHash=('a'*64);workFolder=$folder}
 $output=Get-FtextOutputRoot $c
 Assert-Output (-not $output.StartsWith($folder+[IO.Path]::DirectorySeparatorChar)) 'OUTPUT is inside vendor input.'
 $statusBytes=[Text.Encoding]::GetEncoding(1253).GetBytes("0`r`n17`r`n42`r`nOUTPUT123`r`nfixture time`r`n`r`n`r`n`r`n")
 $status=Read-FtextStatusResult $statusBytes $c.serialNumber
 $statusId='1'*32;$prefix=Join-Path $folder ('mws-status-'+$statusId)
 [IO.File]::WriteAllBytes(($prefix+'.res'),$statusBytes)
 $e=[ordered]@{requestId=$statusId;companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;checkedAt=[DateTime]::UtcNow.ToString('o');result=$status}
 [IO.File]::WriteAllText(($prefix+'.json'),($e | ConvertTo-Json -Depth 6))
 $stamp=[DateTime]::UtcNow.AddDays(-2);[IO.File]::SetLastWriteTimeUtc(($prefix+'.res'),$stamp)
 $protected=Join-Path $folder 'mws-cash-11111111-1111-4111-8111-111111111111.res';[IO.File]::WriteAllText($protected,'UNCERTAIN ORIGINAL')
 $foreign=Join-Path $folder 'foreign.txt';[IO.File]::WriteAllText($foreign,'INPUT')
 Reject-Output {Invoke-FtextOutputArchive $c STATUS ([pscustomobject]@{requestId=$statusId})}
 Assert-Output (Test-Path -LiteralPath ($prefix+'.json')) 'Busy input lost evidence.'
 Remove-Item -LiteralPath $foreign
 $wrong=$e | ConvertTo-Json -Depth 6 | ConvertFrom-Json;$wrong.storeId='foreign';[IO.File]::WriteAllText(($prefix+'.json'),($wrong | ConvertTo-Json -Depth 6))
 Reject-Output {Invoke-FtextOutputArchive $c STATUS ([pscustomobject]@{requestId=$statusId})}
 [IO.File]::WriteAllText(($prefix+'.json'),($e | ConvertTo-Json -Depth 6))
 $moved=Invoke-FtextOutputArchive $c STATUS ([pscustomobject]@{requestId=$statusId})
 Assert-Output ($moved.movedFiles -eq 2) 'Successful STATUS pair was not moved.'
 Assert-Output ([Math]::Abs(((Get-Item -LiteralPath (Join-Path $moved.outputPath ('mws-status-'+$statusId+'.res'))).LastWriteTimeUtc-$stamp).TotalSeconds) -lt 0.01) 'Original timestamp changed.'
 Assert-Output ([IO.File]::ReadAllText($protected) -ceq 'UNCERTAIN ORIGINAL') 'Uncertain fiscal evidence changed.'
 Reject-Output {Invoke-FtextOutputArchive $c STATUS ([pscustomobject]@{requestId=$statusId})}
 $id='22222222-2222-4222-8222-222222222222';$prefix=Join-Path $folder ('mws-cash-'+$id)
 $raw=[Text.Encoding]::UTF8.GetBytes('ORIGINAL FINAL RECEIPT BYTES');[IO.File]::WriteAllBytes(($prefix+'.res'),$raw)
 $rawHash=(Get-FileHash -LiteralPath ($prefix+'.res') -Algorithm SHA256).Hash.ToLowerInvariant()
 $report=[ordered]@{requestId=$id;settingsHash=$c.settingsHash;outcome='CONFIRMED';code=0;serialNumber=$c.serialNumber;rawResultHash=$rawHash}
 $intent=[ordered]@{requestId=$id;settingsHash=$c.settingsHash;commandHash=('b'*64)}
 $nonce='33333333-3333-4333-8333-333333333333'
 $publish=[ordered]@{requestId=$id;settingsHash=$c.settingsHash;commandHash=('b'*64);nonce=$nonce;acceptedAt=[DateTime]::UtcNow.ToString('o')}
 foreach($entry in @(@('.intent.json',$intent),@('.publish.json',$publish),@('.report.json',$report))) {[IO.File]::WriteAllText(($prefix+$entry[0]),($entry[1] | ConvertTo-Json -Compress))}
 $proof=[pscustomobject]@{requestId=$id;resultHash=('c'*64);result=[pscustomobject]$report;commandHash=('b'*64);nonce=$nonce;saleId='fixture-sale'}
 $bad=$proof | ConvertTo-Json -Depth 10 | ConvertFrom-Json;$bad.result.code=101
 Reject-Output {Invoke-FtextOutputArchive $c CASH $bad}
 $before=@{};foreach($suffix in @('.intent.json','.publish.json','.report.json','.res')) {$before[$suffix]=(Get-FileHash -LiteralPath ($prefix+$suffix) -Algorithm SHA256).Hash}
 # Interrupt after the first atomic move, leaving a durable pinned journal.
 $module=(Get-Command Invoke-FtextOutputArchive).Module
 & $module {param($Path);$script:OutputInterruptPath=$Path;$script:OutputOriginalHash=${function:Get-FtextArchiveHash};Set-Item Function:script:Get-FtextArchiveHash -Value {param($Path);if($Path -ceq $script:OutputInterruptPath -and (Test-Path -LiteralPath $Path)) {throw 'Fixture interruption after first move'};& $script:OutputOriginalHash $Path}} (Join-Path $output ('CASH\'+$id+'\mws-cash-'+$id+'.intent.json'))
 try {Reject-Output {Invoke-FtextOutputArchive $c CASH $proof}} finally {& $module {Set-Item Function:script:Get-FtextArchiveHash -Value $script:OutputOriginalHash}}
 Assert-Output ($null -ne (Get-FtextOutputPending $c)) 'Interrupted move lost its recovery journal.'
 Reject-Output {Assert-FtextOutputRequestNotArchived $c $id}
 $moved=Invoke-FtextOutputArchive $c CASH $proof
 Assert-Output ($moved.movedFiles -eq 3) 'Partial move did not resume exactly remaining files.'
 Assert-Output ($null -eq (Get-FtextOutputPending $c)) 'Completed output left an active journal.'
 foreach($suffix in $before.Keys) {Assert-Output ((Get-FileHash -LiteralPath (Join-Path $moved.outputPath ('mws-cash-'+$id+$suffix)) -Algorithm SHA256).Hash -ceq $before[$suffix]) 'Archived original bytes changed.'}
 Reject-Output {Assert-FtextOutputRequestNotArchived $c $id}
 Assert-FtextOutputRequestNotArchived $c '44444444-4444-4444-8444-444444444444'
 $config=Join-Path $root 'config.json';$c | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
 Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {& (Get-Module Cash) {param($Fixture);$script:OutputFixture=$Fixture;Set-Item Function:script:Get-FtextConfig -Value {param($Path);return $script:OutputFixture}} $c}
 $refused=$false;try {Invoke-FtextCashRequest -ConfigPath $config -Request ([pscustomobject]@{id=$id}) | Out-Null} catch {$refused=$_.Exception.Message -like '*archiv*'}
 Assert-Output $refused 'Archived request reached fiscal command generation.'
 Assert-Output (@([IO.Directory]::GetFiles($folder,'*.txt')).Count -eq 0) 'Archived request emitted new fiscal input.'
 Write-Host 'OUTPUT smoke PASS: exact STATUS/committed groups, immutable bytes/timestamps, pending retention, collision, interruption/restart and actual cash replay refusal.'
} finally {if(Test-Path -LiteralPath $root) {Remove-Item -LiteralPath $root -Recurse -Force};if(Test-Path -LiteralPath ($folder+'_OUTPUT')) {Remove-Item -LiteralPath ($folder+'_OUTPUT') -Recurse -Force}}
