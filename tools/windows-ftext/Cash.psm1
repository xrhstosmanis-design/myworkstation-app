Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Ftext.psm1') -Force
function Get-FtextCashHash([byte[]]$Bytes) {
 $sha=[Security.Cryptography.SHA256]::Create()
 try { return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Write-FtextCashDurable([string]$Path,$Value) {
 $bytes=[Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 20 -Compress))
 $s=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try { $s.Write($bytes,0,$bytes.Length);$s.Flush($true) } finally {$s.Dispose()}
}
function New-FtextCashCommand($Config,$Request,[string]$ResultPath) {
 if(-not $Config.PSObject.Properties['cashEnabled'] -or $Config.cashEnabled -ne $true) {throw 'Cash execution is not enabled.'}
 if([string]$Request.id -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or [string]$Request.settingsHash -cne [string]$Config.settingsHash) {throw 'Cash request identity mismatch.'}
 $p=$Request.plan
 foreach($key in @('companyId','storeId','terminalPos','fiscalDeviceCode')) {if([string]$Request.scope.$key -cne [string]$Config.$key -or [string]$p.scope.$key -cne [string]$Config.$key) {throw 'Cash request scope mismatch.'}}
 if([string]$Request.serialNumber -cne [string]$Config.serialNumber -or [string]$p.settingsHash -cne [string]$Config.settingsHash -or [string]$p.configurationId -cne [string]$Config.configurationId -or $p.schemaVersion -cne 'MWS_FTEXT_SALE_PLAN_V1' -or $p.payment.method -cne 'CASH' -or $p.payment.code -ne 1) {throw 'Unconfirmed cash installation or payment.'}
 if($ResultPath -match '[|\r\n]' -or [IO.Path]::GetDirectoryName($ResultPath) -cne [string]$Config.workFolder) {throw 'Invalid cash result path.'}
 $lines=@($p.lines);if($lines.Count -lt 1 -or $lines.Count -gt 400) {throw 'Invalid cash line count.'}
 $commands=New-Object 'Collections.Generic.List[string]';$commands.Add('RESULT_FILENAME|'+$ResultPath)
 [decimal]$sum=0
 foreach($line in $lines) {
  $name=[string]$line.description
  if([string]::IsNullOrWhiteSpace($name) -or $name -cne $name.Trim() -or $name.Length -gt 80 -or $name -match '[|{}\x00-\x1f\x7f-\x9f]') {throw 'Unsafe fiscal description.'}
  if([string]$line.quantity -notmatch '^[1-9][0-9]{0,8}\.000$' -or [string]$line.unitPrice -notmatch '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$' -or [string]$line.lineTotal -notmatch '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$' -or [string]$line.discount -cne '0.00') {throw 'Unsupported cash amount or quantity.'}
  if([string]$line.department -notmatch '^[1-9][0-9]{0,2}$' -or [int]$line.department -gt 200) {throw 'Invalid cash department.'}
  $profiles=@($Config.cashDepartments | Where-Object {[string]$_.department -ceq [string]$line.department})
  if($profiles.Count -ne 1 -or [string]$profiles[0].vatCode -cne [string]$line.vatCode -or [decimal]$profiles[0].vatRate -ne [decimal]::Parse([string]$line.vatRate,[Globalization.CultureInfo]::InvariantCulture)) {throw 'Cash department has not been confirmed.'}
  $qty=[decimal]::Parse([string]$line.quantity,[Globalization.CultureInfo]::InvariantCulture)
  $price=[decimal]::Parse([string]$line.unitPrice,[Globalization.CultureInfo]::InvariantCulture)
  $amount=[decimal]::Parse([string]$line.lineTotal,[Globalization.CultureInfo]::InvariantCulture)
  if($qty*$price -ne $amount) {throw 'Cash line total mismatch.'};$sum+=$amount
  $commands.Add('S|'+$name+'|'+$line.quantity+'|'+$line.unitPrice+'||'+$line.department)
 }
 if([string]$p.total -notmatch '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$' -or $sum -le 0 -or $sum -ne [decimal]::Parse([string]$p.total,[Globalization.CultureInfo]::InvariantCulture) -or [string]$p.payment.amount -cne [string]$p.total) {throw 'Cash total mismatch.'}
 $commands.Add('PAY||1')
 $encoding=[Text.Encoding]::GetEncoding(1253,[Text.EncoderFallback]::ExceptionFallback,[Text.DecoderFallback]::ExceptionFallback)
 return ,$encoding.GetBytes(($commands -join "`r`n")+"`r`n")
}
function Read-FtextCashResult([byte[]]$Bytes,$Config,$Request) {
 $report=[ordered]@{requestId=[string]$Request.id;settingsHash=[string]$Config.settingsHash;outcome='REQUIRES_CHECK';description='The physical receipt could not be verified. Do not resend.'}
 try {
  $status=Read-FtextStatusResult $Bytes ([string]$Config.serialNumber)
  $report.rawResultHash=Get-FtextCashHash $Bytes;$report.code=$status.code
  if($status.ok) {
   $text=[Text.Encoding]::GetEncoding(1253).GetString($Bytes);$lines=@($text -split '\r?\n');$uri=$null
   if($lines.Count -lt 8 -or [decimal]$status.dayCounter -le 0 -or -not [Uri]::TryCreate($lines[6],[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -cne 'https' -or $uri.UserInfo -or -not ($uri.Host -eq 'aade.gr' -or $uri.Host.EndsWith('.aade.gr'))) {throw 'No final AADE receipt URL.'}
   $report.outcome='CONFIRMED';$report.serialNumber=$status.serialNumber;$report.dayId=$status.dayId;$report.dayCounter=$status.dayCounter;$report.deviceTime=$status.deviceTime;$report.qr=$lines[6];$report.Remove('description')
  }
 } catch { }
 return [pscustomobject]$report
}
function Get-FtextCashPending($Config) {
 $path=Join-Path $Config.workFolder '.mws-ftext-cash.json'
 if(-not (Test-Path -LiteralPath $path)) {return $null}
 $pending=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
 foreach($key in @('companyId','storeId','terminalPos','serialNumber','settingsHash')) {if([string]$pending.$key -cne [string]$Config.$key) {throw 'Unresolved cash belongs to another installation.'}}
 if([string]$pending.request.id -notmatch '^[a-f0-9-]{36}$') {throw 'Invalid pending cash identity.'}
 return $pending
}
function Invoke-FtextCashRequest {
 param([Parameter(Mandatory=$true)][string]$ConfigPath,[Parameter(Mandatory=$true)]$Request,[ValidateRange(1,120)][int]$TimeoutSeconds=30)
 $c=Get-FtextConfig $ConfigPath;$folder=$c.workFolder
 $hash=Get-FtextCashHash ([Text.Encoding]::UTF8.GetBytes($folder.ToUpperInvariant()))
 $mutex=New-Object Threading.Mutex($false,('Global\MyWorkStationFtext_'+$hash.ToUpperInvariant()));$held=$false
 try {
  try {$held=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$held=$true}
  if(-not $held) {throw 'Another connector is using this ftext folder.'}
  $resultPath=Join-Path $folder ('mws-cash-'+$Request.id+'.res')
  $commandBytes=New-FtextCashCommand $c $Request $resultPath
  $digest=Get-FtextCashHash $commandBytes
  $intentPath=Join-Path $folder ('mws-cash-'+$Request.id+'.intent.json')
  $reportPath=Join-Path $folder ('mws-cash-'+$Request.id+'.report.json')
  $activePath=Join-Path $folder '.mws-ftext-cash.json'
  $pending=Get-FtextCashPending $c
  if($null -ne $pending -and [string]$pending.request.id -cne [string]$Request.id) {throw 'Another cash request is unresolved.'}
  if(Test-Path -LiteralPath $intentPath) {
   $intent=Get-Content -LiteralPath $intentPath -Raw -Encoding UTF8 | ConvertFrom-Json
   if([string]$intent.commandHash -cne $digest -or [string]$intent.settingsHash -cne [string]$c.settingsHash) {throw 'Cash request changed; no resend is permitted.'}
   if(-not $pending) {throw 'This cash request was already acknowledged. No resend is permitted.'}
  } else {
   if($pending -or (Test-Path -LiteralPath (Join-Path $folder '.mws-ftext-status.json')) -or @(Get-ChildItem -LiteralPath $folder -Filter '*.txt' -File).Count -gt 0 -or (Test-Path -LiteralPath $resultPath) -or (Test-Path -LiteralPath $reportPath)) {throw 'Pending or pre-existing ftext files. No command was written.'}
   $intent=[ordered]@{commandHash=$digest;settingsHash=$c.settingsHash;requestId=$Request.id}
   # Write the irreversible intent first. A crash at any later point MUST NOT republish.
   Write-FtextCashDurable $intentPath $intent
   Write-FtextCashDurable $activePath ([ordered]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;serialNumber=$c.serialNumber;settingsHash=$c.settingsHash;request=$Request})
   $temp=Join-Path $folder ('mws-cash-'+$Request.id+'.pending');$target=Join-Path $folder ('mws-cash-'+$Request.id+'.txt')
   $s=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   try {$s.Write($commandBytes,0,$commandBytes.Length);$s.Flush($true)} finally {$s.Dispose()}
   [IO.File]::Move($temp,$target)
  }
  if(Test-Path -LiteralPath $reportPath) {return Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json}
  $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds);$bytes=$null
  while([DateTime]::UtcNow -lt $deadline) {
   if(Test-Path -LiteralPath $resultPath) {
    $s=$null
    try {
     $s=[IO.File]::Open($resultPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
     if($s.Length -gt 65536) {break};$buffer=New-Object byte[] ([int]$s.Length);$offset=0
     while($offset -lt $buffer.Length) {$n=$s.Read($buffer,$offset,$buffer.Length-$offset);if($n -eq 0) {break};$offset+=$n}
     if($offset -eq $buffer.Length) {$bytes=$buffer;break}
    } catch [IO.IOException] {} finally {if($s) {$s.Dispose()}}
   }
   Start-Sleep -Milliseconds 200
  }
  $report=Read-FtextCashResult $(if($bytes){$bytes}else{[byte[]]@()}) $c $Request
  Write-FtextCashDurable $reportPath $report
  return $report
 } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Complete-FtextCashReport($Config,[string]$RequestId) {
 $pending=Get-FtextCashPending $Config
 if(-not $pending -or [string]$pending.request.id -cne $RequestId) {throw 'Cash acknowledgement identity mismatch.'}
 # Keep intent/report permanently; only release the active marker after cloud acknowledgement.
 Remove-Item -LiteralPath (Join-Path $Config.workFolder '.mws-ftext-cash.json')
}
Export-ModuleMember -Function New-FtextCashCommand,Read-FtextCashResult,Get-FtextCashPending,Invoke-FtextCashRequest,Complete-FtextCashReport
