param([switch]$Pair,[switch]$Once)
$ErrorActionPreference='Stop'
$Base='https://myworkstation-app.onrender.com'
$Root=Join-Path $env:LOCALAPPDATA 'MyWorkStation-ProductionPrinter'
New-Item -ItemType Directory -Force -Path $Root | Out-Null
$acl=Get-Acl $Root
$acl.SetAccessRuleProtection($true,$false)
$rule=New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
$acl.AddAccessRule($rule);Set-Acl $Root $acl
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$Credential=Join-Path $Root 'device.xml'
if($Pair -or !(Test-Path $Credential)){
 Add-Type -AssemblyName System.Windows.Forms
 Add-Type -AssemblyName System.Drawing
 $form=New-Object Windows.Forms.Form
 $form.Text='MyWorkStation - Σύνδεση εκτυπωτή'
 $form.ClientSize=New-Object Drawing.Size(610,260)
 $form.StartPosition='CenterScreen'
 $label=New-Object Windows.Forms.Label
 $label.Text='Αντέγραψε τον κωδικό ζεύξης από το POS και πάτησε Επικόλληση.'
 $label.SetBounds(20,20,570,45)
 $input=New-Object Windows.Forms.TextBox
 $input.SetBounds(20,80,550,35)
 $input.UseSystemPasswordChar=$true
 $paste=New-Object Windows.Forms.Button
 $paste.Text='Επικόλληση';$paste.SetBounds(20,130,170,45)
 $paste.Add_Click({try{$input.Text=[Windows.Forms.Clipboard]::GetText()}catch{[Windows.Forms.MessageBox]::Show('Δεν ήταν δυνατή η επικόλληση.')}})
 $connect=New-Object Windows.Forms.Button
 $connect.Text='Σύνδεση';$connect.SetBounds(210,130,170,45)
 $status=New-Object Windows.Forms.Label
 $status.SetBounds(20,195,550,50)
 $state=@{Paired=$false}
 $connect.Add_Click({
  $connect.Enabled=$false
  try{
   $code=$input.Text.Trim()
   if($code -notmatch '^[a-f0-9]{48}$'){throw 'Invalid pairing code'}
   $response=Invoke-RestMethod -Uri "$Base/api/production-printers/pair" -Method Post -ContentType 'application/json' -Body (@{code=$code}|ConvertTo-Json) -TimeoutSec 20
   $secret=ConvertTo-SecureString $response.token -AsPlainText -Force
   $secret | Export-Clixml $Credential
   $input.Clear();$state.Paired=$true;$form.Close()
  }catch{$status.Text='Η σύνδεση δεν ολοκληρώθηκε. Έλεγξε τον κωδικό ή δημιούργησε νέο από το POS.'}
  finally{$connect.Enabled=$true}
 })
 $form.Controls.AddRange(@($label,$input,$paste,$connect,$status))
 $null=$form.ShowDialog();$form.Dispose()
 if(!$state.Paired){exit}
 Write-Host 'Paired. This one connector serves both POS. Keep this window running.'
}
$mutex=New-Object Threading.Mutex($false,'Local\MyWorkStation-ProductionPrinter')
if(!$mutex.WaitOne(0)){throw 'A production printer connector is already running.'}
function Api($path,$body){
 $secure=Import-Clixml $Credential
 $credential=New-Object System.Management.Automation.PSCredential('device',$secure)
 $headers=@{Authorization=('Bearer '+$credential.GetNetworkCredential().Password)}
 Invoke-RestMethod -Uri "$Base/api/production-printers/$path" -Method Post -ContentType 'application/json' -Headers $headers -Body ($body|ConvertTo-Json -Depth 30 -Compress) -TimeoutSec 20
}
function Lines($ticket){
 $result=New-Object 'Collections.Generic.List[string]'
 $result.Add('MYWORKSTATION - PRODUCTION')
 $result.Add([string]$ticket.batchId)
 $result.Add([string]$ticket.priority)
 foreach($item in $ticket.items){
  $result.Add('--------------------------------')
  $result.Add(('{0} x {1}' -f $item.quantity,$item.name))
  foreach($option in $item.modifiers){$result.Add(('  '+$option))}
  if($item.note){$result.Add(('NOTE: '+$item.note))}
  if($item.allergens.Count){$result.Add(('ALLERGENS: '+($item.allergens -join ', ')))}
 }
 return $result.ToArray()
}
function Print-Network($ticket,$lines){
 $settings=$ticket.settings
 $encoding=[Text.Encoding]::GetEncoding(1253,[Text.EncoderFallback]::ExceptionFallback,[Text.DecoderFallback]::ExceptionFallback)
 $data=New-Object 'Collections.Generic.List[byte]'
 $data.AddRange([byte[]]@(27,64,27,116,[int]$settings.codePage))
 $data.AddRange([byte[]]$encoding.GetBytes(($lines -join "`n")+"`n`n`n"))
 if($settings.cut){$data.AddRange([byte[]]@(29,86,0))}
 $client=New-Object Net.Sockets.TcpClient
 try{
  $wait=$client.BeginConnect([string]$settings.host,[int]$settings.port,$null,$null)
  if(!$wait.AsyncWaitHandle.WaitOne(5000)){throw 'Printer connection timeout'}
  $client.EndConnect($wait)
  $stream=$client.GetStream();$stream.WriteTimeout=5000
  $bytes=$data.ToArray();$stream.Write($bytes,0,$bytes.Length);$stream.Flush()
 }finally{$client.Dispose()}
}
function Print-Windows($ticket,$lines){
 Add-Type -AssemblyName System.Drawing
 $doc=New-Object Drawing.Printing.PrintDocument
 $doc.PrinterSettings.PrinterName=[string]$ticket.settings.windowsName
 if(!$doc.PrinterSettings.IsValid){throw 'Windows printer is unavailable'}
 $doc.PrintController=New-Object Drawing.Printing.StandardPrintController
 $doc.DocumentName=('MWS '+$ticket.batchId)
 $doc.DefaultPageSettings.Margins=New-Object Drawing.Printing.Margins(5,5,5,5)
 $font=New-Object Drawing.Font('Arial',11)
 $state=@{Index=0}
 $handler={param($sender,$event)
  $y=[single]$event.MarginBounds.Top
  while($state.Index -lt $lines.Count){
   $text=[string]$lines[$state.Index]
   $size=$event.Graphics.MeasureString($text,$font,$event.MarginBounds.Width)
   if($y+$size.Height -gt $event.MarginBounds.Bottom -and $y -gt $event.MarginBounds.Top){break}
   $rect=New-Object Drawing.RectangleF($event.MarginBounds.Left,$y,$event.MarginBounds.Width,$size.Height)
   $event.Graphics.DrawString($text,$font,[Drawing.Brushes]::Black,$rect)
   $y+=$size.Height+3;$state.Index++
  }
  $event.HasMorePages=($state.Index -lt $lines.Count)
 }.GetNewClosure()
 $doc.add_PrintPage($handler)
 try{$doc.Print()}finally{$doc.remove_PrintPage($handler);$font.Dispose();$doc.Dispose()}
}
function Save-Journal($path,$value){
 $temp=$path+'.tmp'
 $json=$value|ConvertTo-Json -Depth 40 -Compress
 $bytes=[Text.Encoding]::UTF8.GetBytes($json)
 $file=New-Object IO.FileStream($temp,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
 Move-Item -Force $temp $path
}
try{
 do{
  try{
   # A journal is durable BEFORE the first print attempt. Restart never repeats it.
   foreach($file in Get-ChildItem $Root -Filter 'job-*.json'){
    $pending=Get-Content $file.FullName -Raw|ConvertFrom-Json
    $status=if($pending.status -eq 'WRITTEN'){'WRITTEN'}else{'UNKNOWN'}
    $null=Api 'device/result' @{id=$pending.id;claimId=$pending.claimId;status=$status}
    Remove-Item $file.FullName
   }
   $response=Api 'device/next' @{}
   if($response.job){
    $job=$response.job
    $path=Join-Path $Root ('job-'+$job.id+'.json')
    Save-Journal $path @{id=$job.id;claimId=$job.claimId;status='UNKNOWN'}
    $lines=Lines $job.ticket
    if($job.ticket.settings.transport -eq 'NETWORK'){Print-Network $job.ticket $lines}else{Print-Windows $job.ticket $lines}
    Save-Journal $path @{id=$job.id;claimId=$job.claimId;status='WRITTEN'}
    $null=Api 'device/result' @{id=$job.id;claimId=$job.claimId;status='WRITTEN'}
    Remove-Item $path
    Write-Host ('Data delivered: '+$job.id+' (physical paper not confirmed)')
   }
  }catch{Write-Warning 'Printer/connection requires review. Uncertain jobs are never printed again automatically.'}
  if(!$Once){Start-Sleep -Seconds 3}
 }while(!$Once)
}finally{$mutex.ReleaseMutex();$mutex.Dispose()}
