param([string]$NvrEndpoint='', [int]$TrackId=0, [string]$OutputPath='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Net.Http
Import-Module (Join-Path $PSScriptRoot 'HikvisionPreflight.psm1') -Force
if (!$NvrEndpoint) { $NvrEndpoint=Read-Host 'Hikvision local IP URL (example http://192.168.x.x)' }
$endpoint=Get-HikvisionEndpoint $NvrEndpoint
if (!$OutputPath) { $OutputPath=Join-Path ([Environment]::GetFolderPath('Desktop')) 'MyWorkStation_Hikvision_Precheck.json' }
$credential=Get-Credential -Message 'Hikvision read-only / playback account (not MyWorkStation login)'
if (!$credential) { throw 'CREDENTIAL_REQUIRED' }
$handler=New-Object Net.Http.HttpClientHandler
$handler.Credentials=$credential.GetNetworkCredential(); $handler.AllowAutoRedirect=$false
$client=New-Object Net.Http.HttpClient($handler)
$client.Timeout=[TimeSpan]::FromSeconds(12); $client.MaxResponseContentBufferSize=2097152
$report=[ordered]@{schemaVersion=1;observedAt=[DateTimeOffset]::UtcNow.ToString('o');readOnly=$true;model=$null;firmware=$null;deviceTime=$null;clockOffsetSeconds=$null;channels=@();tracks=@();checks=@();historicalPlayback='NOT_TESTED';download='NOT_TESTED';snapshot='NOT_TESTED'}
$failed=$false
try {
  foreach ($stage in @('device','time','channels','tracks','searchProfile','recordSearch')) {
    if ($stage -eq 'recordSearch' -and $TrackId -eq 0) { $report.checks+=@{stage=$stage;status='NOT_TESTED';reason='SELECT_TRACK_AFTER_CAMERA_MAPPING'}; continue }
    try {
      $body=''
      switch ($stage) {
        'device' { $path='/ISAPI/System/deviceInfo' }
        'time' { $path='/ISAPI/System/time' }
        'channels' { $path='/ISAPI/Streaming/channels' }
        'tracks' { $path='/ISAPI/ContentMgmt/record/tracks' }
        'searchProfile' { $path='/ISAPI/ContentMgmt/search/profile' }
        'recordSearch' { $path='/ISAPI/ContentMgmt/search'; $end=[DateTimeOffset]::UtcNow.AddMinutes(-1); $body=New-HikvisionSearch $TrackId $end.AddMinutes(-5) $end }
      }
      $started=[DateTimeOffset]::UtcNow; $xml=Invoke-HikvisionQuery $client $endpoint $path $body
      switch ($stage) {
        'device' { $report.model=Get-HikvisionValue $xml 'model'; $report.firmware=Get-HikvisionValue $xml 'firmwareVersion'; if (!$report.model) { throw 'MODEL_MISSING' } }
        'time' { $time=Get-HikvisionTime $xml; $report.deviceTime=$time.ToString('o'); $report.clockOffsetSeconds=[Math]::Round(($time-$started).TotalSeconds,1) }
        'channels' { $report.channels=@($xml.SelectNodes("//*[local-name()='StreamingChannel']") | ForEach-Object { @{id=(Get-HikvisionValue $_ 'id');name=(Get-HikvisionValue $_ 'channelName')} }) }
        'tracks' { $report.tracks=@($xml.SelectNodes("//*[local-name()='Track']") | ForEach-Object { Get-HikvisionValue $_ 'id' }) }
        'recordSearch' {
          $status=Get-HikvisionValue $xml 'responseStatusStrg'; $ok=Get-HikvisionValue $xml 'responseStatus'
          if ($ok -ne 'true' -or $status -notin @('OK','MORE','NO MATCHES')) { throw 'SEARCH_RESPONSE_REJECTED' }
          $report.recordSearch=@{trackId=$TrackId;status=$status;matchCount=$xml.SelectNodes("//*[local-name()='searchMatchItem']").Count;windowEnd=$end.ToString('o');clockCorrectionApplied=$false}
        }
      }
      $report.checks+=@{stage=$stage;status='PASS'}
    } catch {
      $code=$_.Exception.Message
      if ($code -notmatch '^[A-Z0-9_]+$') { $code='QUERY_FAILED' }
      $report.checks+=@{stage=$stage;status='FAIL';reason=$code}; $failed=$true
    }
  }
} finally { $client.Dispose(); $handler.Dispose(); $credential=$null }
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Host ('Report: '+$OutputPath)
Write-Host 'This checks connectivity only. Historical download and browser playback are NOT TESTED.'
if ($failed) { exit 1 }; exit 0
