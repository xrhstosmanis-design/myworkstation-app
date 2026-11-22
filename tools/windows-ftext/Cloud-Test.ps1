param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Ftext.psm1') -Force
$c=Get-FtextCloudConfig $ConfigPath
# Serialize the entire check and delivery, including recovery after an unknown HTTP outcome.
$sha=[Security.Cryptography.SHA256]::Create()
try { $scopeHash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($c.companyId+'|'+$c.storeId+'|'+$c.terminalPos))).Replace('-','') } finally { $sha.Dispose() }
$mutexName='Global\MWS.Ftext.CloudTest.'+$scopeHash
$mutex=New-Object Threading.Mutex($false,$mutexName)
$held=$false
try {
    try { $held=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held=$true }
    if(-not $held) { throw 'A cloud STATUS check is already running for this installation.' }
# Authenticate current signed scope/license/settings BEFORE any physical STATUS.
Invoke-FtextCloudPing $c | Out-Null
$path=(Get-FtextCredentialPath $c)+'.pending-report.json'
if(Test-Path -LiteralPath $path) {
    $pending=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if(-not $pending.PSObject.Properties['settingsHash'] -or $pending.settingsHash -cne $c.settingsHash) { throw 'An earlier STATUS report belongs to different settings. Preserve it for review; no new STATUS was sent.' }
    $body=[string]$pending.body
} else {
    if(Test-Path -LiteralPath (Join-Path $c.workFolder '.mws-ftext-cash.json')) {throw 'A cash request is unresolved. Preserve its evidence; no new STATUS was sent.'}
    $evidence=Invoke-FtextStatus -ConfigPath $ConfigPath
    $r=$evidence.result
    $report=[ordered]@{requestId=$evidence.requestId;checkedAt=$evidence.checkedAt;ok=$r.ok;code=$r.code;fiscalExecution=$false}
    foreach($key in @('serialNumber','deviceTime','description')) { if($r.PSObject.Properties[$key]) { $report[$key]=$r.$key } }
    $body=$report | ConvertTo-Json -Compress
    $pending=[ordered]@{settingsHash=$c.settingsHash;body=$body} | ConvertTo-Json -Compress
    $bytes=[Text.Encoding]::UTF8.GetBytes($pending)
    $f=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $f.Write($bytes,0,$bytes.Length);$f.Flush($true) } finally { $f.Dispose() }
}
$token=Read-FtextDeviceToken $c
Invoke-RestMethod -Method Post -Uri ($c.apiBase+'/api/ftext/v1/device/status-result') -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body $body | Out-Null
Remove-Item -LiteralPath $path
Write-Host 'STATUS result delivered to MyWorkStation. No receipt or card payment was issued.'

} finally { if($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
