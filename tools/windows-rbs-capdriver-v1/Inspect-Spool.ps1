param(
  [string]$CompanyId = 'pilot-company',
  [string]$StoreId = 'kat-store',
  [string]$TerminalPos,
  [string]$WorkFolder = 'C:\capture',
  [string]$ReportPath,
  [string]$OperationId,
  [switch]$ShowForm
)

# Diagnostic observation only. Never stops a process, sends a command, reads a
# credential or changes a CAP file. This is NOT authorization to reset a store.
$ErrorActionPreference = 'Stop'
function Assert-LocalUnlinkedPath([string]$Path) {
  $full = [IO.Path]::GetFullPath($Path)
  if ($full.StartsWith('\\')) { throw 'Inspect the local folder on the physical register, not a network share.' }
  $current = Get-Item -LiteralPath $full -Force -ErrorAction Stop
  while ($null -ne $current) {
    if ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked folders require technician review.' }
    $current = $current.Parent
  }
}
function Get-SpoolObservation([string]$Folder) {
  Assert-LocalUnlinkedPath $Folder
  $item = Get-Item -LiteralPath $Folder -Force -ErrorAction Stop
  if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Select the actual CAP folder, not a file or link.' }
  $full = [IO.Path]::GetFullPath($item.FullName).TrimEnd('\','/')
  if ($full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\','/')) { throw 'A drive root is not a CAP work folder.' }
  $entries = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction Stop | Select-Object -First 10001)
  if ($entries.Count -gt 10000) { throw 'Folder exceeds the diagnostic limit; no report was written.' }
  if (@($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Linked entries require technician review; no report was written.' }
  $files = @($entries | Where-Object { -not $_.PSIsContainer })
  # All entries participate, including unknown legacy command names. Only the
  # digest leaves this function: filenames and file contents are not exported.
  $inventoryRows = @($entries | Sort-Object Name | ForEach-Object { [pscustomobject]@{ name = $_.Name; directory = [bool]$_.PSIsContainer; length = $(if ($_.PSIsContainer) { 0 } else { $_.Length }); ticks = $_.LastWriteTimeUtc.Ticks } })
  $inventory = ConvertTo-Json -InputObject $inventoryRows -Compress -Depth 4
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $digest = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$inventory))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
  return [ordered]@{
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    workFolder = $full
    fileCount = $files.Count
    directoryCount = @($entries | Where-Object { $_.PSIsContainer }).Count
    rbsCommandFileCount = @($files | Where-Object { $_.Name -like 'rbs.*.txt' }).Count
    temporaryFileCount = @($files | Where-Object { $_.Name -like '*.tmp' }).Count
    otherFileCount = @($files | Where-Object { $_.Name -notlike 'rbs.*.txt' -and $_.Name -notlike '*.tmp' }).Count
    totalFileBytes = [long](($files | Measure-Object -Property Length -Sum).Sum)
    metadataSha256 = $digest
  }
}

function Save-SpoolInspection([string]$Terminal, [string]$Folder, [string]$Destination) {
  if ([string]::IsNullOrWhiteSpace($CompanyId) -or [string]::IsNullOrWhiteSpace($StoreId) -or [string]::IsNullOrWhiteSpace($Terminal) -or $Terminal.Length -gt 128) { throw 'Explicit company, store and physical terminal are required.' }
  $destinationFull = [IO.Path]::GetFullPath($Destination)
  Assert-LocalUnlinkedPath ([IO.Path]::GetDirectoryName($destinationFull))
  $folderFull = [IO.Path]::GetFullPath($Folder).TrimEnd('\','/')
  if ($destinationFull.StartsWith($folderFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Save the report outside the CAP work folder.' }
  if (Test-Path -LiteralPath $destinationFull) { throw 'The report already exists. Choose a new filename.' }
  $first = Get-SpoolObservation $Folder
  Start-Sleep -Seconds 2
  $second = Get-SpoolObservation $Folder
  $processStatus = 'UNAVAILABLE'
  $writerCount = $null
  $capCount = $null
  try {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $writerCount = @($processes | Where-Object { $_.ProcessId -ne $PID -and $_.Name -match '^(powershell|pwsh)(\.exe)?$' -and $_.CommandLine -match '(Writer|Start-Connector)\.ps1' }).Count
    $capCount = @($processes | Where-Object { $_.Name -match 'cap.?driver' }).Count
    $processStatus = $(if (@($processes | Where-Object { $_.ProcessId -ne $PID -and $_.Name -match '^(powershell|pwsh)(\.exe)?$' -and -not $_.CommandLine }).Count) { 'PARTIAL' } else { 'OBSERVED' })
  } catch { }
  $report = [ordered]@{
    format = 'MWS_CAP_SPOOL_OBSERVATION_V1'
    companyId = $CompanyId
    storeId = $StoreId
    terminalPos = $Terminal
    observationId = [guid]::NewGuid().ToString()
    operationId = $OperationId
    purpose = 'READ_ONLY_DIAGNOSTIC_NOT_RESET_CLEARANCE'
    readyForDeletion = $false
    cloudDrainVerified = $false
    actualCapConfigurationVerified = $false
    offlineDevicesAccountedFor = $false
    unchangedBetweenSamples = ($first.metadataSha256 -eq $second.metadataSha256)
    samples = @($first,$second)
    processObservation = $processStatus
    matchingWriterProcessCount = $writerCount
    matchingCapDriverProcessCount = $capCount
    limitations = @('Only the selected folder on this PC was observed.','No process was stopped. Process names do not prove physical CAP configuration.','Empty/stable observations do not establish cloud maintenance or exclude disconnected PCs.','Fresh bound evidence after an actual drain and technician verification is still required.')
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($report | ConvertTo-Json -Depth 8))
  $stream = [IO.File]::Open($destinationFull,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  return $destinationFull
}

if ($ShowForm -or [string]::IsNullOrWhiteSpace($TerminalPos) -or [string]::IsNullOrWhiteSpace($ReportPath)) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = New-Object Windows.Forms.Form
  $form.Text = 'MyWorkStation - CAP read-only inspection'
  $form.ClientSize = New-Object Drawing.Size(620,330)
  $form.StartPosition = 'CenterScreen'
  $label = New-Object Windows.Forms.Label
  $label.Text = "Store: $CompanyId / $StoreId`r`nSelect this physical register and its actual CAP folder.`r`nThis check changes no settings, credentials or command files.`r`nIt does not stop Writer/CAP and does not authorize deletion."
  $label.SetBounds(16,16,590,86)
  $form.Controls.Add($label)
  $terminal = New-Object Windows.Forms.ComboBox
  $terminal.DropDownStyle = 'DropDown'
  if ([string]::IsNullOrWhiteSpace($TerminalPos)) { $terminal.Items.AddRange(@('KAT-POS-01','KAT-POS-02')) } else { [void]$terminal.Items.Add($TerminalPos); $terminal.Text = $TerminalPos }
  $terminal.SetBounds(16,110,185,28)
  $form.Controls.Add($terminal)
  $folder = New-Object Windows.Forms.TextBox
  $folder.Text = $WorkFolder
  $folder.SetBounds(16,150,470,28)
  $form.Controls.Add($folder)
  $browse = New-Object Windows.Forms.Button
  $browse.Text = 'CAP folder'
  $browse.SetBounds(494,148,110,30)
  $browse.Add_Click({ $dialog = New-Object Windows.Forms.FolderBrowserDialog; try { if ($dialog.ShowDialog() -eq 'OK') { $folder.Text = $dialog.SelectedPath } } finally { $dialog.Dispose() } })
  $form.Controls.Add($browse)
  $operationLabel = New-Object Windows.Forms.Label
  $operationLabel.Text = 'Preparation code (copy from MyWorkStation):'
  $operationLabel.SetBounds(16,188,590,22)
  $form.Controls.Add($operationLabel)
  $operationInput = New-Object Windows.Forms.TextBox
  $operationInput.Text = $OperationId
  $operationInput.SetBounds(16,210,590,28)
  $form.Controls.Add($operationInput)
  $check = New-Object Windows.Forms.Button
  $check.Text = 'Inspect and save report'
  $check.SetBounds(16,265,255,36)
  $check.Add_Click({
    if ([string]::IsNullOrWhiteSpace($terminal.Text)) { [Windows.Forms.MessageBox]::Show('Select the physical register first.'); return }
    $dialog = New-Object Windows.Forms.SaveFileDialog
    $dialog.Filter = 'JSON report (*.json)|*.json'
    $dialog.FileName = 'MWS-spool-' + $terminal.Text + '-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.json'
    try {
      if ($dialog.ShowDialog() -ne 'OK') { return }
      $check.Enabled = $false
      $script:OperationId = $operationInput.Text.Trim()
      $saved = Save-SpoolInspection ([string]$terminal.Text) $folder.Text $dialog.FileName
      [Windows.Forms.MessageBox]::Show("Report saved: $saved`r`nThis is an observation, not reset clearance.")
    } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Inspection could not complete') } finally { $check.Enabled = $true; $dialog.Dispose() }
  })
  $form.Controls.Add($check)
  try { [void]$form.ShowDialog() } finally { $form.Dispose() }
} else {
  Save-SpoolInspection $TerminalPos $WorkFolder $ReportPath
}
