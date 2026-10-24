$ErrorActionPreference='Stop'
# Import only the actual formatter and network writer, never connector startup,
# credentials, pairing, journal recovery or the production polling loop.
$tokens=$null
$errors=$null
$source=Join-Path $PSScriptRoot 'Connector.ps1'
$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors | Out-String)}
foreach($name in @('Lines','Print-Network')){
 $definition=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
 if(!$definition){throw ('Missing function: '+$name)}
 . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert($condition,$message){if(!$condition){throw $message}}
function Capture-Ticket($ticket){
 # Bind exclusively to loopback; synthetic data never reaches a real printer.
 $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
 $listener.Start()
 try{
  $ticket.settings.port=$listener.LocalEndpoint.Port
  $pending=$listener.BeginAcceptTcpClient($null,$null)
  Print-Network $ticket (Lines $ticket)
  if(!$pending.AsyncWaitHandle.WaitOne(5000)){throw 'No loopback connection'}
  $peer=$listener.EndAcceptTcpClient($pending)
  try{
   $stream=$peer.GetStream();$stream.ReadTimeout=5000
   $captured=New-Object IO.MemoryStream
   try{
    $buffer=New-Object byte[] 4096
    while(($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0){$captured.Write($buffer,0,$count)}
    return ,$captured.ToArray()
   }finally{$captured.Dispose()}
  }finally{$peer.Dispose()}
 }finally{$listener.Stop()}
}
$ticket=@{
 batchId='synthetic-loopback-only';priority='DOCTOR'
 settings=@{host='127.0.0.1';port=0;codePage=17;cut=$true}
 items=@(
  @{quantity=1;name='FREDDO ESPRESSO';modifiers=@('ΜΕΤΡΙΟΣ');note='';allergens=@()},
  @{quantity=2;name='CAPPUCCINO';modifiers=@('ΛΙΓΟΣ ΠΑΓΟΣ','ΣΤΕΒΙΑ');note='ΧΩΡΙΣ ΚΑΠΑΚΙ';allergens=@('ΓΑΛΑ')}
 )
}|ConvertTo-Json -Depth 10|ConvertFrom-Json
$expectedLines=@('MYWORKSTATION - PRODUCTION','synthetic-loopback-only','DOCTOR','--------------------------------','1 x FREDDO ESPRESSO','  ΜΕΤΡΙΟΣ','--------------------------------','2 x CAPPUCCINO','  ΛΙΓΟΣ ΠΑΓΟΣ','  ΣΤΕΒΙΑ','NOTE: ΧΩΡΙΣ ΚΑΠΑΚΙ','ALLERGENS: ΓΑΛΑ')
Assert (((Lines $ticket) -join "`n") -ceq ($expectedLines -join "`n")) 'Formatter lost or reordered ticket details'
$encoding=[Text.Encoding]::GetEncoding(1253)
foreach($cut in @($true,$false)){
 $ticket.settings.cut=$cut
 $bytes=Capture-Ticket $ticket
 Assert (($bytes[0..4] -join ',') -eq '27,64,27,116,17') 'Greek code page prefix changed'
 $bodyLength=$bytes.Length-5
 if($cut){
  Assert (($bytes[($bytes.Length-4)..($bytes.Length-1)] -join ',') -eq '29,86,65,0') 'Ticket must advance to the cutter, not cut in place'
  $bodyLength-=4
 }
 $body=$encoding.GetString($bytes,5,$bodyLength)
 Assert ($body -ceq (($expectedLines -join "`n")+"`n`n`n")) 'Network payload lost Greek, modifiers, notes, allergens, quantity or final lines'
 Write-Host ('PASS loopback ticket details and feed/cut semantics; cut='+$cut)
}
Write-Host 'Technical regression only; physical printing and cutter acceptance remain untested.'
