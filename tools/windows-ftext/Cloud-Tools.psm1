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
function Invoke-FtextCloudReadiness([string]$ConfigPath) {
    $config=Get-FtextCloudConfig $ConfigPath
    # Authenticate current installation before the nonfiscal STATUS command.
    Invoke-FtextCloudPing $config | Out-Null
    $pendingPath=Join-Path $config.workFolder '.mws-ftext-status.json';$started=$null
    if(Test-Path -LiteralPath $pendingPath) {
        $marker=Get-Content -LiteralPath $pendingPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $started=[DateTime]::Parse([string]$marker.createdAt,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    }
    $evidence=Invoke-FtextStatus -ConfigPath $ConfigPath -TimeoutSeconds 2
    if($null -ne $started) {
        $age=([DateTime]::UtcNow-$started).TotalSeconds
        if($age -ge 20 -or $age -lt -2) {
            # A recovered old STATUS proves history only. Consume it durably, then require a new round trip.
            $evidence=Invoke-FtextStatus -ConfigPath $ConfigPath -TimeoutSeconds 2;$started=$null
        }
    }
    $result=$evidence.result
    $checkedAt=if($null -ne $started){$started.ToString('o')}else{$evidence.checkedAt}
    $report=[ordered]@{requestId=$evidence.requestId;checkedAt=$checkedAt;ok=$result.ok;code=$result.code;fiscalExecution=$false}
    foreach($key in @('serialNumber','deviceTime','description')) {if($result.PSObject.Properties[$key]) {$report[$key]=$result.$key}}
    $token=Read-FtextDeviceToken $config
    # Local STATUS evidence is durable. An undelivered/stale readiness sample never authorizes checkout.
    Invoke-RestMethod -Method Post -Uri ($config.apiBase+'/api/ftext/v1/device/status-result') -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body ($report | ConvertTo-Json -Compress) -TimeoutSec 15 | Out-Null
    return $result.ok
}
function Invoke-FtextCashApi($Config,[string]$Action,$Body) {
    if($Action -notin @('cash-poll','cash-result','void-poll','void-result','error-evidence-poll','error-evidence-result','late-receipt-poll','late-receipt-result')) {throw 'Unsupported cash API action.'}
    $token=Read-FtextDeviceToken $Config
    return Invoke-RestMethod -Method Post -Uri ($Config.apiBase+'/api/ftext/v1/device/'+$Action) -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 30
}
Export-ModuleMember -Function Get-FtextCloudConfig,Get-FtextCredentialPath,Read-FtextDeviceToken,Confirm-FtextCloudIdentity,Invoke-FtextCloudPing,Invoke-FtextCloudReadiness,Invoke-FtextCashApi
