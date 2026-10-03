param(
  [string]$ApiBase = $env:MWS_RBS_API_BASE,
  [string]$DeviceToken = $env:MWS_RBS_DEVICE_TOKEN,
  [string]$WorkFolder = $env:MWS_RBS_WORKFOLDER,
  [string]$ExpectedStoreId
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ApiBase)) { throw 'Set MWS_RBS_API_BASE before testing the writer connection.' }
if ([string]::IsNullOrWhiteSpace($DeviceToken)) {
  $credentialPath = Join-Path $env:LOCALAPPDATA 'MyWorkStation\RbsCapDriverV1\device.credential.xml'
  if (Test-Path -LiteralPath $credentialPath) {
    $credential = Import-Clixml -LiteralPath $credentialPath
    $DeviceToken = $credential.GetNetworkCredential().Password
  }
}
if ([string]::IsNullOrWhiteSpace($DeviceToken)) { throw 'Pair this Windows user with Pair.ps1 before testing the writer connection.' }
if ([string]::IsNullOrWhiteSpace($WorkFolder)) { $WorkFolder = 'C:\capture' }
$apiUri = $null
if (-not [Uri]::TryCreate($ApiBase.Trim(), [UriKind]::Absolute, [ref]$apiUri) -or $apiUri.Scheme -ne 'https' -or -not [string]::IsNullOrEmpty($apiUri.UserInfo)) {
  throw 'MWS_RBS_API_BASE must be an absolute HTTPS URL without embedded credentials.'
}
$ApiBase = $apiUri.GetLeftPart([UriPartial]::Path).TrimEnd('/')
$WorkFolder = [IO.Path]::GetFullPath($WorkFolder)
if (-not (Test-Path -LiteralPath $WorkFolder -PathType Container)) { throw "CAP Driver work folder does not exist: $WorkFolder" }

$headers = @{ Authorization = "Bearer $DeviceToken" }
$result = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/cloud/v1/device/rbs-capdriver-v1/status" -Headers $headers -ContentType 'application/json' -Body '{}'
if (-not $result.connectionOk -or $result.writerOnline -or $result.claimsRequest) { throw 'MyWorkStation did not confirm the safe Writer connection check.' }
if ($ExpectedStoreId -and [string]$result.storeId -ne $ExpectedStoreId) { throw 'The saved Windows credential belongs to another store. Pair with the correct store before starting Writer.' }

Write-Host 'PASS: Writer authentication and server connection are valid.'
Write-Host "PASS: CAP Driver work folder exists: $WorkFolder"
Write-Host 'SAFE: No request was claimed and no Xcommand.txt was created by this test.'
