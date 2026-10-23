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
if($Pair){
 $code=Read-Host 'Pairing code (valid for 10 minutes)'
 $response=Invoke-RestMethod -Uri "$Base/api/production-printers/pair" -Method Post -ContentType 'application/json' -Body (@{code=$code}|ConvertTo-Json)
 $secret=ConvertTo-SecureString $response.token -AsPlainText -Force
 $secret | Export-Clixml $Credential
 Write-Host 'Paired. Start this script without -Pair. Run ONE connector for the shared printer.'
 exit
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
