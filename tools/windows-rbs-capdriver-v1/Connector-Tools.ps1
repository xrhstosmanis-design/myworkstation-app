$ErrorActionPreference = 'Stop'

function Read-MwsConnectorConfig([string]$ConfigPath) {
  $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $config.storeId -or -not $config.terminalPos -or -not $config.workFolder) { throw 'Incomplete installation configuration.' }
  $uri = $null
  if (-not [Uri]::TryCreate([string]$config.apiBase, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) { throw 'Invalid HTTPS application address.' }
  return $config
}

function Enter-MwsConnectorLock {
  # One guided connector per PC, including different logon sessions/stores.
  $mutex = New-Object Threading.Mutex($false, 'Global\MyWorkStation.RbsCapDriverV1.Guided')
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Υπάρχει ήδη ενεργός connector. Κλείσε το υπάρχον παράθυρό του πριν από ζεύξη ή δεύτερη εκκίνηση.' }
    return $mutex
  } catch { $mutex.Dispose(); throw }
}

function Exit-MwsConnectorLock($Mutex) {
  if ($null -ne $Mutex) { $Mutex.ReleaseMutex(); $Mutex.Dispose() }
}

function Invoke-MwsConnectionCheck($Config, [string]$Directory) {
  if (-not (Test-Path -LiteralPath $Config.workFolder -PathType Container)) { throw 'Ο επιβεβαιωμένος φάκελος CAPDriver δεν υπάρχει σε αυτόν τον υπολογιστή.' }
  # An exclusive temporary probe checks write permission without rbs.* command naming.
  $probe = Join-Path $Config.workFolder ('.mws-access-' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    $stream = [IO.File]::Open($probe, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
  } finally { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force } }
  # Explicitly ignore session env tokens: use the credential of this Windows user.
  & (Join-Path $Directory 'Test-Connection.ps1') -ApiBase $Config.apiBase -DeviceToken '' -WorkFolder $Config.workFolder -ExpectedStoreId $Config.storeId
}

function Get-MwsLaunchArguments([string]$ScriptPath, [string]$ConfigPath, [switch]$Gui) {
  $command = "& '" + $ScriptPath.Replace("'", "''") + "' -ConfigPath '" + $ConfigPath.Replace("'", "''") + "'"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $sta = if ($Gui) { ' -STA' } else { '' }
  return ('-NoProfile -ExecutionPolicy Bypass' + $sta + ' -EncodedCommand ' + $encoded)
}

function Invoke-MwsGuidedConnectionOperation($Config, [string]$Directory,
  [ValidateSet('Pair','Test')][string]$OperationName, [string]$PairingCode) {
  $mutex = $null
  try {
    # Only credential replacement needs to exclude a running Writer. The status
    # check neither claims requests nor writes CAPDriver command files.
    if ($OperationName -eq 'Pair') {
      $mutex = Enter-MwsConnectorLock
      & (Join-Path $Directory 'Pair.ps1') -ApiBase $Config.apiBase -PairingCode $PairingCode -ExpectedStoreId $Config.storeId
    }
    Invoke-MwsConnectionCheck $Config $Directory
  } finally { Exit-MwsConnectorLock $mutex }
}

function Get-MwsConnectorStartupPreference([string]$ConfigPath,
  [string]$StartupFolder = [Environment]::GetFolderPath('Startup')) {
  $path = Join-Path $StartupFolder 'MyWorkStation - RBS Connector.lnk'
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  try {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($path)
    $directory = Split-Path -Parent $ConfigPath
    $expected = Get-MwsLaunchArguments (Join-Path $directory 'Start-Connector.ps1') $ConfigPath
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    return ($shortcut.TargetPath -eq $powershell -and $shortcut.Arguments -eq $expected)
  } catch { return $false }
}

function Save-MwsConnectorStartupPreference([string]$ConfigPath, [bool]$AutoStart,
  [bool]$ConnectionPassed, [bool]$FinalUserConfirmed, [bool]$ReadyConfirmed,
  [string]$DesktopFolder = [Environment]::GetFolderPath('Desktop'),
  [string]$StartupFolder = [Environment]::GetFolderPath('Startup')) {
  if (-not $ConnectionPassed -or -not $FinalUserConfirmed -or -not $ReadyConfirmed) {
    throw 'Χρειάζεται επιτυχής έλεγχος και επιβεβαίωση ετοιμότητας.'
  }
  # Saving shortcuts does not start/stop the Writer or change its credentials.
  # Serialize only preference writes, independently of the Writer singleton.
  $mutex = New-Object Threading.Mutex($false, 'Local\MyWorkStation.RbsCapDriverV1.Startup')
  $acquired = $false
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Η επιλογή εκκίνησης αποθηκεύεται ήδη. Περίμενε να ολοκληρωθεί.' }
    Set-MwsConnectorShortcuts $ConfigPath $AutoStart $DesktopFolder $StartupFolder
  } finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  }
}

function Set-MwsConnectorShortcuts([string]$ConfigPath, [bool]$AutoStart,
  [string]$DesktopFolder = [Environment]::GetFolderPath('Desktop'),
  [string]$StartupFolder = [Environment]::GetFolderPath('Startup')) {
  $directory = Split-Path -Parent $ConfigPath
  $shell = New-Object -ComObject WScript.Shell
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $desktopLink = Join-Path $DesktopFolder 'MyWorkStation - RBS Setup.lnk'
  $shortcut = $shell.CreateShortcut($desktopLink)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = Get-MwsLaunchArguments (Join-Path $directory 'Guided-Setup.ps1') $ConfigPath -Gui
  $shortcut.WorkingDirectory = $directory
  $shortcut.Save()
  # A visible recovery action uses the same store-checked singleton runner as
  # logon startup. It never pairs, overwrites credentials or bypasses the lock.
  $connectorLink = Join-Path $DesktopFolder 'MyWorkStation - RBS Connector.lnk'
  $shortcut = $shell.CreateShortcut($connectorLink)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = Get-MwsLaunchArguments (Join-Path $directory 'Start-Connector.ps1') $ConfigPath
  $shortcut.WorkingDirectory = $directory
  $shortcut.WindowStyle = 7
  $shortcut.Save()
  $startupLink = Join-Path $StartupFolder 'MyWorkStation - RBS Connector.lnk'
  if ($AutoStart) {
    $shortcut = $shell.CreateShortcut($startupLink)
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = Get-MwsLaunchArguments (Join-Path $directory 'Start-Connector.ps1') $ConfigPath
    $shortcut.WorkingDirectory = $directory
    $shortcut.WindowStyle = 7
    $shortcut.Save()
  } elseif (Test-Path -LiteralPath $startupLink) { Remove-Item -LiteralPath $startupLink -Force }
}
