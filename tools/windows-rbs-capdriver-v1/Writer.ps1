param(
  [string]$ApiBase = $env:MWS_RBS_API_BASE,
  [string]$DeviceToken = $env:MWS_RBS_DEVICE_TOKEN,
  [string]$WorkFolder = $env:MWS_RBS_WORKFOLDER
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ApiBase)) { throw 'Set MWS_RBS_API_BASE before starting the writer.' }
if ([string]::IsNullOrWhiteSpace($DeviceToken)) {
  $credentialPath = Join-Path $env:LOCALAPPDATA 'MyWorkStation\RbsCapDriverV1\device.credential.xml'
  if (Test-Path -LiteralPath $credentialPath) {
    $credential = Import-Clixml -LiteralPath $credentialPath
    $DeviceToken = $credential.GetNetworkCredential().Password
  }
}
if ([string]::IsNullOrWhiteSpace($DeviceToken)) { throw 'Pair this Windows user with Pair.ps1 before starting the writer.' }
if ([string]::IsNullOrWhiteSpace($WorkFolder)) { $WorkFolder = 'C:\capture' }
$apiUri = $null
if (-not [Uri]::TryCreate($ApiBase.Trim(), [UriKind]::Absolute, [ref]$apiUri) -or $apiUri.Scheme -ne 'https' -or -not [string]::IsNullOrEmpty($apiUri.UserInfo)) {
  throw 'MWS_RBS_API_BASE must be an absolute HTTPS URL without embedded credentials.'
}
$ApiBase = $apiUri.GetLeftPart([UriPartial]::Path).TrimEnd('/')
$WorkFolder = [IO.Path]::GetFullPath($WorkFolder)
$CommandPath = Join-Path $WorkFolder 'Xcommand.txt'
$Headers = @{ Authorization = "Bearer $DeviceToken" }

function Send-DispatchResult([string]$RequestId, [string]$Result) {
  $body = @{ result = $Result } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$ApiBase/api/cloud/v1/device/rbs-capdriver-v1/$RequestId/dispatch-result" -Headers $Headers -ContentType 'application/json' -Body $body | Out-Null
}

while ($true) {
  try {
    $response = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/cloud/v1/device/rbs-capdriver-v1/next" -Headers $Headers -ContentType 'application/json' -Body '{}'
    $request = $response.request
    if ($null -eq $request) { Start-Sleep -Seconds 2; continue }

    $command = [string]$request.commandText + "`r`n"
    try { $encoding = [Text.Encoding]::GetEncoding(1253) } catch {
      [Text.Encoding]::RegisterProvider([Text.CodePagesEncodingProvider]::Instance)
      $encoding = [Text.Encoding]::GetEncoding(1253)
    }
    $bytes = $encoding.GetBytes($command)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    if ($hash -ne ([string]$request.commandHash).ToLowerInvariant()) {
      Send-DispatchResult $request.id 'UNCERTAIN'
      throw "Command integrity check failed for request $($request.id). It will not be requested again."
    }
    if (-not (Test-Path -LiteralPath $WorkFolder -PathType Container)) {
      Send-DispatchResult $request.id 'UNCERTAIN'
      throw "CAP Driver work folder is missing. Request $($request.id) will not be requested again."
    }
    if (Test-Path -LiteralPath $CommandPath) {
      Send-DispatchResult $request.id 'UNCERTAIN'
      throw "Xcommand.txt already exists. It was left untouched; request $($request.id) will not be requested again."
    }

    $tempPath = Join-Path $WorkFolder ('.Xcommand.' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
      $stream = [IO.File]::Open($tempPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
      try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
      [IO.File]::Move($tempPath, $CommandPath)
      Send-DispatchResult $request.id 'WRITTEN'
    } catch {
      $writeError = $_
      if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue }
      try { Send-DispatchResult $request.id 'UNCERTAIN' } catch { }
      throw "One-shot write failed for request $($request.id); it will not be requested again. $($writeError.Exception.Message)"
    }
  } catch {
    Write-Error $_
    Start-Sleep -Seconds 5
  }
}
