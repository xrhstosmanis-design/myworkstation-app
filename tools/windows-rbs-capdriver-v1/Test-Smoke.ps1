$ErrorActionPreference = 'Stop'
$pairScript = Join-Path $PSScriptRoot 'Pair.ps1'
$writerScript = Join-Path $PSScriptRoot 'Writer.ps1'
$connectionScript = Join-Path $PSScriptRoot 'Test-Connection.ps1'

foreach ($scriptPath in @($pairScript, $writerScript, $connectionScript)) {
  $tokens = $null
  $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath,
    [ref]$tokens,
    [ref]$parseErrors
  ) | Out-Null
  if ($parseErrors.Count -gt 0) {
    $parseErrors | ForEach-Object { Write-Error $_.Message }
    throw "PowerShell parse failed: $scriptPath"
  }
}

$script:networkCalls = 0
$script:nextCalls = 0
$global:MwsCapSmokeStatusCalls = 0
$script:dispatchResults = New-Object 'System.Collections.Generic.List[string]'
$script:mockStopped = $false
$crlf = ([string][char]13) + ([string][char]10)
$itemName = 'TEST' + [char]0x0394 + 'OKIMH'
$script:commandText = 'HL/' + $crlf + 'SL/' + $itemName + '//1.000/1.00/1/13.0' + $crlf + 'CR/6/1.00/CASH'
$encoding = [Text.Encoding]::GetEncoding(1253)
$commandBytes = $encoding.GetBytes($script:commandText + $crlf)
$sha = [Security.Cryptography.SHA256]::Create()
try {
  $script:commandHash = [BitConverter]::ToString($sha.ComputeHash($commandBytes)).Replace('-', '').ToLowerInvariant()
} finally {
  $sha.Dispose()
}

function Invoke-RestMethod {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [string]$ContentType,
    [string]$Body
  )
  $script:networkCalls++
  Write-Host "Mock request: $Method $Uri"
  if ($Uri -match '/api/cloud/v1/pair$') {
    return [pscustomobject]@{
      token = 'mock-device-token-for-local-smoke-test'
      device = [pscustomobject]@{ id = 'mock-device' }
      store = [pscustomobject]@{ name = 'Mock Store' }
    }
  }
  if ($Uri -match '/rbs-capdriver-v1/next$') {
    $script:nextCalls++
    if ($script:nextCalls -eq 1) {
      return [pscustomobject]@{
        request = [pscustomobject]@{
          id = 'mock-request'
          commandText = $script:commandText
          commandHash = $script:commandHash
        }
      }
    }
    $script:mockStopped = $true
    throw 'MOCK_STOP_AFTER_ONE_REQUEST'
  }
  if ($Uri -match '/rbs-capdriver-v1/status$') {
    $global:MwsCapSmokeStatusCalls++
    return [pscustomobject]@{ ok = $true; connectionOk = $true; writerOnline = $false; claimsRequest = $false }
  }
  if ($Uri -match '/rbs-capdriver-v1/mock-request/dispatch-result$') {
    $payload = ConvertFrom-Json $Body
    $script:dispatchResults.Add([string]$payload.result)
    return [pscustomobject]@{ ok = $true }
  }
  throw "Unexpected request in isolated PowerShell smoke test: $Uri"
}

function Assert-RejectedHttp([string]$ScriptPath, [hashtable]$Arguments) {
  try {
    & $ScriptPath @Arguments
    throw "Expected HTTPS validation to reject $ScriptPath"
  } catch {
    if ($_.Exception.Message -notmatch 'absolute HTTPS') { throw }
  }
}

