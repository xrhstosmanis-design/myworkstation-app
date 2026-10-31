$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
$root=Join-Path ([IO.Path]::GetTempPath()) ('ftext-cloud-fixture-'+[Guid]::NewGuid().ToString('N'))
$oldLocal=$env:LOCALAPPDATA
New-Item -ItemType Directory -Path $root | Out-Null
try {
    $env:LOCALAPPDATA=$root
    $c=[pscustomobject]@{companyId='fixture-company';storeId='fixture-store';terminalPos='POS-01';serialNumber='TEST12345';workFolder=(Join-Path $root 'work');settingsHash=('a'*64);apiBase='https://fixture.invalid';fiscalDeviceCode='FISCAL-01';protocol='SOLIDUS(II)T';configurationId=[Guid]::NewGuid().ToString();lifecycleGeneration='0'}
    $configPath=Join-Path $root 'config.json'
    $c | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    $loaded=Get-FtextCloudConfig $configPath
    if($loaded.settingsHash -cne $c.settingsHash) { throw 'Config did not round trip.' }
    $response=[pscustomobject]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;settingsHash=$c.settingsHash;settings=$c;fiscalCheckoutEnabled=$false}
    Confirm-FtextCloudIdentity $c $response
    foreach($key in @('companyId','storeId','terminalPos','settingsHash')) {
        $wrong=$response | ConvertTo-Json -Depth 5 | ConvertFrom-Json
        $wrong.$key='foreign'
        $rejected=$false;try { Confirm-FtextCloudIdentity $c $wrong } catch { $rejected=$true }
        if(-not $rejected) { throw "Wrong $key was accepted." }
    }
    foreach($key in @('serialNumber','workFolder','fiscalDeviceCode','configurationId','lifecycleGeneration','protocol')) {
        $wrong=$response | ConvertTo-Json -Depth 5 | ConvertFrom-Json
        $wrong.settings.$key='changed'
        $rejected=$false;try { Confirm-FtextCloudIdentity $c $wrong } catch { $rejected=$true }
        if(-not $rejected) { throw "Changed settings $key were accepted." }
    }
    $credentialPath=Get-FtextCredentialPath $c
    New-Item -ItemType Directory -Path (Split-Path -Parent $credentialPath) -Force | Out-Null
    $credential=New-Object Management.Automation.PSCredential($c.settingsHash,(ConvertTo-SecureString 'fixture-only-device-token' -AsPlainText -Force))
    $credential | Export-Clixml -LiteralPath $credentialPath
    if((Read-FtextDeviceToken $c) -cne 'fixture-only-device-token') { throw 'DPAPI credential did not round trip.' }
    if((Get-Content -LiteralPath $credentialPath -Raw).Contains('fixture-only-device-token')) { throw 'Credential was stored in clear text.' }
    $changed=$c | ConvertTo-Json | ConvertFrom-Json;$changed.settingsHash='b'*64
    $rejected=$false;try { Read-FtextDeviceToken $changed | Out-Null } catch { $rejected=$true }
    if(-not $rejected) { throw 'Changed settings used the previous credential.' }
    & (Get-Module 'Cloud-Tools') {
        param($config)
        function script:Invoke-RestMethod {param($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec);if($Headers.Authorization -cne 'Bearer fixture-only-device-token'){throw 'Wrong scoped device credential'};return [pscustomobject]@{uri=$Uri;body=$Body}}
        try {
            foreach($action in @('cash-poll','cash-result','void-poll','void-result','error-evidence-poll','error-evidence-result','late-receipt-poll','late-receipt-result')) {
                $reply=Invoke-FtextCashApi $config $action @{requestId='fixture'}
                if($reply.uri -cne ($config.apiBase+'/api/ftext/v1/device/'+$action) -or ($reply.body | ConvertFrom-Json).requestId -cne 'fixture'){throw 'Wrong authenticated ftext action'}
            }
            $rejected=$false;try{Invoke-FtextCashApi $config 'execute' @{} | Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Arbitrary execution API was allowed'}
        }finally{Remove-Item Function:script:Invoke-RestMethod -ErrorAction SilentlyContinue}
    } $c
    # One scoped work request replaces heartbeat plus four sequential polls.
    & (Get-Module 'Cloud-Tools') {
        param($config)
        $script:pollCalls=0;$script:pollForeign=$false;$script:pollWork=$false
        function script:Invoke-RestMethod {
            param($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec)
            $script:pollCalls++;$data=$Body | ConvertFrom-Json
            if(-not $Uri.EndsWith('/work-poll') -or $Headers.Authorization -cne 'Bearer fixture-only-device-token' -or $data.readinessVersion -ne 1 -or $data.recovering -isnot [bool]) {throw 'Wrong combined authenticated request'}
            return [pscustomobject]@{companyId=$config.companyId;storeId=$config.storeId;terminalPos=$config.terminalPos;settingsHash=$(if($script:pollForeign){'b'*64}else{$config.settingsHash});settings=$config;fiscalCheckoutEnabled=$false;request=$(if($script:pollWork){@{id='unexpected'}}else{$null});lateReceipt=$null;errorEvidence=$null}
        }
        try {
            $reply=Invoke-FtextCloudPoll $config $false
            if($script:pollCalls -ne 1 -or $reply.request){throw 'Idle work discovery did not use exactly one cloud call'}
            Invoke-FtextCloudPoll $config $true | Out-Null
            $script:pollForeign=$true;$refused=$false;try{Invoke-FtextCloudPoll $config $false | Out-Null}catch{$refused=$true};if(-not $refused){throw 'Foreign combined response was accepted'}
            $script:pollForeign=$false;$script:pollWork=$true;$refused=$false;try{Invoke-FtextCloudPoll $config $true | Out-Null}catch{$refused=$true};if(-not $refused){throw 'New work interrupted original-result recovery'}
        }finally{Remove-Item Function:script:Invoke-RestMethod -ErrorAction SilentlyContinue}
    } $c
    # A recovered old STATUS must not make a closed driver look ready after a restart.
    $readyFolder=Join-Path $root 'readiness';New-Item -ItemType Directory -Path $readyFolder | Out-Null
    $readyConfig=$c | ConvertTo-Json -Depth 12 | ConvertFrom-Json;$readyConfig.workFolder=$readyFolder
    $readyConfigPath=Join-Path $readyFolder 'config.json';$readyConfig | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $readyConfigPath -Encoding UTF8
    & (Get-Module 'Cloud-Tools') {
        param($config,$path)
        $script:readyConfig=$config;$script:statusReads=0;$script:readyPosts=0;$script:stalePhase=$true
        function script:Invoke-RestMethod {
            param($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec)
            if($Headers.Authorization -cne 'Bearer fixture-only-device-token'){throw 'Wrong readiness credential'}
            if($Uri.EndsWith('/ping')){return [pscustomobject]@{companyId=$script:readyConfig.companyId;storeId=$script:readyConfig.storeId;terminalPos=$script:readyConfig.terminalPos;settingsHash=$script:readyConfig.settingsHash;settings=$script:readyConfig;fiscalCheckoutEnabled=$false}}
            if(-not $Uri.EndsWith('/status-result')){throw 'Unexpected readiness action'}
            $script:readyPosts++;$script:lastReadinessBody=$Body | ConvertFrom-Json;return @{ok=$true}
        }
        function script:Invoke-FtextStatus {
            param($ConfigPath,$TimeoutSeconds)
            $script:statusReads++
            if($script:stalePhase -and $script:statusReads -eq 2){throw 'Synthetic current driver closed'}
            return [pscustomobject]@{requestId=('a'*32);checkedAt=[DateTime]::UtcNow.ToString('o');result=[pscustomobject]@{ok=$true;code=0;serialNumber=$script:readyConfig.serialNumber;deviceTime='fixture clock';fiscalExecution=$false}}
        }
        try {
            $marker=Join-Path $config.workFolder '.mws-ftext-status.json'
            @{id=('a'*32);command='STATUS';companyId=$config.companyId;storeId=$config.storeId;terminalPos=$config.terminalPos;serialNumber=$config.serialNumber;createdAt=[DateTime]::UtcNow.AddHours(-1).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8
            $rejected=$false;try{Invoke-FtextCloudReadiness $path | Out-Null}catch{$rejected=$true}
            if(-not $rejected -or $script:statusReads -ne 2 -or $script:readyPosts -ne 0){throw 'Old recovered STATUS authorized readiness without a fresh driver response.'}
            $script:stalePhase=$false;$script:statusReads=0;$started=[DateTime]::UtcNow.AddSeconds(-5).ToString('o')
            @{id=('a'*32);command='STATUS';companyId=$config.companyId;storeId=$config.storeId;terminalPos=$config.terminalPos;serialNumber=$config.serialNumber;createdAt=$started} | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8
            $ok=Invoke-FtextCloudReadiness $path
            if(-not $ok -or $script:statusReads -ne 1 -or $script:readyPosts -ne 1 -or $script:lastReadinessBody.checkedAt -cne $started){throw 'Recent recovered STATUS was re-dated or not delivered.'}
        }finally{
            Remove-Item Function:script:Invoke-RestMethod -ErrorAction SilentlyContinue
            Remove-Item Function:script:Invoke-FtextStatus -ErrorAction SilentlyContinue
        }
    } $readyConfig $readyConfigPath
    Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force

    # Exercise the production connector loop across two lost HTTP outcomes, without any fiscal transport.
    $harness=Join-Path $root 'retry-harness';New-Item -ItemType Directory -Path $harness | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Cloud-Connector.ps1') -Destination (Join-Path $harness 'Cloud-Connector.ps1')
    $retryLog=Join-Path $harness 'calls.jsonl';$retryConfig=Join-Path $harness 'config.json'
    $retry=$c | ConvertTo-Json -Depth 12 | ConvertFrom-Json;$retry | Add-Member NoteProperty cashEnabled $true
    $retry | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $retryConfig -Encoding UTF8
    $mockCloud=@'
$script:pings=0;$script:posts=0;$script:done=$false
function Get-FtextCloudConfig($Path){return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json}
function Invoke-FtextCloudReadiness($ConfigPath){return $true}
function Invoke-FtextCloudPing($Config){$script:pings++;if($script:pings -eq 1){throw 'Synthetic lost heartbeat'};return @{ok=$true}}
function Invoke-FtextCloudPoll($Config,$Recovering){
 Invoke-FtextCloudPing $Config | Out-Null
 [IO.File]::AppendAllText($env:MWS_FTEXT_RETRY_LOG,((@{action='work-poll';body=@{recovering=$Recovering}}|ConvertTo-Json -Compress)+"`n"))
 return @{request=$null;lateReceipt=$(if($script:done){$null}else{@{id='370a0232-aeb7-4320-9919-d96c3f9f52d5'}});errorEvidence=$null}
}
function Invoke-FtextCashApi($Config,$Action,$Body){
 [IO.File]::AppendAllText($env:MWS_FTEXT_RETRY_LOG,((@{action=$Action;body=$Body}|ConvertTo-Json -Depth 12 -Compress)+"`n"))
 switch($Action){
  'late-receipt-poll' {if($script:done){return @{request=$null}};return @{request=@{id='370a0232-aeb7-4320-9919-d96c3f9f52d5'}}}
  'late-receipt-result' {$script:posts++;if($script:posts -eq 1){throw 'Synthetic lost acknowledgement'};$script:done=$true;return @{ok=$true;requestId=$Body.requestId;status='CONFIRMED';allowResend=$false}}
  'void-poll' {return @{request=$null}}
  'cash-poll' {return @{request=$null}}
  'error-evidence-poll' {return @{request=$null}}
  default {throw 'Unexpected action in retry harness'}
 }
}
Export-ModuleMember -Function Get-FtextCloudConfig,Invoke-FtextCloudPing,Invoke-FtextCloudPoll,Invoke-FtextCloudReadiness,Invoke-FtextCashApi
'@
    $mockCash=@'
function Get-FtextCashPending($Config){return $null}
function Read-FtextLateReceiptEvidence($Config,$Request){return @{requestId=$Request.id;originalProof='same original bytes'}}
function Invoke-FtextCashRequest { [IO.File]::AppendAllText($env:MWS_FTEXT_RETRY_LOG,'FISCAL_DISPATCH');throw 'Unexpected fiscal transport' }
Export-ModuleMember -Function Get-FtextCashPending,Read-FtextLateReceiptEvidence,Invoke-FtextCashRequest
'@
    Set-Content -LiteralPath (Join-Path $harness 'Cloud-Tools.psm1') -Value $mockCloud -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $harness 'Cash.psm1') -Value $mockCash -Encoding UTF8
    $oldRetryLog=$env:MWS_FTEXT_RETRY_LOG;$env:MWS_FTEXT_RETRY_LOG=$retryLog
    try {
        & {
            $script:fixtureCycles=0
            function Start-Sleep {param($Seconds);$script:fixtureCycles++;if($script:fixtureCycles -ge 4){throw 'Synthetic loop complete'}}
            try {& (Join-Path $harness 'Cloud-Connector.ps1') -ConfigPath $retryConfig}catch{if($_.Exception.Message -cne 'Synthetic loop complete'){throw}}
        }
        $calls=@(Get-Content -LiteralPath $retryLog | ForEach-Object {$_ | ConvertFrom-Json})
        $posts=@($calls | Where-Object {$_.action -ceq 'late-receipt-result'})
        if($posts.Count -ne 2 -or ($posts[0].body | ConvertTo-Json -Compress) -cne ($posts[1].body | ConvertTo-Json -Compress)){throw 'Lost HTTP outcome did not retry the same original proof.'}
        if(@($calls | Where-Object {$_.action -in @('cash-result','void-result')}).Count -ne 0){throw 'Recovery retried fiscal dispatch instead of evidence.'}
        if(@($calls | Where-Object {$_.action -in @('cash-poll','void-poll','late-receipt-poll','error-evidence-poll')}).Count -ne 0){throw 'Connector still issued sequential legacy work polls.'}
    }finally{$env:MWS_FTEXT_RETRY_LOG=$oldRetryLog}

    # No credential means no network call and no physical STATUS input.
    Remove-Item -LiteralPath $credentialPath
    New-Item -ItemType Directory -Path $c.workFolder | Out-Null
    $rejected=$false;try { & (Join-Path $PSScriptRoot 'Cloud-Test.ps1') -ConfigPath $configPath } catch { $rejected=$true }
    if(-not $rejected -or @(Get-ChildItem -LiteralPath $c.workFolder -File).Count -ne 0) { throw 'Unpaired check reached physical transport.' }
    $rejected=$false;try {Invoke-FtextCloudReadiness $configPath | Out-Null}catch{$rejected=$true}
    if(-not $rejected -or @(Get-ChildItem -LiteralPath $c.workFolder -File).Count -ne 0){throw 'Unpaired automatic readiness reached physical STATUS.'}
    Write-Host 'PASS: config, 10 foreign/settings boundaries, Windows DPAPI, credential rotation and unpaired no-STATUS.'
} finally {
    $env:LOCALAPPDATA=$oldLocal
    Remove-Item -LiteralPath $root -Recurse -Force
}
