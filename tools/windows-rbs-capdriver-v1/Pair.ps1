param(
  [string]$ApiBase = $env:MWS_RBS_API_BASE,
  [string]$PairingCode,
  [string]$DeviceName = 'MyWorkStation RBS CAP Driver v1',
  [string]$ExpectedStoreId
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ApiBase)) {
  throw 'Set MWS_RBS_API_BASE to the MyWorkStation service base URL.'
}
if ([string]::IsNullOrWhiteSpace($PairingCode)) {
  $PairingCode = Read-Host 'MyWorkStation pairing code'
}
if ([string]::IsNullOrWhiteSpace($PairingCode)) { throw 'A pairing code is required.' }

$apiUri = $null
if (-not [Uri]::TryCreate($ApiBase.Trim(), [UriKind]::Absolute, [ref]$apiUri) -or $apiUri.Scheme -ne 'https' -or -not [string]::IsNullOrEmpty($apiUri.UserInfo)) {
  throw 'MWS_RBS_API_BASE must be an absolute HTTPS URL without embedded credentials.'
}
$ApiBase = $apiUri.GetLeftPart([UriPartial]::Path).TrimEnd('/')
$body = @{
  code = $PairingCode.Trim()
  deviceName = $DeviceName
  platform = 'WINDOWS_RBS_CAPDRIVER_V1'
} | ConvertTo-Json -Compress
$response = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/cloud/v1/pair" -ContentType 'application/json' -Body $body
if ([string]::IsNullOrWhiteSpace([string]$response.token)) { throw 'MyWorkStation did not return a device token.' }
if ($ExpectedStoreId -and [string]$response.store.id -ne $ExpectedStoreId) { throw 'Pairing code belongs to another store. Existing local token was left unchanged. Get a new code from the correct store.' }

$directory = Join-Path $env:LOCALAPPDATA 'MyWorkStation\RbsCapDriverV1'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$credentialPath = Join-Path $directory 'device.credential.xml'
$secureToken = ConvertTo-SecureString ([string]$response.token) -AsPlainText -Force
$credential = New-Object Management.Automation.PSCredential('MyWorkStation CAP Driver device', $secureToken)
$credential | Export-Clixml -LiteralPath $credentialPath
Write-Host "Paired device $($response.device.id) for store $($response.store.name). Token saved encrypted for this Windows user."
