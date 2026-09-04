$taskName="MyWorkStation RBS Read-Only Observer"
$root="C:\ProgramData\MyWorkStation\RbsObserver"
$log=Join-Path $root "observer.log"
$spool=Join-Path $root "pending-metadata"
$pending=if(Test-Path $spool){@(Get-ChildItem -LiteralPath $spool -Filter "*.json" -File).Count}else{0}
$lines=if(Test-Path $log){@(Get-Content -LiteralPath $log -Tail 100 -ErrorAction SilentlyContinue)}else{@()}
$recent=if($lines.Count -gt 0){($lines|Select-Object -Last 12)-join "`r`n"}else{"No log yet."}
$heartbeat=@($lines|Where-Object {$_ -match "HEARTBEAT(?: one-shot)? OK$"})|Select-Object -Last 1
$started=@($lines|Where-Object {$_ -match "START read-only metadata observer$"})|Select-Object -Last 1
$status=if($heartbeat){"ONLINE - "+$heartbeat}elseif($started){"STARTED - waiting for heartbeat"}else{"WAITING - no heartbeat yet"}
Add-Type -AssemblyName PresentationFramework
[Windows.MessageBox]::Show("READ ONLY - no commands / no fiscal issuance`r`nObserver: $status`r`nPending metadata: $pending`r`n`r`nRecent safe metadata log:`r`n$recent","MyWorkStation RBS Observer status")|Out-Null
