$taskName="MyWorkStation RBS Read-Only Observer"
$root="C:\ProgramData\MyWorkStation\RbsObserver"
$task=& schtasks.exe /Query /TN $taskName /FO LIST /V 2>&1
$log=Join-Path $root "observer.log"
$recent=if(Test-Path $log){(Get-Content $log -Tail 12)-join "`r`n"}else{"No log yet."}
Add-Type -AssemblyName PresentationFramework
[Windows.MessageBox]::Show("READ ONLY - no commands / no fiscal issuance`r`n`r`n$task`r`n`r`nRecent safe metadata log:`r`n$recent","MyWorkStation RBS Observer status")|Out-Null
