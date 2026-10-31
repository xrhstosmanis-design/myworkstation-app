Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Ftext.psm1') -Force
function Get-FtextCloudConfig([string]$Path) {
    $c=Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach($key in @('companyId','storeId','terminalPos','serialNumber','workFolder','settingsHash','apiBase','fiscalDeviceCode','protocol','configurationId','lifecycleGeneration')) {
        if(-not $c.PSObject.Properties[$key] -or [string]::IsNullOrWhiteSpace([string]$c.$key)) { throw "Missing configuration: $key" }
    }
    foreach($key in @('companyId','storeId','terminalPos','serialNumber')) { if([string]$c.$key -notmatch '^[A-Za-z0-9_-]{2,120}$') { throw 'Invalid installation identity.' } }
    if([string]$c.settingsHash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid settings hash.' }
    $uri=$null
    if(-not [Uri]::TryCreate([string]$c.apiBase,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) { throw 'The API must be an absolute HTTPS origin.' }
    $c.apiBase=$uri.GetLeftPart([UriPartial]::Authority)
    return $c
}
function Get-FtextCredentialPath($Config) {
    return Join-Path $env:LOCALAPPDATA ('MyWorkStation\Ftext\'+$Config.companyId+'\'+$Config.storeId+'\'+$Config.terminalPos+'\device.credential.xml')
}
function Read-FtextDeviceToken($Config) {
    $path=Get-FtextCredentialPath $Config
    if(-not (Test-Path -LiteralPath $path)) { throw 'Pair this Windows user first.' }
    $credential=Import-Clixml -LiteralPath $path
    if($credential.UserName -cne $Config.settingsHash) { throw 'Settings changed. Download the current package and pair again.' }
    return $credential.GetNetworkCredential().Password
}
function Confirm-FtextCloudIdentity($Config,$Response) {
    foreach($key in @('companyId','storeId','terminalPos','settingsHash')) { if([string]$Response.$key -cne [string]$Config.$key) { throw 'Cloud identity does not match this installation.' } }
    foreach($key in @('companyId','storeId','terminalPos','fiscalDeviceCode','serialNumber','workFolder','protocol','configurationId','lifecycleGeneration')) { if([string]$Response.settings.$key -cne [string]$Config.$key) { throw 'Local settings do not match the signed cloud installation.' } }
    if($Response.fiscalCheckoutEnabled -ne $false) { throw 'Unsupported fiscal protocol capability.' }
    $localCash=$Config.PSObject.Properties['cashEnabled'] -and $Config.cashEnabled -eq $true
    $cloudCash=$Response.settings.PSObject.Properties['cashEnabled'] -and $Response.settings.cashEnabled -eq $true
    if([bool]$localCash -ne [bool]$cloudCash) { throw 'Cash capability changed. Download and pair the current package.' }
    $localCard=$Config.PSObject.Properties['cardEnabled'] -and $Config.cardEnabled -eq $true
    $cloudCard=$Response.settings.PSObject.Properties['cardEnabled'] -and $Response.settings.cardEnabled -eq $true
    if([bool]$localCard -ne [bool]$cloudCard) {throw 'Card capability changed. Download and pair the current package.'}
    if($localCard) {foreach($field in @('code','posTerminalId','transactionType','resultFormat','confirmed')) {if([string]$Config.cardPayment.$field -cne [string]$Response.settings.cardPayment.$field) {throw 'Card profile changed. Download and pair the current package.'}}}

}
function Invoke-FtextCloudPing($Config) {
    $token=Read-FtextDeviceToken $Config
    $response=Invoke-RestMethod -Method Post -Uri ($Config.apiBase+'/api/ftext/v1/device/ping') -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body '{"readinessVersion":1}' -TimeoutSec 15
    Confirm-FtextCloudIdentity $Config $response
    return $response
}
function Invoke-FtextCloudPoll($Config,[bool]$Recovering=$false) {
    $token=Read-FtextDeviceToken $Config
    $settings=[ordered]@{}
    foreach($key in @('companyId','storeId','terminalPos','fiscalDeviceCode','serialNumber','workFolder','protocol','configurationId','lifecycleGeneration','cashEnabled','cashDepartments','cardEnabled','cardPayment')) {
        if($Config.PSObject.Properties[$key]) {$settings[$key]=$Config.$key}
    }
    $body=@{readinessVersion=1;recovering=$Recovering;settingsHash=$Config.settingsHash;settings=$settings;handoffVersion=1} | ConvertTo-Json -Depth 12 -Compress
    $response=Invoke-RestMethod -Method Post -Uri ($Config.apiBase+'/api/ftext/v1/device/work-poll') -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body $body -TimeoutSec 15
    Confirm-FtextCloudIdentity $Config $response
    foreach($key in @('request','lateReceipt','errorEvidence')) {if(-not $response.PSObject.Properties[$key]) {throw 'Incomplete scoped work response.'}}
    if($Recovering -and ($response.request -or $response.lateReceipt -or $response.errorEvidence)) {throw 'Cloud returned new work during original-result recovery.'}
    return $response
}
function Invoke-FtextCloudReadiness([string]$ConfigPath) {
    $config=Get-FtextCloudConfig $ConfigPath
    # Authenticate current installation before the nonfiscal STATUS command.
    Invoke-FtextCloudPing $config | Out-Null
    $pendingPath=Join-Path $config.workFolder '.mws-ftext-status.json';$started=$null
    if(Test-Path -LiteralPath $pendingPath) {
        $marker=Get-Content -LiteralPath $pendingPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $started=[DateTime]::Parse([string]$marker.createdAt,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    }
    $evidence=Invoke-FtextStatus -ConfigPath $ConfigPath -TimeoutSeconds 5
    if($null -ne $started) {
        $age=([DateTime]::UtcNow-$started).TotalSeconds
        if($age -ge 20 -or $age -lt -2) {
            # A recovered old STATUS proves history only. Consume it durably, then require a new round trip.
            $evidence=Invoke-FtextStatus -ConfigPath $ConfigPath -TimeoutSeconds 5;$started=$null
        }
    }
    $result=$evidence.result
    $checkedAt=if($null -ne $started){$started.ToString('o')}else{$evidence.checkedAt}
    $report=[ordered]@{requestId=$evidence.requestId;checkedAt=$checkedAt;ok=$result.ok;code=$result.code;fiscalExecution=$false}
    foreach($key in @('serialNumber','deviceTime','description')) {if($result.PSObject.Properties[$key]) {$report[$key]=$result.$key}}
    $token=Read-FtextDeviceToken $config
    # Local STATUS evidence is durable. An undelivered/stale readiness sample never authorizes checkout.
    Invoke-RestMethod -Method Post -Uri ($config.apiBase+'/api/ftext/v1/device/status-result') -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body ($report | ConvertTo-Json -Compress) -TimeoutSec 15 | Out-Null
    if(-not $result.ok) {Write-Host ('Register STATUS code: '+[int]$result.code+'. No payment was sent.')}
    return $result.ok
}
function Invoke-FtextCashApi($Config,[string]$Action,$Body) {
    if($Action -notin @('cash-poll','cash-result','void-poll','void-result','error-evidence-poll','error-evidence-result','late-receipt-poll','late-receipt-result','cash-handoff-accept')) {throw 'Unsupported cash API action.'}
    $token=Read-FtextDeviceToken $Config
    return Invoke-RestMethod -Method Post -Uri ($Config.apiBase+'/api/ftext/v1/device/'+$Action) -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 30
}
function Invoke-FtextCloudHandoff([string]$ConfigPath,$Request,[string]$CommandHash) {
    $config=Get-FtextCloudConfig $ConfigPath
    $assertOriginal={
        $prefix=Join-Path $config.workFolder ('mws-cash-'+$Request.id)
        if(Test-Path -LiteralPath ($prefix+'.publish.json')) {throw 'Publication journal exists. Authorization cannot publish again.'}
        $intent=Get-Content -LiteralPath ($prefix+'.intent.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $active=Get-Content -LiteralPath (Join-Path $config.workFolder '.mws-ftext-cash.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if([string]$intent.requestId -cne [string]$Request.id -or [string]$intent.commandHash -cne $CommandHash -or [string]$intent.settingsHash -cne [string]$config.settingsHash -or [string]$active.request.id -cne [string]$Request.id -or [string]$active.request.handoff.nonce -cne [string]$Request.handoff.nonce -or [string]$active.request.handoff.commandHash -cne $CommandHash) {throw 'Original local handoff evidence is missing or changed.'}
        foreach($key in @('companyId','storeId','terminalPos','serialNumber','settingsHash')) {if([string]$active.$key -cne [string]$config.$key) {throw 'Original active handoff belongs to another installation.'}}
        foreach($suffix in @('.pending','.txt','.res','.report.json')) {if(Test-Path -LiteralPath ($prefix+$suffix)) {throw 'Original fiscal evidence exists. Authorization cannot publish again.'}}
    }
    for($attempt=0;$attempt -lt 2;$attempt++) {
        & $assertOriginal
        $clear=-not (Test-Path -LiteralPath (Join-Path $config.workFolder '.mws-ftext-status.json')) -and @(Get-ChildItem -LiteralPath $config.workFolder -Filter '*.txt' -File).Count -eq 0
        $body=@{requestId=[string]$Request.id;settingsHash=[string]$config.settingsHash;nonce=[string]$Request.handoff.nonce;commandHash=$CommandHash;readyForExecution=[bool]$clear}
        $ack=Invoke-FtextCashApi $config 'cash-handoff-accept' $body
        if($ack.ok -ne $true -or $ack.version -ne 1 -or [string]$ack.requestId -cne [string]$Request.id -or [string]$ack.settingsHash -cne [string]$config.settingsHash -or [string]$ack.nonce -cne [string]$Request.handoff.nonce -or [string]$ack.commandHash -cne $CommandHash -or $ack.requiresReadiness -isnot [bool]) {throw 'Invalid original handoff acknowledgement.'}
        if([string]$ack.state -ceq 'ACCEPTED') {
            if($null -eq $ack.authorization -or [string]$ack.authorization.id -cne [string]$Request.handoff.nonce -or [string]::IsNullOrWhiteSpace([string]$ack.authorization.acceptedAt)) {throw 'Invalid immutable original authorization.'}
            [void][DateTimeOffset]::Parse([string]$ack.authorization.acceptedAt,[Globalization.CultureInfo]::InvariantCulture)
            if($ack.requiresReadiness -eq $false) {
                if(-not $clear) {throw 'Local input is not clear for first publication.'}
                & $assertOriginal
                return [pscustomobject]@{requestId=$ack.requestId;settingsHash=$ack.settingsHash;nonce=$ack.nonce;commandHash=$ack.commandHash;acceptedAt=$ack.authorization.acceptedAt}
            }
        } elseif([string]$ack.state -cne 'OFFERED' -or $null -ne $ack.authorization -or $ack.requiresReadiness -ne $true) {throw 'Original handoff is not eligible for first publication.'}
        # Only the durable original evidence with NO publication journal allows
        # nonfiscal readiness refresh before the first possible publication.
        & $assertOriginal
        Invoke-FtextCloudReadiness $ConfigPath | Out-Null
    }
    throw 'Fresh readiness was not acknowledged before first publication. Original files retained.'
}
Export-ModuleMember -Function Get-FtextCloudConfig,Get-FtextCredentialPath,Read-FtextDeviceToken,Confirm-FtextCloudIdentity,Invoke-FtextCloudPing,Invoke-FtextCloudPoll,Invoke-FtextCloudReadiness,Invoke-FtextCashApi,Invoke-FtextCloudHandoff