$testRoot = Join-Path $env:TEMP ("mws-capdriver-smoke-" + [guid]::NewGuid().ToString('N'))
$previousLocalAppData = $env:LOCALAPPDATA
try {
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  $env:LOCALAPPDATA = Join-Path $testRoot 'localappdata'
  New-Item -ItemType Directory -Path $env:LOCALAPPDATA -Force | Out-Null

  Assert-RejectedHttp $pairScript @{ ApiBase = 'http://unit.test'; PairingCode = '12345678' }
  Assert-RejectedHttp $writerScript @{ ApiBase = 'http://unit.test'; DeviceToken = 'fake-token'; WorkFolder = (Join-Path $testRoot 'work') }
  Assert-RejectedHttp $connectionScript @{ ApiBase = 'http://unit.test'; DeviceToken = 'fake-token'; WorkFolder = (Join-Path $testRoot 'work') }
  if ($script:networkCalls -ne 0) { throw 'An HTTP request occurred before insecure URL rejection.' }

  & $pairScript -ApiBase 'https://unit.test' -PairingCode '12345678'
  $credentialPath = Join-Path $env:LOCALAPPDATA 'MyWorkStation\RbsCapDriverV1\device.credential.xml'
  if (-not (Test-Path -LiteralPath $credentialPath)) { throw 'Pair.ps1 did not persist the mocked device credential.' }
  $credential = Import-Clixml -LiteralPath $credentialPath
  if ($credential.GetNetworkCredential().Password -ne 'mock-device-token-for-local-smoke-test') {
    throw 'Pair.ps1 credential did not round-trip under the test Windows user.'
  }

  $writerWorkPath = Join-Path $testRoot 'work'
  New-Item -ItemType Directory -Path $writerWorkPath -Force | Out-Null
  & $connectionScript -ApiBase 'https://unit.test' -DeviceToken 'fake-token' -WorkFolder $writerWorkPath
  if (@(Get-ChildItem -LiteralPath $writerWorkPath -Filter 'rbs.*.txt' -File -ErrorAction SilentlyContinue).Count -ne 0) { throw 'Connection test created a CAP Driver command file.' }
  $previousApiBase = $env:MWS_RBS_API_BASE
  $previousDeviceToken = $env:MWS_RBS_DEVICE_TOKEN
  $previousWorkFolder = $env:MWS_RBS_WORKFOLDER
  try {
    $env:MWS_RBS_API_BASE = 'https://unit.test'
    $env:MWS_RBS_DEVICE_TOKEN = 'fake-token'
    $env:MWS_RBS_WORKFOLDER = $writerWorkPath
    $boundedWriter = [IO.File]::ReadAllText($writerScript)
    if ([regex]::Matches($boundedWriter, [regex]::Escape('while ($true) {')).Count -ne 1) { throw 'Expected exactly one writer polling loop.' }
    $boundedWriter = $boundedWriter.Replace('while ($true) {', 'for ($iteration = 0; $iteration -lt 1; $iteration++) {')
    Invoke-Expression $boundedWriter
  } finally {
    $env:MWS_RBS_API_BASE = $previousApiBase
    $env:MWS_RBS_DEVICE_TOKEN = $previousDeviceToken
    $env:MWS_RBS_WORKFOLDER = $previousWorkFolder
  }

  $commandPath = Join-Path $writerWorkPath 'rbs.mock-request.txt'
  if (-not (Test-Path -LiteralPath $commandPath)) { throw 'Writer.ps1 did not create the request-specific rbs.*.txt command file.' }
  $actual = [IO.File]::ReadAllBytes($commandPath)
  if ([Convert]::ToBase64String($actual) -ne [Convert]::ToBase64String($commandBytes)) {
    throw 'Writer.ps1 output bytes did not match the expected Windows-1253 command.'
  }
  if ($script:dispatchResults.Count -ne 1 -or $script:dispatchResults[0] -ne 'WRITTEN') {
    throw 'Writer.ps1 did not acknowledge exactly one successful file write.'
  }
  if ($script:nextCalls -ne 1) { throw "Unexpected request polling count: $($script:nextCalls)" }
  if ($global:MwsCapSmokeStatusCalls -ne 1) { throw "Unexpected writer status count: $($global:MwsCapSmokeStatusCalls)" }
  Write-Host 'CAP Driver PowerShell isolated smoke tests passed.'
} finally {
  $env:LOCALAPPDATA = $previousLocalAppData
  Remove-Variable -Name MwsCapSmokeStatusCalls -Scope Global -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
