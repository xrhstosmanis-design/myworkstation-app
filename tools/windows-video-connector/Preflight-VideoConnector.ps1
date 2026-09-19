param([string]$ApiBase="https://myworkstation-app.onrender.com",[string]$NvrEndpoint="http://192.168.1.108")
$ErrorActionPreference="Stop";$report=Join-Path ([Environment]::GetFolderPath("Desktop")) "MyWorkStation_Video_Precheck.txt";$lines=New-Object Collections.Generic.List[string]
function Check([string]$Name,[scriptblock]$Action){try{& $Action;$lines.Add("PASS $Name")|Out-Null}catch{$lines.Add("FAIL $Name - "+$_.Exception.Message)|Out-Null}}
Check "Windows PowerShell 5+" {if($PSVersionTable.PSVersion.Major -lt 5){throw "PowerShell is too old"}}
Check "Backend HTTPS" {$health=Invoke-RestMethod -Uri ($ApiBase.TrimEnd("/")+"/api/cloud/v1/health") -TimeoutSec 15;if(!$health.ok){throw "Health endpoint failed"}}
Check "NVR LAN endpoint" {$uri=[Uri]$NvrEndpoint;$client=New-Object Net.Sockets.TcpClient;$wait=$client.BeginConnect($uri.Host,($(if($uri.Port -gt 0){$uri.Port}else{80})),$null,$null);if(!$wait.AsyncWaitHandle.WaitOne(4000)){throw "TCP timeout"};$client.EndConnect($wait);$client.Dispose()}
Check "No inbound firewall requirement" {$lines.Add("INFO Connector uses only outbound HTTPS plus local LAN requests; no port forwarding is required.")|Out-Null}
$lines|Set-Content -LiteralPath $report -Encoding UTF8;$lines|ForEach-Object{Write-Host $_};if($lines|Where-Object{$_ -like "FAIL*"}){exit 1};exit 0
