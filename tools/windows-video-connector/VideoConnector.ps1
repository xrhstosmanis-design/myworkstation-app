param([switch]$Once)
$ErrorActionPreference="Stop"
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Net.Http
$Version="1.0.0"
$Root=Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath=Join-Path $Root "video-connector.config.json"
$LogPath=Join-Path $Root "video-connector.log"
$TempPath=Join-Path $Root "temp"

function Write-SafeLog([string]$Message){
  $safe=$Message -replace '(?i)https?://[^\s/@]+:[^\s/@]+@','https://[redacted]@' -replace '(?i)(password|token|authorization)\s*[=:]\s*[^\s]+','$1=[redacted]'
  Add-Content -LiteralPath $LogPath -Value (("{0:u} {1}" -f (Get-Date),$safe).Substring(0,[Math]::Min(900,("{0:u} {1}" -f (Get-Date),$safe).Length))) -Encoding UTF8
  $lines=Get-Content -LiteralPath $LogPath -ErrorAction SilentlyContinue;if($lines.Count -gt 1200){$lines[-600..-1]|Set-Content -LiteralPath $LogPath -Encoding UTF8}
}
function Unprotect([string]$Cipher){$bytes=[Convert]::FromBase64String($Cipher);$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine);return [Text.Encoding]::UTF8.GetString($plain)}
function Invoke-Backend([string]$Path,[object]$Body){
  try{return Invoke-RestMethod -Uri ($script:Config.apiBase.TrimEnd("/")+$Path) -Method Post -Headers @{Authorization="Bearer $script:Token"} -ContentType "application/json; charset=utf-8" -Body ($Body|ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 90}
  catch{
    $detail=$_.Exception.Message
    try{if($_.ErrorDetails.Message){$detail=$_.ErrorDetails.Message}}catch{}
    throw ("BACKEND_REQUEST_FAILED {0}: {1}" -f $Path,$detail)
  }
}
function New-NvrClient(){
  $handler=New-Object Net.Http.HttpClientHandler;$handler.Credentials=New-Object Net.NetworkCredential($script:NvrCredential.username,$script:NvrCredential.password);$handler.PreAuthenticate=$false;$handler.AllowAutoRedirect=$false
  $client=New-Object Net.Http.HttpClient($handler);$client.Timeout=[TimeSpan]::FromSeconds(20);return $client
}
function Xml-Escape([string]$Value){return [Security.SecurityElement]::Escape($Value)}
function New-OnvifEnvelope([string]$Body){$created=[DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");$nonce=New-Object byte[] 20;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($nonce);$createdBytes=[Text.Encoding]::UTF8.GetBytes($created);$passwordBytes=[Text.Encoding]::UTF8.GetBytes([string]$script:NvrCredential.password);$digestInput=New-Object byte[] ($nonce.Length+$createdBytes.Length+$passwordBytes.Length);[Array]::Copy($nonce,0,$digestInput,0,$nonce.Length);[Array]::Copy($createdBytes,0,$digestInput,$nonce.Length,$createdBytes.Length);[Array]::Copy($passwordBytes,0,$digestInput,$nonce.Length+$createdBytes.Length,$passwordBytes.Length);$digest=[Convert]::ToBase64String([Security.Cryptography.SHA1]::Create().ComputeHash($digestInput));$security='<wsse:Security s:mustUnderstand="1"><wsse:UsernameToken><wsse:Username>'+$(Xml-Escape $script:NvrCredential.username)+'</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">'+$digest+'</wsse:Password><wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">'+[Convert]::ToBase64String($nonce)+'</wsse:Nonce><wsu:Created>'+$created+'</wsu:Created></wsse:UsernameToken></wsse:Security>';return '<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><s:Header>'+$security+'</s:Header><s:Body>'+$Body+'</s:Body></s:Envelope>'}
function Invoke-Onvif([string]$Path,[string]$Body){$content=New-Object Net.Http.StringContent((New-OnvifEnvelope $Body),[Text.Encoding]::UTF8,"application/soap+xml");try{$response=$script:NvrClient.PostAsync(($script:Config.nvrEndpoint.TrimEnd("/")+$Path),$content).GetAwaiter().GetResult();$xml=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult();if(!$response.IsSuccessStatusCode -or $xml -match '<(?:\w+:)?Fault\b'){throw "ONVIF_$([int]$response.StatusCode)"};return $xml}finally{$content.Dispose()}}
function Onvif-Value([string]$Xml,[string]$Name){if($Xml -match ('<(?:\w+:)?'+[Regex]::Escape($Name)+'(?:\s[^>]*)?>([^<]*)</(?:\w+:)?'+[Regex]::Escape($Name)+'>')){return [Net.WebUtility]::HtmlDecode($matches[1].Trim())};return $null}
function Invoke-NvrBytes([string]$Path){
  $uri=$script:Config.nvrEndpoint.TrimEnd("/")+$Path;$response=$script:NvrClient.GetAsync($uri).GetAwaiter().GetResult()
  if(!$response.IsSuccessStatusCode){$stage=if($Path -match "action=findFile"){"FIND_FILE"}elseif($Path -match "action=findNextFile"){"FIND_NEXT"}elseif($Path -match "loadfile.cgi"){"LOAD_FILE"}elseif($Path -match "factory.create"){"CREATE_SEARCH"}else{"NVR_REQUEST"};throw ("NVR_HTTP_{0}_{1}" -f [int]$response.StatusCode,$stage)}
  return $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
}
function Invoke-NvrAbsoluteBytes([string]$Uri){$response=$script:NvrClient.GetAsync($Uri).GetAwaiter().GetResult();if(!$response.IsSuccessStatusCode){throw "NVR_HTTP_$([int]$response.StatusCode)"};return $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()}
function Invoke-NvrText([string]$Path){return [Text.Encoding]::UTF8.GetString((Invoke-NvrBytes $Path))}
function Parse-Dahua([string]$Text){$result=@{};foreach($line in ($Text -split "`r?`n")){if($line -match '^([^=]+)=(.*)$'){$result[$matches[1].Trim()]=$matches[2].Trim()}};return $result}
function Get-NvrState(){
  $watch=[Diagnostics.Stopwatch]::StartNew();if($script:Config.protocol -eq "ONVIF"){$deviceXml=Invoke-Onvif "/onvif/device_service" "<tds:GetDeviceInformation/>";$timeXml=Invoke-Onvif "/onvif/device_service" "<tds:GetSystemDateAndTime/>";$utcBlock=if($timeXml -match '<(?:\w+:)?UTCDateTime>([\s\S]*?)</(?:\w+:)?UTCDateTime>'){$matches[1]}else{$timeXml};$rawTime=("{0:D4}-{1:D2}-{2:D2} {3:D2}:{4:D2}:{5:D2}" -f [int](Onvif-Value $utcBlock "Year"),[int](Onvif-Value $utcBlock "Month"),[int](Onvif-Value $utcBlock "Day"),[int](Onvif-Value $utcBlock "Hour"),[int](Onvif-Value $utcBlock "Minute"),[int](Onvif-Value $utcBlock "Second"));$info=@{deviceType=(Onvif-Value $deviceXml "Model");serialNumber=(Onvif-Value $deviceXml "SerialNumber");softwareVersion=(Onvif-Value $deviceXml "FirmwareVersion")};$watch.Stop();$nvrTime=[DateTimeOffset]::ParseExact(($rawTime+" +00:00"),"yyyy-MM-dd HH:mm:ss zzz",[Globalization.CultureInfo]::InvariantCulture)}else{$info=Parse-Dahua (Invoke-NvrText "/cgi-bin/magicBox.cgi?action=getSystemInfo");$timeData=Parse-Dahua (Invoke-NvrText "/cgi-bin/global.cgi?action=getCurrentTime");$watch.Stop();$rawTime=$timeData.time;if(!$rawTime){$rawTime=$timeData.'result.time'};if(!$rawTime){$rawTime=$timeData.result};if(!$rawTime){throw "NVR_TIME_UNAVAILABLE"};$local=[DateTime]::ParseExact([string]$rawTime,"yyyy-MM-dd HH:mm:ss",[Globalization.CultureInfo]::InvariantCulture);try{$zone=[TimeZoneInfo]::FindSystemTimeZoneById("GTB Standard Time")}catch{$zone=[TimeZoneInfo]::Local};$offset=$zone.GetUtcOffset($local);$nvrTime=New-Object DateTimeOffset($local,$offset)}
  return @{latencyMs=[int]$watch.ElapsedMilliseconds;nvrTime=$nvrTime.ToString("o");systemTime=[DateTimeOffset]::UtcNow.ToString("o");deviceInfo=@{deviceType=$info.deviceType;serialNumber=$info.serialNumber;softwareVersion=$info.softwareVersion}}
}
function Get-SnapshotBytes([int]$Channel){if($script:Config.protocol -ne "ONVIF"){return Invoke-NvrBytes ("/cgi-bin/snapshot.cgi?channel={0}" -f $Channel)};$profiles=Invoke-Onvif "/onvif/media_service" "<trt:GetProfiles/>";$tokens=@([Regex]::Matches($profiles,'<(?:\w+:)?Profiles\b[^>]*token="([^"]+)"')|ForEach-Object{$_.Groups[1].Value});if(!$tokens.Count){throw "ONVIF_PROFILE_MISSING"};$token=$tokens[[Math]::Min($Channel,$tokens.Count-1)];$snapshot=Invoke-Onvif "/onvif/media_service" ("<trt:GetSnapshotUri><trt:ProfileToken>{0}</trt:ProfileToken></trt:GetSnapshotUri>" -f (Xml-Escape $token));$uri=Onvif-Value $snapshot "Uri";if(!$uri){throw "ONVIF_SNAPSHOT_URI_MISSING"};return Invoke-NvrAbsoluteBytes $uri}
function Get-Channel([object]$Command){$value=$Command.cameraKey;if($Command.payload.streamReference -match '^\d+
function Upload-Artifact([object]$Command,[string]$Path,[string]$Kind,[string]$MimeType){
  $bytes=[IO.File]::ReadAllBytes($Path);if($bytes.Length -gt 75MB){throw "ARTIFACT_TOO_LARGE"};$sha=[BitConverter]::ToString(([Security.Cryptography.SHA256]::Create().ComputeHash($bytes))).Replace("-","").ToLowerInvariant();$chunkSize=4MB;$count=[Math]::Ceiling($bytes.Length/$chunkSize)
  for($index=0;$index -lt $count;$index++){$length=[Math]::Min($chunkSize,$bytes.Length-($index*$chunkSize));$chunk=New-Object byte[] $length;[Array]::Copy($bytes,$index*$chunkSize,$chunk,0,$length);$final=$index -eq ($count-1);Invoke-Backend ("/api/cloud/v1/device/video/commands/{0}/chunks" -f $Command.id) @{kind=$Kind;cameraKey=$Command.cameraKey;mimeType=$MimeType;filename=[IO.Path]::GetFileName($Path);chunkIndex=$index;chunkBase64=[Convert]::ToBase64String($chunk);final=$final;sha256=$(if($final){$sha}else{$null});totalBytes=$(if($final){$bytes.Length}else{$null})}|Out-Null}
}
function Complete-Command([object]$Command,[hashtable]$Result){Invoke-Backend ("/api/cloud/v1/device/video/commands/{0}/complete" -f $Command.id) @{result=$Result}|Out-Null}
function Fail-Command([object]$Command,[string]$Code){
  try{
    $safeCode=([string]$Code -replace '[^A-Z0-9_\-]','_')
    if($safeCode.Length -gt 120){$safeCode=$safeCode.Substring(0,120)}
    Invoke-Backend ("/api/cloud/v1/device/video/commands/{0}/fail" -f $Command.id) @{errorCode=$safeCode}|Out-Null
  }catch{Write-SafeLog "COMMAND failure report deferred"}
}
function Invoke-Command([object]$Command){
  try{
    if($Command.commandType -eq "HEALTH"){$state=Get-NvrState;Complete-Command $Command @{nvrOnline=$true;latencyMs=$state.latencyMs;deviceInfo=$state.deviceInfo};return}
    $channel=Get-Channel $Command
    if($Command.commandType -eq "SNAPSHOT"){$path=Join-Path $TempPath ($Command.id+".jpg");[IO.File]::WriteAllBytes($path,(Get-SnapshotBytes $channel));Upload-Artifact $Command $path "SNAPSHOT" "image/jpeg";Remove-Item -LiteralPath $path -Force;return}
    if($Command.commandType -eq "CLIP"){
      try{$athens=[TimeZoneInfo]::FindSystemTimeZoneById("GTB Standard Time")}catch{$athens=[TimeZoneInfo]::Local}
      $start=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::Parse($Command.payload.startAt),$athens).ToString("yyyy-MM-dd HH:mm:ss")
      $end=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::Parse($Command.payload.endAt),$athens).ToString("yyyy-MM-dd HH:mm:ss")
      $searchObject=(Parse-Dahua (Invoke-NvrText "/cgi-bin/mediaFileFind.cgi?action=factory.create")).result
      if(!$searchObject){throw "DAHUA_MEDIA_SEARCH_CREATE_FAILED"}
      try{
        $findPath="/cgi-bin/mediaFileFind.cgi?action=findFile&object={0}&condition.Channel={1}&condition.StartTime={2}&condition.EndTime={3}&condition.Types[0]=dav" -f $searchObject,$channel,($start -replace " ","%20"),($end -replace " ","%20")
        $findResponse=Invoke-NvrText $findPath
        if($findResponse -notmatch '(?im)^OK\\s*$'){throw "DAHUA_MEDIA_SEARCH_FAILED"}
        $nextResponse=Invoke-NvrText ("/cgi-bin/mediaFileFind.cgi?action=findNextFile&object={0}&count=10" -f $searchObject)
        $found=0
        if($nextResponse -match '(?im)^found=(\\d+)\\s*$'){$found=[int]$matches[1]}
        if($found -lt 1){throw "DAHUA_RECORDING_NOT_FOUND"}
      }finally{
        if($searchObject){
          try{Invoke-NvrText ("/cgi-bin/mediaFileFind.cgi?action=close&object={0}" -f $searchObject)|Out-Null}catch{}
          try{Invoke-NvrText ("/cgi-bin/mediaFileFind.cgi?action=destroy&object={0}" -f $searchObject)|Out-Null}catch{}
        }
      }
      $dav=Join-Path $TempPath ($Command.id+".dav")
      [IO.File]::WriteAllBytes($dav,(Invoke-NvrBytes ("/cgi-bin/loadfile.cgi?action=startLoad&channel={0}&startTime={1}&endTime={2}&subtype=0" -f $channel,[Uri]::EscapeDataString($start),[Uri]::EscapeDataString($end))))
      if(!$script:Config.ffmpegPath -or !(Test-Path -LiteralPath $script:Config.ffmpegPath)){throw "FFMPEG_REQUIRED_FOR_BROWSER_PREVIEW"}
      $mp4=Join-Path $TempPath ($Command.id+".mp4")
      & $script:Config.ffmpegPath -y -i $dav -c:v libx264 -preset veryfast -an -movflags +faststart $mp4 2>$null
      if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $mp4)){throw "FFMPEG_TRANSCODE_FAILED"}
      Upload-Artifact $Command $mp4 "CLIP" "video/mp4"
      Remove-Item -LiteralPath $dav -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $mp4 -Force -ErrorAction SilentlyContinue
      return
    }
    throw "UNKNOWN_COMMAND"
  }catch{Write-SafeLog ("COMMAND {0} failed: {1}" -f $Command.commandType,$_.Exception.Message);Fail-Command $Command $_.Exception.Message}
}
if(!(Test-Path -LiteralPath $ConfigPath)){throw "Video Connector configuration is missing."}
$script:Config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json;$script:Token=Unprotect $script:Config.protectedToken;$script:NvrCredential=(Unprotect $script:Config.protectedNvrCredential)|ConvertFrom-Json;$script:NvrClient=New-NvrClient
New-Item -ItemType Directory -Path $TempPath -Force|Out-Null
try{Invoke-Backend "/api/cloud/v1/device/video/register" @{version=$Version;protocol=$script:Config.protocol;deviceName=("KAT Video Connector - "+$env:COMPUTERNAME);cameraKeys=@();capabilities=@{health=$true;time=$true;snapshot=$true;clip=$true}}|Out-Null}catch{Write-SafeLog ("REGISTER deferred: "+$_.Exception.Message)}
do{
  $state=$null;$errorCode=$null;try{$state=Get-NvrState}catch{$errorCode=($_.Exception.Message -replace '[^A-Z0-9_\-]','_');Write-SafeLog ("NVR health failed: "+$_.Exception.Message)}
  $heartbeatBody=@{version=$Version;processRunning=$true;nvrOnline=($null -ne $state);protocol=$script:Config.protocol;errorCode=$errorCode}
  if($null -ne $state){$heartbeatBody.latencyMs=$state.latencyMs;$heartbeatBody.nvrTime=$state.nvrTime;$heartbeatBody.systemTime=$state.systemTime;$heartbeatBody.deviceInfo=$state.deviceInfo}
  try{$heartbeat=Invoke-Backend "/api/cloud/v1/device/video/heartbeat" $heartbeatBody;foreach($command in @($heartbeat.commands)){Invoke-Command $command};Write-SafeLog ("HEARTBEAT OK nvrOnline={0} commands={1}" -f ($null -ne $state),@($heartbeat.commands).Count)}catch{Write-SafeLog ("HEARTBEAT failed: "+$_.Exception.Message)}
  if(!$Once){Start-Sleep -Seconds 30}
}while(!$Once)
$script:NvrClient.Dispose()
){$value=$Command.payload.streamReference};$number=0;if([int]::TryParse([string]$value,[ref]$number)){return [Math]::Max(0,$number)};return 0}
function Upload-Artifact([object]$Command,[string]$Path,[string]$Kind,[string]$MimeType){
  $bytes=[IO.File]::ReadAllBytes($Path);if($bytes.Length -gt 75MB){throw "ARTIFACT_TOO_LARGE"};$sha=[BitConverter]::ToString(([Security.Cryptography.SHA256]::Create().ComputeHash($bytes))).Replace("-","").ToLowerInvariant();$chunkSize=4MB;$count=[Math]::Ceiling($bytes.Length/$chunkSize)
  for($index=0;$index -lt $count;$index++){$length=[Math]::Min($chunkSize,$bytes.Length-($index*$chunkSize));$chunk=New-Object byte[] $length;[Array]::Copy($bytes,$index*$chunkSize,$chunk,0,$length);$final=$index -eq ($count-1);Invoke-Backend ("/api/cloud/v1/device/video/commands/{0}/chunks" -f $Command.id) @{kind=$Kind;cameraKey=$Command.cameraKey;mimeType=$MimeType;filename=[IO.Path]::GetFileName($Path);chunkIndex=$index;chunkBase64=[Convert]::ToBase64String($chunk);final=$final;sha256=$(if($final){$sha}else{$null});totalBytes=$(if($final){$bytes.Length}else{$null})}|Out-Null}
}
function Complete-Command([object]$Command,[hashtable]$Result){Invoke-Backend ("/api/cloud/v1/device/video/commands/{0}/complete" -f $Command.id) @{result=$Result}|Out-Null}
function Fail-Command([object]$Command,[string]$Code){try{Invoke-Backend ("/api/cloud/v1/device/video/commands/{0}/fail" -f $Command.id) @{errorCode=($Code -replace '[^A-Z0-9_\-]','_').Substring(0,[Math]::Min(120,($Code -replace '[^A-Z0-9_\-]','_').Length))}|Out-Null}catch{Write-SafeLog "COMMAND failure report deferred"}}
function Invoke-Command([object]$Command){
  try{
    if($Command.commandType -eq "HEALTH"){$state=Get-NvrState;Complete-Command $Command @{nvrOnline=$true;latencyMs=$state.latencyMs;deviceInfo=$state.deviceInfo};return}
    $channel=Get-Channel $Command
    if($Command.commandType -eq "SNAPSHOT"){$path=Join-Path $TempPath ($Command.id+".jpg");[IO.File]::WriteAllBytes($path,(Get-SnapshotBytes $channel));Upload-Artifact $Command $path "SNAPSHOT" "image/jpeg";Remove-Item -LiteralPath $path -Force;return}
    if($Command.commandType -eq "CLIP"){
      try{$athens=[TimeZoneInfo]::FindSystemTimeZoneById("GTB Standard Time")}catch{$athens=[TimeZoneInfo]::Local}
      $start=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::Parse($Command.payload.startAt),$athens).ToString("yyyy-MM-dd HH:mm:ss")
      $end=[TimeZoneInfo]::ConvertTime([DateTimeOffset]::Parse($Command.payload.endAt),$athens).ToString("yyyy-MM-dd HH:mm:ss")
      $searchObject=(Parse-Dahua (Invoke-NvrText "/cgi-bin/mediaFileFind.cgi?action=factory.create")).result
      if(!$searchObject){throw "DAHUA_MEDIA_SEARCH_CREATE_FAILED"}
      try{
        $findPath="/cgi-bin/mediaFileFind.cgi?action=findFile&object={0}&condition.Channel={1}&condition.StartTime={2}&condition.EndTime={3}&condition.Types[0]=dav" -f $searchObject,$channel,($start -replace " ","%20"),($end -replace " ","%20")
        $findResponse=Invoke-NvrText $findPath
        if($findResponse -notmatch '(?im)^OK\\s*$'){throw "DAHUA_MEDIA_SEARCH_FAILED"}
        $nextResponse=Invoke-NvrText ("/cgi-bin/mediaFileFind.cgi?action=findNextFile&object={0}&count=10" -f $searchObject)
        $found=0
        if($nextResponse -match '(?im)^found=(\\d+)\\s*$'){$found=[int]$matches[1]}
        if($found -lt 1){throw "DAHUA_RECORDING_NOT_FOUND"}
      }finally{
        if($searchObject){
          try{Invoke-NvrText ("/cgi-bin/mediaFileFind.cgi?action=close&object={0}" -f $searchObject)|Out-Null}catch{}
          try{Invoke-NvrText ("/cgi-bin/mediaFileFind.cgi?action=destroy&object={0}" -f $searchObject)|Out-Null}catch{}
        }
      }
      $dav=Join-Path $TempPath ($Command.id+".dav")
      [IO.File]::WriteAllBytes($dav,(Invoke-NvrBytes ("/cgi-bin/loadfile.cgi?action=startLoad&channel={0}&startTime={1}&endTime={2}&subtype=0" -f $channel,[Uri]::EscapeDataString($start),[Uri]::EscapeDataString($end))))
      if(!$script:Config.ffmpegPath -or !(Test-Path -LiteralPath $script:Config.ffmpegPath)){throw "FFMPEG_REQUIRED_FOR_BROWSER_PREVIEW"}
      $mp4=Join-Path $TempPath ($Command.id+".mp4")
      & $script:Config.ffmpegPath -y -i $dav -c:v libx264 -preset veryfast -an -movflags +faststart $mp4 2>$null
      if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $mp4)){throw "FFMPEG_TRANSCODE_FAILED"}
      Upload-Artifact $Command $mp4 "CLIP" "video/mp4"
      Remove-Item -LiteralPath $dav -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $mp4 -Force -ErrorAction SilentlyContinue
      return
    }
    throw "UNKNOWN_COMMAND"
  }catch{Write-SafeLog ("COMMAND {0} failed: {1}" -f $Command.commandType,$_.Exception.Message);Fail-Command $Command $_.Exception.Message}
}
if(!(Test-Path -LiteralPath $ConfigPath)){throw "Video Connector configuration is missing."}
$script:Config=Get-Content -LiteralPath $ConfigPath -Raw|ConvertFrom-Json;$script:Token=Unprotect $script:Config.protectedToken;$script:NvrCredential=(Unprotect $script:Config.protectedNvrCredential)|ConvertFrom-Json;$script:NvrClient=New-NvrClient
New-Item -ItemType Directory -Path $TempPath -Force|Out-Null
try{Invoke-Backend "/api/cloud/v1/device/video/register" @{version=$Version;protocol=$script:Config.protocol;deviceName=("KAT Video Connector - "+$env:COMPUTERNAME);cameraKeys=@();capabilities=@{health=$true;time=$true;snapshot=$true;clip=$true}}|Out-Null}catch{Write-SafeLog ("REGISTER deferred: "+$_.Exception.Message)}
do{
  $state=$null;$errorCode=$null;try{$state=Get-NvrState}catch{$errorCode=($_.Exception.Message -replace '[^A-Z0-9_\-]','_');Write-SafeLog ("NVR health failed: "+$_.Exception.Message)}
  $heartbeatBody=@{version=$Version;processRunning=$true;nvrOnline=($null -ne $state);protocol=$script:Config.protocol;errorCode=$errorCode}
  if($null -ne $state){$heartbeatBody.latencyMs=$state.latencyMs;$heartbeatBody.nvrTime=$state.nvrTime;$heartbeatBody.systemTime=$state.systemTime;$heartbeatBody.deviceInfo=$state.deviceInfo}
  try{$heartbeat=Invoke-Backend "/api/cloud/v1/device/video/heartbeat" $heartbeatBody;foreach($command in @($heartbeat.commands)){Invoke-Command $command};Write-SafeLog ("HEARTBEAT OK nvrOnline={0} commands={1}" -f ($null -ne $state),@($heartbeat.commands).Count)}catch{Write-SafeLog ("HEARTBEAT failed: "+$_.Exception.Message)}
  if(!$Once){Start-Sleep -Seconds 30}
}while(!$Once)
$script:NvrClient.Dispose()
