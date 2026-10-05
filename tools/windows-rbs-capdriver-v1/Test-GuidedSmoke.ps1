$ErrorActionPreference = 'Stop'
$root = Join-Path $env:TEMP ('mws-guided-' + [guid]::NewGuid().ToString('N'))
$previousLocalAppData = $env:LOCALAPPDATA
$global:MwsGuidedStatusCalls = 0
function Invoke-RestMethod {
  param($Method, $Uri, $Headers, $ContentType, $Body)
  if ($Uri -notmatch '/rbs-capdriver-v1/status$') { throw 'Unexpected network call: guided checks must not claim or dispatch.' }
  $global:MwsGuidedStatusCalls++
  return [pscustomobject]@{ connectionOk = $true; writerOnline = $false; claimsRequest = $false; storeId = 'guided-store' }
}
try {
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  foreach ($name in @('Connector-Tools.ps1','Guided-Setup.ps1','Start-Connector.ps1')) {
    $tokens = $null; $errors = $null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors) | Out-Null
    if ($errors.Count) { throw ('Guided parse errors: ' + ($errors.Message -join '; ')) }
  }
  $tail = ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Remote-Install.template.cmd')) -split '(?m)^# MWS_GUIDED_POWERSHELL_BEGIN\r?$',2)[1]
  $tokens = $null; $errors = $null
  [Management.Automation.Language.Parser]::ParseInput($tail,[ref]$tokens,[ref]$errors) | Out-Null
  if ($errors.Count) { throw 'The self-contained double-click launcher failed PowerShell parsing.' }

  $env:LOCALAPPDATA = Join-Path $root 'appdata'
  $folderName = "Greek-" + [char]0x0394 + " ' & folder"
  $directory = Join-Path $root $folderName
  $workFolder = Join-Path $root 'CAP folder'
  foreach ($path in @($directory,$workFolder,$env:LOCALAPPDATA)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
  foreach ($name in @('Pair.ps1','Test-Connection.ps1','Writer.ps1','Connector-Tools.ps1','Guided-Setup.ps1','Start-Connector.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $directory $name)
  }
  $config = [pscustomobject]@{ apiBase = 'https://unit.test'; storeId = 'guided-store'; storeName = 'CI Guided Store'; terminalPos = 'POS-01'; workFolder = $workFolder; revision = 'smoke' }
  $configPath = Join-Path $directory 'installation.json'
  $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
  $credentialFolder = Join-Path $env:LOCALAPPDATA 'MyWorkStation\RbsCapDriverV1'
  New-Item -ItemType Directory -Path $credentialFolder -Force | Out-Null
  $credential = New-Object Management.Automation.PSCredential('CI device',(ConvertTo-SecureString 'fake-device-credential' -AsPlainText -Force))
  $credential | Export-Clixml -LiteralPath (Join-Path $credentialFolder 'device.credential.xml')
  . (Join-Path $directory 'Connector-Tools.ps1')
  $loaded = Read-MwsConnectorConfig $configPath
  Invoke-MwsConnectionCheck $loaded $directory
  if ($global:MwsGuidedStatusCalls -ne 1 -or @(Get-ChildItem -LiteralPath $workFolder -Force).Count) { throw 'Safe connection check claimed a command or left a probe behind.' }
  $loaded.storeId = 'wrong-store'
  try { Invoke-MwsConnectionCheck $loaded $directory; throw 'Wrong store was accepted.' } catch { if ($_.Exception.Message -notmatch 'another store') { throw } }
  $loaded.workFolder = Join-Path $root 'missing'
  try { Invoke-MwsConnectionCheck $loaded $directory; throw 'Missing CAP folder was accepted.' } catch { if ($_.Exception.Message -match 'was accepted') { throw } }
  if ($global:MwsGuidedStatusCalls -ne 2) { throw 'Missing folder reached the server.' }

  $mutex = Enter-MwsConnectorLock
  $parallel = [PowerShell]::Create()
  try {
    $null = $parallel.AddScript({ param($Tools) . $Tools; $lock = $null; try { $lock = Enter-MwsConnectorLock; 'ACQUIRED' } catch { 'BLOCKED' } finally { Exit-MwsConnectorLock $lock } }.ToString()).AddArgument((Join-Path $directory 'Connector-Tools.ps1'))
    $result = $parallel.Invoke()
    if ($result.Count -ne 1 -or $result[0] -ne 'BLOCKED') { throw 'Second guided connector was not blocked.' }
  } finally { $parallel.Dispose(); Exit-MwsConnectorLock $mutex }
  $mutex = Enter-MwsConnectorLock
  Exit-MwsConnectorLock $mutex

  $desktop = Join-Path $root 'desktop'; $startup = Join-Path $root 'startup'
  New-Item -ItemType Directory -Path $desktop,$startup -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $startup 'unrelated.txt') -Value 'KEEP'
  Set-MwsConnectorShortcuts $configPath $true $desktop $startup
  Set-MwsConnectorShortcuts $configPath $true $desktop $startup
  $shortcutPath = Join-Path $startup 'MyWorkStation - RBS Connector.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  if (@(Get-ChildItem -LiteralPath $startup -Filter '*.lnk').Count -ne 1) { throw 'Repeated setup created duplicate startup entries.' }
  if ($shortcut.Arguments -notmatch '-EncodedCommand ([A-Za-z0-9+/=]+)$') { throw 'Startup command was not safely encoded.' }
  $decoded = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($Matches[1]))
  $expected = "& '" + (Join-Path $directory 'Start-Connector.ps1').Replace("'","''") + "' -ConfigPath '" + $configPath.Replace("'","''") + "'"
  if ($decoded -ne $expected -or $decoded.Contains('fake-device-credential')) { throw 'Startup paths did not round-trip without credentials.' }
  Set-MwsConnectorShortcuts $configPath $false $desktop $startup
  if ((Test-Path -LiteralPath $shortcutPath) -or -not (Test-Path -LiteralPath (Join-Path $startup 'unrelated.txt'))) { throw 'Startup removal affected unrelated items or left the connector enabled.' }
  if (-not (Test-Path -LiteralPath (Join-Path $desktop 'MyWorkStation - RBS Setup.lnk'))) { throw 'Desktop setup shortcut is missing.' }

  $beforePreview = $global:MwsGuidedStatusCalls
  $previewFolder = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
  $preview = Join-Path $previewFolder 'mws-guided-setup-preview.png'
  & (Join-Path $directory 'Guided-Setup.ps1') -ConfigPath $configPath -PreviewPath $preview
  if (-not (Test-Path -LiteralPath $preview) -or $global:MwsGuidedStatusCalls -ne $beforePreview) { throw 'Opening the GUI made a network call or failed to render.' }
  Write-Host 'Guided Windows smoke PASS: parse, no claim, expected store, folder probe cleanup, singleton, encoded paths, reversible current-user startup and offline GUI render.'
} finally {
  $env:LOCALAPPDATA = $previousLocalAppData
  Remove-Variable -Name MwsGuidedStatusCalls -Scope Global -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
