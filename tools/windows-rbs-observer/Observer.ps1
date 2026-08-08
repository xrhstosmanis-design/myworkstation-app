param([switch]$Once)
$ErrorActionPreference="Stop"
$Version="1.1.0"
$Root=Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath=Join-Path $Root "observer.config.json"
$LogPath=Join-Path $Root "observer.log"
$SpoolPath=Join-Path $Root "pending-metadata"

function Write-SafeLog([string]$Message){
  $line="{0:u} {1}" -f (Get-Date),$Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  $lines=Get-Content -LiteralPath $LogPath -ErrorAction SilentlyContinue
  if($lines.Count -gt 1000){$lines[-500..-1]|Set-Content -LiteralPath $LogPath -Encoding UTF8}
}
function Unprotect-Token([string]$Cipher){
  $bytes=[Convert]::FromBase64String($Cipher)
  $plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
  return [Text.Encoding]::UTF8.GetString($plain)
}
function Invoke-ObserverApi([string]$Path,[object]$Body){
  $headers=@{Authorization="Bearer $script:Token"}
  return Invoke-RestMethod -Uri ($script:Config.apiBase.TrimEnd("/")+$Path) -Method Post -Headers $headers -ContentType "application/json; charset=utf-8" -Body ($Body|ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 20
}
function Save-PendingMetadata([object]$Event){
  if(!(Test-Path -LiteralPath $SpoolPath)){New-Item -ItemType Directory -Path $SpoolPath -Force|Out-Null}
  $id=[Guid]::NewGuid().ToString("N")
  $temporary=Join-Path $SpoolPath ($id+".tmp")
  $pending=Join-Path $SpoolPath ($id+".json")
  $Event|ConvertTo-Json -Depth 4 -Compress|Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $pending -Force
  return $pending
}
function Flush-PendingMetadata(){
  if(!(Test-Path -LiteralPath $SpoolPath)){return}
  foreach($file in Get-ChildItem -LiteralPath $SpoolPath -Filter "*.json" -File|Sort-Object CreationTimeUtc){
    try{
      $event=Get-Content -LiteralPath $file.FullName -Raw|ConvertFrom-Json
      Invoke-ObserverApi "/api/cloud/v1/device/observer/events" @{events=@($event)}|Out-Null
      Remove-Item -LiteralPath $file.FullName -Force
      Write-SafeLog ("EVENT metadata delivered bytes={0} hash={1}" -f $event.byteLength,$event.payloadHash.Substring(0,12))
    }catch{
      Write-SafeLog ("QUEUE delivery paused: "+$_.Exception.Message)
      break
    }
  }
}
function Get-SharedHash([string]$Path){
  for($attempt=0;$attempt -lt 8;$attempt++){
    try{
      $stream=New-Object IO.FileStream($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
      try{$sha=[Security.Cryptography.SHA256]::Create();try{$hash=$sha.ComputeHash($stream)}finally{$sha.Dispose()};return @{hash=([BitConverter]::ToString($hash).Replace("-","").ToLowerInvariant());length=$stream.Length}}finally{$stream.Dispose()}
    }catch{Start-Sleep -Milliseconds 100}
  }
  return $null
}
function Send-ObservedFile([string]$Path){
  $meta=Get-SharedHash $Path
  if($null -eq $meta){Write-SafeLog "SKIP file unavailable before metadata capture";return}
  $stamp=[DateTime]::UtcNow
  $eventKey="{0}:{1}:{2}" -f $meta.hash,$meta.length,$stamp.Ticks
  $event=@{eventKey=$eventKey;source="CAPDRIVER";direction="OUTBOUND";observedAt=$stamp.ToString("o");payloadHash=$meta.hash;byteLength=$meta.length;messageType="CP1253_FILE";success=$true}
  Save-PendingMetadata $event|Out-Null
  Write-SafeLog ("EVENT metadata queued bytes={0} hash={1}" -f $meta.length,$meta.hash.Substring(0,12))
  Flush-PendingMetadata
}
if(!(Test-Path -LiteralPath $ConfigPath)){throw "Observer configuration is missing."}
$script:Config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json
$script:Token=Unprotect-Token $script:Config.protectedToken
$watchPath=$script:Config.watchPath
New-Item -ItemType Directory -Path $SpoolPath -Force|Out-Null
try{Invoke-ObserverApi "/api/cloud/v1/device/observer/register" @{version=$Version;sources=@("CAPDRIVER","RBS","KIOSK_MANAGER")}|Out-Null}
catch{Write-SafeLog ("REGISTER deferred: "+$_.Exception.Message)}
Write-SafeLog "START read-only metadata observer"

if($Once){
  Flush-PendingMetadata
  Invoke-ObserverApi "/api/cloud/v1/device/observer/heartbeat" @{version=$Version;processRunning=$true;lastCaptureAt=$null;sources=@("CAPDRIVER")}|Out-Null
  Write-SafeLog "HEARTBEAT one-shot OK";exit 0
}
$watcher=New-Object IO.FileSystemWatcher
$watcher.Path=$watchPath;$watcher.Filter="*";$watcher.IncludeSubdirectories=$true;$watcher.NotifyFilter=[IO.NotifyFilters]::FileName -bor [IO.NotifyFilters]::Size -bor [IO.NotifyFilters]::LastWrite
$queue=New-Object Collections.Concurrent.ConcurrentQueue[string]
$action={if(!$Event.SourceEventArgs.FullPath){return};$Event.MessageData.Enqueue($Event.SourceEventArgs.FullPath)}
Register-ObjectEvent $watcher Created -SourceIdentifier "MWS.Observer.Created" -Action $action -MessageData $queue|Out-Null
Register-ObjectEvent $watcher Renamed -SourceIdentifier "MWS.Observer.Renamed" -Action $action -MessageData $queue|Out-Null
$watcher.EnableRaisingEvents=$true
$lastHeartbeat=[DateTime]::MinValue
try{
  while($true){
    $path=$null
    while($queue.TryDequeue([ref]$path)){try{Send-ObservedFile $path}catch{Write-SafeLog ("EVENT upload failed: "+$_.Exception.Message)}}
    if(([DateTime]::UtcNow-$lastHeartbeat).TotalSeconds -ge 60){
      Flush-PendingMetadata
      $running=Test-Path -LiteralPath $watchPath
      try{Invoke-ObserverApi "/api/cloud/v1/device/observer/heartbeat" @{version=$Version;processRunning=$running;lastCaptureAt=$null;sources=@("CAPDRIVER")} | Out-Null;Write-SafeLog "HEARTBEAT OK"}catch{Write-SafeLog ("HEARTBEAT failed: "+$_.Exception.Message)}
      $lastHeartbeat=[DateTime]::UtcNow
    }
    Start-Sleep -Milliseconds 500
  }
}finally{$watcher.Dispose();Unregister-Event "MWS.Observer.Created" -ErrorAction SilentlyContinue;Unregister-Event "MWS.Observer.Renamed" -ErrorAction SilentlyContinue}
