$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Net.Http
Import-Module (Join-Path $PSScriptRoot 'HikvisionPreflight.psm1') -Force
function Assert($Value,$Message) { if (!$Value) { throw $Message } }
function Reject([scriptblock]$Action) { $failed=$false; try { & $Action | Out-Null } catch { $failed=$true }; Assert $failed 'Expected fail closed' }
foreach ($ip in @('10.0.0.2','172.16.0.2','172.31.255.2','192.168.2.3')) { Assert ((Get-HikvisionEndpoint ('http://'+$ip+':80')) -eq ('http://'+$ip)) 'Private endpoint rejected' }
foreach ($url in @('http://8.8.8.8','http://127.0.0.1','http://172.32.0.1','http://localhost','http://user:secret@192.168.1.2','http://192.168.1.2/config','http://192.168.1.2/?secret=x','file:///tmp/x')) { Reject { Get-HikvisionEndpoint $url } }
$xml=Convert-HikvisionXml '<Time xmlns="http://www.hikvision.com/ver20/XMLSchema"><localTime>2026-10-09T20:00:00+03:00</localTime></Time>'
Assert ((Get-HikvisionTime $xml).UtcDateTime.Hour -eq 17) 'Athens offset lost'
$winter=Convert-HikvisionXml '<Time><localTime>2026-12-01T20:00:00+02:00</localTime></Time>'
Assert ((Get-HikvisionTime $winter).UtcDateTime.Hour -eq 18) 'Winter offset lost'
Reject { Get-HikvisionTime (Convert-HikvisionXml '<Time><localTime>2026-10-09T20:00:00</localTime></Time>') }
Reject { Convert-HikvisionXml '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>' }
$start=[DateTimeOffset]::Parse('2026-10-09T20:00:00+03:00'); $end=$start.AddSeconds(90)
$search=Convert-HikvisionXml (New-HikvisionSearch 101 $start $end)
Assert ((Get-HikvisionValue $search 'startTime') -eq '2026-10-09T17:00:00Z') 'UTC search incorrect'
Assert ((Get-HikvisionValue $search 'trackID') -eq '101') 'Track altered'
Reject { New-HikvisionSearch 0 $start $end }; Reject { New-HikvisionSearch 101 $end $start }; Reject { New-HikvisionSearch 101 $start $start.AddSeconds(601) }
Reject { Invoke-HikvisionQuery $null '' '/ISAPI/System/reboot' }; Reject { Invoke-HikvisionQuery $null '' '/ISAPI/System/time' '<Time/>' }
Write-Host 'Hikvision offline fixture smoke PASS. No physical device or network called.'
Add-Type -TypeDefinition @'
using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
public class HikvisionFixtureHandler : HttpMessageHandler {
  public string LastMethod; public string LastPath; public string LastBody;
  public string ResponseXml = "<DeviceInfo><model>fixture</model></DeviceInfo>";
  public HttpStatusCode Status = HttpStatusCode.OK;
  protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
    LastMethod=request.Method.Method; LastPath=request.RequestUri.AbsolutePath;
    LastBody=request.Content==null ? "" : request.Content.ReadAsStringAsync().GetAwaiter().GetResult();
    return Task.FromResult(new HttpResponseMessage(Status) { Content=new StringContent(ResponseXml) });
  }
}
'@ -ReferencedAssemblies System.Net.Http
$handler=New-Object HikvisionFixtureHandler; $client=New-Object Net.Http.HttpClient($handler)
try {
  $response=Invoke-HikvisionQuery $client 'http://192.168.1.10' '/ISAPI/System/deviceInfo'
  Assert ((Get-HikvisionValue $response 'model') -eq 'fixture') 'GET response parsing failed'
  Assert ($handler.LastMethod -eq 'GET') 'Read used mutating method'
  $handler.ResponseXml='<CMSearchResult><responseStatus>true</responseStatus><responseStatusStrg>OK</responseStatusStrg><searchMatchItem><trackID>101</trackID></searchMatchItem></CMSearchResult>'
  $response=Invoke-HikvisionQuery $client 'http://192.168.1.10' '/ISAPI/ContentMgmt/search' (New-HikvisionSearch 101 $start $end)
  Assert ($handler.LastMethod -eq 'POST' -and $handler.LastPath -eq '/ISAPI/ContentMgmt/search') 'Search request incorrect'
  Assert ($response.SelectNodes("//*[local-name()='searchMatchItem']").Count -eq 1) 'Match count incorrect'
  $handler.Status=[Net.HttpStatusCode]::Unauthorized
  Reject { Invoke-HikvisionQuery $client 'http://192.168.1.10' '/ISAPI/System/deviceInfo' }
  $handler.Status=[Net.HttpStatusCode]::Redirect
  Reject { Invoke-HikvisionQuery $client 'http://192.168.1.10' '/ISAPI/System/deviceInfo' }
  $handler.Status=[Net.HttpStatusCode]::OK; $handler.ResponseXml='<html>fixture-password</html>'
  # Invalid XML must fail without reflecting response bodies or credentials.
  $handler.ResponseXml='invalid fixture-password'
  $errorText=''; try { Invoke-HikvisionQuery $client 'http://192.168.1.10' '/ISAPI/System/deviceInfo' | Out-Null } catch { $errorText=$_.Exception.Message }
  Assert ($errorText -eq 'QUERY_FAILED_OR_INVALID_XML') 'Response content leaked'
} finally { $client.Dispose(); $handler.Dispose() }
Write-Host 'Hikvision HTTP fixtures PASS: GET, search POST, 401, redirect, sanitized failure.'
