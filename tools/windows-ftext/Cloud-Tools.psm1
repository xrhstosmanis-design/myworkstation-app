Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
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
}
function Invoke-FtextCloudPing($Config) {
    $token=Read-FtextDeviceToken $Config
    $response=Invoke-RestMethod -Method Post -Uri ($Config.apiBase+'/api/ftext/v1/device/ping') -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body '{}'
    Confirm-FtextCloudIdentity $Config $response
    return $response
}
function Invoke-FtextCashApi($Config,[string]$Action,$Body) {
    if($Action -notin @('cash-poll','cash-result')) {throw 'Unsupported cash API action.'}
    $token=Read-FtextDeviceToken $Config
    return Invoke-RestMethod -Method Post -Uri ($Config.apiBase+'/api/ftext/v1/device/'+$Action) -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 30
}
Export-ModuleMember -Function Get-FtextCloudConfig,Get-FtextCredentialPath,Read-FtextDeviceToken,Confirm-FtextCloudIdentity,Invoke-FtextCloudPing,Invoke-FtextCashApi
