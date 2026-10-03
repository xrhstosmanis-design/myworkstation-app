param(
  [string]$ApiBase = $env:MWS_RBS_API_BASE,
  [string]$DeviceToken = $env:MWS_RBS_DEVICE_TOKEN,
  [string]$WorkFolder = $env:MWS_RBS_WORKFOLDER,
  [string]$LogPath = $env:MWS_RBS_LOG_PATH
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
$Headers = @{ Authorization = "Bearer $DeviceToken" }
if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = Join-Path $env:LOCALAPPDATA 'MyWorkStation\RbsCapDriverV1\writer.log'
}
$logDirectory = Split-Path -Parent $LogPath
if (-not [string]::IsNullOrWhiteSpace($logDirectory)) { New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null }

function Write-WriterLog([string]$EventName, [string]$Details = '') {
  $line = '{0} {1}{2}' -f ([DateTime]::UtcNow.ToString('o')), $EventName, $(if ($Details) { " $Details" } else { '' })
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Send-DispatchResult([string]$RequestId, [string]$Result) {
  $body = @{ result = $Result } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$ApiBase/api/cloud/v1/device/rbs-capdriver-v1/$RequestId/dispatch-result" -Headers $Headers -ContentType 'application/json' -Body $body | Out-Null
}

Write-WriterLog 'WRITER_START' ("api={0} workFolder={1}" -f $ApiBase, $WorkFolder)

while ($true) {
  try {
    $response = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/cloud/v1/device/rbs-capdriver-v1/next" -Headers $Headers -ContentType 'application/json' -Body '{}'
    $request = $response.request
    if ($null -eq $request) { Start-Sleep -Seconds 2; continue }
    Write-WriterLog 'REQUEST_CLAIMED' ("requestId={0}" -f $request.id)

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
    $safeRequestId = ([string]$request.id) -replace '[^A-Za-z0-9_-]', '_'
    if ([string]::IsNullOrWhiteSpace($safeRequestId)) {
      Send-DispatchResult $request.id 'UNCERTAIN'
      throw "CAP Driver request id cannot be converted to a safe file name."
    }
    $CommandPath = Join-Path $WorkFolder ("rbs.{0}.txt" -f $safeRequestId)
    if (Test-Path -LiteralPath $CommandPath) {
      Send-DispatchResult $request.id 'UNCERTAIN'
      throw "The request-specific CAP Driver file already exists. It was left untouched; request $($request.id) will not be requested again."
    }

    $tempPath = Join-Path $WorkFolder ('.rbs.' + $safeRequestId + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
      $stream = [IO.File]::Open($tempPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
      try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
      [IO.File]::Move($tempPath, $CommandPath)
      Send-DispatchResult $request.id 'WRITTEN'
      Write-WriterLog 'REQUEST_WRITTEN' ("requestId={0} path={1}" -f $request.id, $CommandPath)
    } catch {
      $writeError = $_
      if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue }
      try { Send-DispatchResult $request.id 'UNCERTAIN' } catch { }
      Write-WriterLog 'REQUEST_UNCERTAIN' ("requestId={0} error={1}" -f $request.id, $writeError.Exception.Message)
      throw "One-shot write failed for request $($request.id); it will not be requested again. $($writeError.Exception.Message)"
    }
  } catch {
    Write-WriterLog 'POLL_ERROR' $_.Exception.Message
    Write-Warning $_.Exception.Message
    Start-Sleep -Seconds 5
  }
}
