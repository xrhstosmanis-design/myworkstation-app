param([Parameter(Mandatory=$true)][string]$ConfigPath, [string]$PreviewPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Connector-Tools.ps1')
$config = Read-MwsConnectorConfig $ConfigPath
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object Windows.Forms.Form
$form.Text = 'MyWorkStation — Σύνδεση ταμειακής'
$form.Size = New-Object Drawing.Size(980, 800)
$form.MinimumSize = New-Object Drawing.Size(780, 720)
$form.StartPosition = 'CenterScreen'
$form.AutoScaleMode = 'Dpi'
$form.Font = New-Object Drawing.Font('Segoe UI', 13)
$form.BackColor = [Drawing.Color]::FromArgb(245,247,251)
$form.AutoScroll = $true
$layout = New-Object Windows.Forms.TableLayoutPanel
$layout.Dock = 'Top'
$layout.AutoSize = $true
$layout.ColumnCount = 1
$layout.Padding = New-Object Windows.Forms.Padding(24)
$form.Controls.Add($layout)

function Add-SetupText([string]$Text, [bool]$Heading = $false) {
  $label = New-Object Windows.Forms.Label
  $label.Text = $Text
  $label.AutoSize = $true
  $label.MaximumSize = New-Object Drawing.Size(880, 0)
  $label.Margin = New-Object Windows.Forms.Padding(0,0,0,14)
  if ($Heading) { $label.Font = New-Object Drawing.Font('Segoe UI', 19, [Drawing.FontStyle]::Bold) }
  $layout.Controls.Add($label)
  return $label
}
function New-SetupButton([string]$Text, [scriptblock]$Click) {
  $button = New-Object Windows.Forms.Button
  $button.Text = $Text
  $button.AutoSize = $true
  $button.MinimumSize = New-Object Drawing.Size(240,56)
  $button.Padding = New-Object Windows.Forms.Padding(12,6,12,6)
  $button.Margin = New-Object Windows.Forms.Padding(0,0,12,10)
  $button.Add_Click($Click)
  return $button
}

$null = Add-SetupText 'Σύνδεση αυτού του υπολογιστή' $true
$null = Add-SetupText ($config.storeName + '  |  POS: ' + $config.terminalPos)
$null = Add-SetupText ('Φάκελος CAPDriver: ' + $config.workFolder)
$null = Add-SetupText '1. Επιβεβαίωσε τον υπολογιστή.  2. Βάλε νέο κωδικό ζεύξης.  3. Έλεγξε και ξεκίνησε τη σύνδεση.'
$finalUser = New-Object Windows.Forms.CheckBox
$finalUser.Text = 'Είμαι στο τελικό PC και στον χρήστη Windows που θα λειτουργεί το POS.'
$finalUser.AutoSize = $true
$finalUser.Margin = New-Object Windows.Forms.Padding(0,0,0,14)
$layout.Controls.Add($finalUser)
$null = Add-SetupText 'Κωδικός ζεύξης από το BackOffice του σωστού καταστήματος (ισχύει 15 λεπτά):'
$codeBox = New-Object Windows.Forms.TextBox
$codeBox.Font = New-Object Drawing.Font('Segoe UI',18)
$codeBox.Width = 420
$codeBox.MaxLength = 64
$codeBox.UseSystemPasswordChar = $true
$codeBox.Margin = New-Object Windows.Forms.Padding(0,0,0,14)
$layout.Controls.Add($codeBox)

$script:connectionPassed = $false
$script:operation = $null
$script:asyncResult = $null
$script:operationName = ''
$script:lastError = ''
$buttons = New-Object Windows.Forms.FlowLayoutPanel
$buttons.AutoSize = $true
$buttons.Dock = 'Top'
$buttons.WrapContents = $true
$layout.Controls.Add($buttons)

function Start-SetupOperation([string]$OperationName) {
  if ($null -ne $script:operation) { return }
  if (-not $finalUser.Checked) { $status.Text = 'Επιβεβαίωσε πρώτα το τελικό PC και τον χρήστη Windows.'; return }
  if ($OperationName -eq 'Pair' -and [string]::IsNullOrWhiteSpace($codeBox.Text)) { $status.Text = 'Βάλε έναν νέο κωδικό από το σωστό BackOffice.'; return }
  $script:connectionPassed = $false
  $script:operationName = $OperationName
  $script:operation = [PowerShell]::Create()
  $work = {
    param($Directory, $ConfigFile, $OperationName, $PairingCode)
    $ErrorActionPreference = 'Stop'
    . (Join-Path $Directory 'Connector-Tools.ps1')
    # A timeout keeps an unavailable server from holding the setup indefinitely.
    function Invoke-RestMethod {
      param($Method, $Uri, $Headers, $ContentType, $Body)
      Microsoft.PowerShell.Utility\Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -ContentType $ContentType -Body $Body -TimeoutSec 30
    }
    $localConfig = Read-MwsConnectorConfig $ConfigFile
    $mutex = Enter-MwsConnectorLock
    try {
      if ($OperationName -eq 'Pair') {
        & (Join-Path $Directory 'Pair.ps1') -ApiBase $localConfig.apiBase -PairingCode $PairingCode -ExpectedStoreId $localConfig.storeId
      }
      Invoke-MwsConnectionCheck $localConfig $Directory
    } finally { Exit-MwsConnectorLock $mutex }
  }
  $null = $script:operation.AddScript($work.ToString()).AddArgument($PSScriptRoot).AddArgument($ConfigPath).AddArgument($OperationName).AddArgument($codeBox.Text)
  $codeBox.Clear()
  $status.Text = 'Έλεγχος σε εξέλιξη… Δεν εκδίδεται απόδειξη.'
  $pairButton.Enabled = $false
  $testButton.Enabled = $false
  $startButton.Enabled = $false
  $saveButton.Enabled = $false
  $script:asyncResult = $script:operation.BeginInvoke()
  $timer.Start()
}

$pairButton = New-SetupButton 'Σύνδεση και έλεγχος' { Start-SetupOperation 'Pair' }
$testButton = New-SetupButton 'Έλεγχος υπάρχουσας σύνδεσης' { Start-SetupOperation 'Test' }
$buttons.Controls.Add($pairButton)
$buttons.Controls.Add($testButton)
$ready = New-Object Windows.Forms.CheckBox
$ready.Text = 'Η ταμειακή είναι έτοιμη, δεν υπάρχει άλλος Writer ή αβέβαιη εκκρεμής συναλλαγή.'
$ready.AutoSize = $true
$ready.Margin = New-Object Windows.Forms.Padding(0,8,0,14)
$layout.Controls.Add($ready)
$autoStart = New-Object Windows.Forms.CheckBox
$autoStart.Text = 'Να ξεκινά η σύνδεση αυτόματα όταν μπαίνει αυτός ο χρήστης στα Windows.'
$autoStart.AutoSize = $true
$autoStart.Margin = New-Object Windows.Forms.Padding(0,0,0,14)
$layout.Controls.Add($autoStart)
$null = Add-SetupText 'Η αυτόματη εκκίνηση μπορεί να παραλάβει εκκρεμή αιτήματα. Ενεργοποίησέ την αφού ελεγχθεί η εγκατάσταση. Οι πωλήσεις Kiosk και MyWorkStation δεν γίνονται ταυτόχρονα στην πρώτη δοκιμή.'
$actions = New-Object Windows.Forms.FlowLayoutPanel
$actions.AutoSize = $true
$actions.Dock = 'Top'
$actions.WrapContents = $true
$layout.Controls.Add($actions)

$saveButton = New-SetupButton 'Αποθήκευση επιλογής εκκίνησης' {
  if (-not $script:connectionPassed -or -not $finalUser.Checked -or -not $ready.Checked) { $status.Text = 'Χρειάζεται επιτυχής έλεγχος και επιβεβαίωση ετοιμότητας.'; return }
  $mutex = $null
  try {
    $mutex = Enter-MwsConnectorLock
    Set-MwsConnectorShortcuts $ConfigPath $autoStart.Checked
    $status.Text = if ($autoStart.Checked) { 'Αποθηκεύτηκε εκκίνηση μετά τη σύνδεση στα Windows. Δημιουργήθηκε και εικονίδιο ρυθμίσεων.' } else { 'Η αυτόματη εκκίνηση αφαιρέθηκε. Δημιουργήθηκε εικονίδιο ρυθμίσεων στην επιφάνεια εργασίας.' }
  } catch { $status.Text = 'Η επιλογή δεν αποθηκεύτηκε: ' + $_.Exception.Message }
  finally { Exit-MwsConnectorLock $mutex }
}
$saveButton.Enabled = $false
$startButton = New-SetupButton 'Εκκίνηση σύνδεσης τώρα' {
  if (-not $script:connectionPassed -or -not $finalUser.Checked -or -not $ready.Checked) { $status.Text = 'Χρειάζεται επιτυχής έλεγχος και επιβεβαίωση ετοιμότητας.'; return }
  try {
    $arguments = Get-MwsLaunchArguments (Join-Path $PSScriptRoot 'Start-Connector.ps1') $ConfigPath
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Minimized | Out-Null
    $status.Text = 'Άνοιξε το παράθυρο connector. Επιβεβαίωσε WRITER ONLINE στο BackOffice πριν από πώληση. Το κλείσιμο του οδηγού δεν σταματά τον connector.'
    $script:connectionPassed = $false
    $startButton.Enabled = $false
    $saveButton.Enabled = $false
  } catch { $status.Text = 'Δεν ξεκίνησε η σύνδεση: ' + $_.Exception.Message }
}
$startButton.Enabled = $false
$actions.Controls.Add($saveButton)
$actions.Controls.Add($startButton)
$status = Add-SetupText 'Δεν έχει γίνει ζεύξη ή εκκίνηση. Ο έλεγχος σύνδεσης δεν πιστοποιεί εκτύπωση ή πληρωμή κάρτας.'
$status.ForeColor = [Drawing.Color]::FromArgb(25,70,130)

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
  if ($null -eq $script:operation -or -not $script:asyncResult.IsCompleted) { return }
  $timer.Stop()
  try {
    $null = $script:operation.EndInvoke($script:asyncResult)
    if ($script:operation.HadErrors) { throw $script:operation.Streams.Error[0].Exception }
    $script:connectionPassed = $true
    $status.Text = 'Η σύνδεση και ο φάκελος ελέγχθηκαν. Δεν εκδόθηκε απόδειξη. Επιβεβαίωσε ετοιμότητα πριν από εκκίνηση.'
    $startButton.Enabled = $true
    $saveButton.Enabled = $true
  } catch { $status.Text = 'Ο έλεγχος απέτυχε: ' + $_.Exception.Message }
  finally {
    $script:operation.Dispose()
    $script:operation = $null
    $script:asyncResult = $null
    $pairButton.Enabled = $true
    $testButton.Enabled = $true
  }
})
$form.Add_FormClosing({
  param($Sender, $EventArgs)
  if ($null -ne $script:operation) { $EventArgs.Cancel = $true; $status.Text = 'Περίμενε να ολοκληρωθεί ο έλεγχος πριν κλείσεις.' }
})
$form.Add_SizeChanged({
  $width = [Math]::Max(600, $form.ClientSize.Width - 64)
  foreach ($control in $layout.Controls) {
    if ($control -is [Windows.Forms.Label] -or $control -is [Windows.Forms.CheckBox]) {
      $control.MaximumSize = New-Object Drawing.Size($width,0)
    }
  }
})
if ($PreviewPath) {
  $form.Show()
  [Windows.Forms.Application]::DoEvents()
  $bitmap = New-Object Drawing.Bitmap($form.Width,$form.Height)
  $form.DrawToBitmap($bitmap, (New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)))
  $bitmap.Save($PreviewPath, [Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  $form.Close()
} else { $null = $form.ShowDialog() }
$timer.Dispose()
$form.Dispose()
