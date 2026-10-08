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
  if (-not (Get-MwsConnectorStartupPreference $configPath $startup)) { throw 'Reopening setup forgot its saved startup preference.' }
  if (Get-MwsConnectorStartupPreference (Join-Path $root 'other-store.json') $startup) { throw 'Another store inherited a saved startup preference.' }
  $shortcutPath = Join-Path $startup 'MyWorkStation - RBS Connector.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  if (@(Get-ChildItem -LiteralPath $startup -Filter '*.lnk').Count -ne 1) { throw 'Repeated setup created duplicate startup entries.' }
  if ($shortcut.Arguments -notmatch '-EncodedCommand ([A-Za-z0-9+/=]+)$') { throw 'Startup command was not safely encoded.' }
  $decoded = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($Matches[1]))
  $expected = "& '" + (Join-Path $directory 'Start-Connector.ps1').Replace("'","''") + "' -ConfigPath '" + $configPath.Replace("'","''") + "'"
  if ($decoded -ne $expected -or $decoded.Contains('fake-device-credential')) { throw 'Startup paths did not round-trip without credentials.' }
  Set-MwsConnectorShortcuts $configPath $false $desktop $startup
  if (Get-MwsConnectorStartupPreference $configPath $startup) { throw 'Disabled startup still appeared selected.' }
  if ((Test-Path -LiteralPath $shortcutPath) -or -not (Test-Path -LiteralPath (Join-Path $startup 'unrelated.txt'))) { throw 'Startup removal affected unrelated items or left the connector enabled.' }
  if (-not (Test-Path -LiteralPath (Join-Path $desktop 'MyWorkStation - RBS Setup.lnk'))) { throw 'Desktop setup shortcut is missing.' }

  $connectorShortcut = $shell.CreateShortcut((Join-Path $desktop 'MyWorkStation - RBS Connector.lnk'))
  if ($connectorShortcut.Arguments -notmatch '-EncodedCommand ([A-Za-z0-9+/=]+)$') { throw 'Desktop recovery shortcut is missing or unsafe.' }
  $recoveryCommand = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($Matches[1]))
  if ($recoveryCommand -ne $expected -or $recoveryCommand.Contains('fake-device-credential')) { throw 'Desktop recovery bypassed the store-checked singleton runner.' }

  # Reproduce the store's actual failure: the Writer owns its mutex while a
  # different UI thread checks status and saves/removes the startup preference.
  $mutex = Enter-MwsConnectorLock
  $parallel = [PowerShell]::Create()
  try {
    $null = $parallel.AddScript({
      param($Tools,$ConfigFile,$Directory,$Desktop,$Startup)
      $ErrorActionPreference = 'Stop'
      . $Tools
      function Invoke-RestMethod {
        param($Method,$Uri,$Headers,$ContentType,$Body)
        if ($Uri -notmatch '/rbs-capdriver-v1/status$') { throw 'Setup claimed a request or paired during the safe status check.' }
        return [pscustomobject]@{connectionOk=$true;writerOnline=$false;claimsRequest=$false;storeId='guided-store'}
      }
      $config = Read-MwsConnectorConfig $ConfigFile
      Invoke-MwsGuidedConnectionOperation $config $Directory 'Test' ''
      Save-MwsConnectorStartupPreference $ConfigFile $true $true $true $true $Desktop $Startup
      Save-MwsConnectorStartupPreference $ConfigFile $true $true $true $true $Desktop $Startup
      if (@(Get-ChildItem -LiteralPath $Startup -Filter '*.lnk').Count -ne 1) { throw 'Running Writer caused missing or duplicate startup entries.' }
      Save-MwsConnectorStartupPreference $ConfigFile $false $true $true $true $Desktop $Startup
      if (Test-Path -LiteralPath (Join-Path $Startup 'MyWorkStation - RBS Connector.lnk')) { throw 'Startup removal failed with an active Writer.' }
      foreach ($guards in @(@($false,$true,$true),@($true,$false,$true),@($true,$true,$false))) {
        try {
          Save-MwsConnectorStartupPreference $ConfigFile $true $guards[0] $guards[1] $guards[2] $Desktop $Startup
          throw 'Unverified setup was allowed to save startup.'
        } catch { if ($_.Exception.Message -match 'was allowed') { throw } }
      }
      try { Invoke-MwsGuidedConnectionOperation $config $Directory 'Pair' 'unused'; throw 'Pair replaced credentials while Writer was active.' }
      catch { if ($_.Exception.Message -notmatch 'connector') { throw } }
      if (-not (Test-Path -LiteralPath (Join-Path $Startup 'unrelated.txt'))) { throw 'Preference change removed another application.' }
      'SAFE_ACTIVE_WRITER'
    }.ToString()).AddArgument((Join-Path $directory 'Connector-Tools.ps1')).AddArgument($configPath).AddArgument($directory).AddArgument($desktop).AddArgument($startup)
    $result = $parallel.Invoke()
    $completed = @($result | Where-Object { [string]$_ -eq 'SAFE_ACTIVE_WRITER' })
    # HadErrors remains true after deliberately caught negative guard tests in
    # Windows PowerShell5.1; require successful completion with no leaked errors.
    if ($parallel.InvocationStateInfo.State -ne 'Completed' -or $parallel.Streams.Error.Count -ne 0 -or $completed.Count -ne 1) { throw ('Live Writer preference smoke failed: ' + ($parallel.Streams.Error -join '; ') + ' Output: ' + ($result -join '; ')) }
  } finally { $parallel.Dispose(); Exit-MwsConnectorLock $mutex }

  # Execute the real GUI click handlers with harmless controls and process
  # spies. A save failure cannot launch; successful Start saves once first and
  # retains the verified Save action without enabling a second Start.
  $guiAst = [Management.Automation.Language.Parser]::ParseFile((Join-Path $directory 'Guided-Setup.ps1'),[ref]$tokens,[ref]$errors)
  $startAssignment = $guiAst.Find({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left -is [Management.Automation.Language.VariableExpressionAst] -and $node.Left.VariablePath.UserPath -eq 'startButton'},$true)
  $saveAssignment = $guiAst.Find({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left -is [Management.Automation.Language.VariableExpressionAst] -and $node.Left.VariablePath.UserPath -eq 'saveButton'},$true)
  $startClick = $startAssignment.Find({param($node) $node -is [Management.Automation.Language.ScriptBlockExpressionAst]},$true).ScriptBlock.GetScriptBlock()
  $saveClick = $saveAssignment.Find({param($node) $node -is [Management.Automation.Language.ScriptBlockExpressionAst]},$true).ScriptBlock.GetScriptBlock()
  $finalUser = [pscustomobject]@{Checked=$true}; $ready = [pscustomobject]@{Checked=$true}; $autoStart = [pscustomobject]@{Checked=$true}
  $startButton = [pscustomobject]@{Enabled=$true}; $saveButton = [pscustomobject]@{Enabled=$true}; $status = [pscustomobject]@{Text=''}
  $script:connectionPassed = $true
  $script:saveCalls = 0; $script:launchCalls = 0; $script:failSave = $true
  function Save-MwsConnectorStartupPreference {
    param($ConfigPath,$AutoStart,$ConnectionPassed,$FinalUserConfirmed,$ReadyConfirmed)
    $script:saveCalls++
    if (-not $ConnectionPassed -or -not $FinalUserConfirmed -or -not $ReadyConfirmed) { throw 'Unverified setup.' }
    if ($script:failSave) { throw 'Simulated shortcut write failure.' }
  }
  function Start-Process { param($FilePath,$ArgumentList,$WindowStyle) $script:launchCalls++ }
  & $startClick
  if ($script:launchCalls -ne 0 -or $status.Text -notmatch 'Simulated shortcut write failure') { throw 'Failed preference save launched the connector or hid the error.' }
  $script:failSave = $false
  & $startClick
  if ($script:launchCalls -ne 1 -or $script:saveCalls -ne 2 -or $startButton.Enabled -or -not $saveButton.Enabled -or -not $script:connectionPassed) { throw 'Start did not save then launch once, or disabled later saving.' }
  & $saveClick
  if ($script:saveCalls -ne 3 -or $script:launchCalls -ne 1) { throw 'Save after Start launched another Writer or was unusable.' }
  $script:connectionPassed = $false
  & $saveClick
  & $startClick
  if ($script:saveCalls -ne 3 -or $script:launchCalls -ne 1) { throw 'Unverified GUI allowed save or launch.' }
  . (Join-Path $directory 'Connector-Tools.ps1')

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
