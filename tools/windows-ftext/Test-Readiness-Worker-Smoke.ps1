$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=Join-Path ([IO.Path]::GetTempPath()) ('mws-readiness-worker-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$worker=$null
try {
    # Real PowerShell runspace implementation; isolate all network/driver work.
    Copy-Item (Join-Path $PSScriptRoot 'Ftext.psm1') (Join-Path $root 'Ftext.psm1')
    $source=Get-Content (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Raw
    $source+=@'

function Invoke-FtextCloudReadiness([string]$ConfigPath,[int]$TimeoutSeconds) {
    if($TimeoutSeconds -ne 30) {throw 'Wrong worker wait budget'}
    $case=Get-Content -LiteralPath $ConfigPath -Raw
    [IO.File]::WriteAllText(($ConfigPath+'.started'),'started')
    if($case -eq 'stop') {Start-Sleep -Seconds 30;[IO.File]::WriteAllText(($ConfigPath+'.finished'),'unexpected');return $true}
    if($case -eq 'scheduled') {$script:FtextReadinessRefreshAt=[DateTime]::UtcNow.AddSeconds(5);return $true}
    if($case -eq 'delayed') {Start-Sleep -Seconds 6;return $true}
    Start-Sleep -Milliseconds 300
    switch($case) {'true' {return $true};'false' {return $false};'error' {throw 'Synthetic driver failure'};default{return 'not verified'}}
}
'@
    $modulePath=Join-Path $root 'Cloud-Tools.psm1';Set-Content $modulePath $source -Encoding UTF8
    Import-Module $modulePath -Force
    $now=[DateTime]::UtcNow
    $normal=Get-FtextReadinessRefreshAt $now $now $now 6
    if(($normal-$now).TotalSeconds -ne 10){throw 'Normal proof did not leave bounded work opportunity'}
    foreach($elapsed in @(20,30)) {if((Get-FtextReadinessRefreshAt $now $now $now $elapsed) -ne $now){throw 'Slow STATUS extended proof'}}
    if((Get-FtextReadinessRefreshAt ($now.AddSeconds(-19)) $now $now 6) -ne $now){throw 'Old original proof was re-dated'}
    if((Get-FtextReadinessRefreshAt ($now.AddSeconds(3)) $now $now 6) -ne $now){throw 'Future proof scheduled a delay'}
    foreach($case in @('true','scheduled','delayed','false','error','invalid','stop')) {
        $path=Join-Path $root ($case+'.json');[IO.File]::WriteAllText($path,$case)
        $clock=[Diagnostics.Stopwatch]::StartNew();$worker=Start-FtextCloudReadiness $path
        if($clock.Elapsed.TotalSeconds -gt 5) {throw 'Starting worker blocked its caller'}
        $deadline=[DateTime]::UtcNow.AddSeconds(10)
        while(-not (Test-Path ($path+'.started')) -and [DateTime]::UtcNow -lt $deadline) {Start-Sleep -Milliseconds 20}
        if(-not (Test-Path ($path+'.started'))) {throw 'Worker did not run in isolated runspace'}
        if($case -eq 'stop') {
            Stop-FtextCloudReadiness $worker;$worker=$null
            if(Test-Path ($path+'.finished')) {throw 'Stopped worker finished driver work'}
            continue
        }
        $ticks=0
        while(-not $worker.Async.IsCompleted -and [DateTime]::UtcNow -lt $deadline) {$ticks++;Start-Sleep -Milliseconds 20}
        if($case -eq 'delayed' -and $ticks -lt 20) {throw 'Caller did not continue during delayed STATUS'}
        if(-not $worker.Async.IsCompleted) {throw 'Worker did not finish'}
        $rejected=$false;$value=$null;$completedWorker=$worker
        try {$value=Receive-FtextCloudReadiness $worker} catch {$rejected=$true} finally {$worker=$null}
        if($case -in @('error','invalid')) {if(-not $rejected) {throw 'Failed/malformed worker was accepted'}}
        elseif($rejected -or $value -isnot [bool] -or $value -ne ($case -in @('true','scheduled','delayed')))  {throw 'Worker did not return actual boolean readiness'}
        if($case -eq 'scheduled' -and $completedWorker.RefreshAt -le [DateTime]::UtcNow){throw 'Runspace lost its original scheduling hint'}
    }

    # Actual connector loop with controlled worker completion, no network or
    # fiscal command. Polls must progress in recovering mode while it is busy.
    Copy-Item (Join-Path $PSScriptRoot 'Cloud-Connector.ps1') (Join-Path $root 'Cloud-Connector.ps1')
    $mock=@'
$script:polls=0;$script:worker=$null;$script:started=0;$script:received=0;$script:stopped=0;$script:flags=@()
function Get-FtextCloudConfig($Path) {return [pscustomobject]@{companyId='fixture-company';storeId='fixture-store';terminalPos='POS-01';cashEnabled=$true}}
function Invoke-FtextCloudPoll($Config,$Recovering,$Version) {
    $script:polls++;$script:flags+=,[bool]$Recovering
    if($script:polls -eq 4) {$script:worker.Async.IsCompleted=$true}
    if($script:polls -in @(2,3,4) -and -not $Recovering) {throw 'Worker allowed a new claim'}
    if($script:polls -eq 5 -and ($Recovering -or $script:received -ne 1)) {throw 'Worker was not joined before ordinary discovery'}
    return @{request=$null;lateReceipt=$null;errorEvidence=$null}
}
function Start-FtextCloudReadiness($Path) {
    if($script:worker -and -not $script:worker.Async.IsCompleted) {throw 'Second concurrent worker'}
    $script:started++;$script:worker=@{Async=@{IsCompleted=$false}};return $script:worker
}
function Receive-FtextCloudReadiness($Worker) {$script:received++;if($global:MwsReadinessFixtureSchedule){$Worker | Add-Member -NotePropertyName RefreshAt -NotePropertyValue ([DateTime]::UtcNow.AddSeconds(5)) -Force};return $true}
function Set-ReadinessFixture($Schedule) {$script:polls=0;$script:worker=$null;$script:started=0;$script:received=0;$script:stopped=0;$script:flags=@();$global:MwsReadinessFixtureSchedule=$Schedule}
function Stop-FtextCloudReadiness($Worker) {if($Worker){$script:stopped++}}
function Get-ReadinessFixture {return @{polls=$script:polls;started=$script:started;received=$script:received;stopped=$script:stopped;flags=$script:flags}}
Export-ModuleMember -Function Get-FtextCloudConfig,Invoke-FtextCloudPoll,Start-FtextCloudReadiness,Receive-FtextCloudReadiness,Stop-FtextCloudReadiness,Get-ReadinessFixture,Set-ReadinessFixture
'@
    Set-Content $modulePath $mock -Encoding UTF8
    # Use single-quoted content so no caller variable is interpolated.
    Set-Content (Join-Path $root 'Cash.psm1') 'function Get-FtextCashPending($Config){return $null};Export-ModuleMember -Function Get-FtextCashPending' -Encoding UTF8
    Import-Module $modulePath -Force
    foreach($schedule in @($false,$true)) {
    Set-ReadinessFixture $schedule
    & {
        $global:MwsReadinessFixtureCycles=0
        function Start-Sleep {param($Seconds);$global:MwsReadinessFixtureCycles++;if($global:MwsReadinessFixtureCycles -eq 7) {throw 'Fixture complete'}}
        try {& (Join-Path $root 'Cloud-Connector.ps1') -ConfigPath 'fixture'} catch {if($_.Exception.Message -cne 'Fixture complete') {throw}}
    }
    $observed=Get-ReadinessFixture
    $expectedStarts=if($schedule){1}else{2};$expectedStops=if($schedule){0}else{1}
    if($observed.polls -ne 7 -or $observed.started -ne $expectedStarts -or $observed.received -ne 1 -or $observed.stopped -ne $expectedStops) {throw 'Actual connector did not progress, serialize and dispose readiness'}
    if($observed.flags[0] -or $observed.flags[4] -or -not $observed.flags[1] -or -not $observed.flags[2] -or -not $observed.flags[3]) {throw 'Incorrect original-work recovery/claim fence'}
    if($observed.flags[5] -ne (-not $schedule) -or $observed.flags[6] -ne (-not $schedule)){throw 'Acknowledged proof did not leave work discovery available'}
    }
    Write-Host 'PASS: actual readiness runspace delayed success/failure/invalid/stop; connector heartbeat progress, no claims while busy, join and disposal.'
} finally {
    Remove-Variable MwsReadinessFixtureSchedule -Scope Global -ErrorAction SilentlyContinue
    Remove-Variable MwsReadinessFixtureCycles -Scope Global -ErrorAction SilentlyContinue
    if($worker) {Stop-FtextCloudReadiness $worker}
    Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
    Remove-Item $root -Recurse -Force
}
