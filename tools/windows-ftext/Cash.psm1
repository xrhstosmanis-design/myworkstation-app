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
 if([string]$Request.serialNumber -cne [string]$Config.serialNumber -or [string]$p.settingsHash -cne [string]$Config.settingsHash -or [string]$p.configurationId -cne [string]$Config.configurationId -or $p.schemaVersion -cne 'MWS_FTEXT_SALE_PLAN_V1') {throw 'Unconfirmed cash installation or payment.'}
 $isVoid=$Request.PSObject.Properties['kind'] -and [string]$Request.kind -ceq 'FTEXT_VOID'
 if($isVoid) {
  if([string]$Request.originalRequestId -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or [string]$Request.originalRequestId -ceq [string]$Request.id -or [string]$Request.originalRawResultHash -notmatch '^[a-f0-9]{64}$' -or [string]$p.payment.method -cne 'CARD') {throw 'Invalid original card request for VOID.'}
  if($ResultPath -match '[|\r\n]' -or [IO.Path]::GetDirectoryName($ResultPath) -cne [string]$Config.workFolder) {throw 'Invalid VOID result path.'}
  return ,[Text.Encoding]::GetEncoding(1253).GetBytes(('RESULT_FILENAME|'+$ResultPath+"`r`nVOID_DOCUMENT`r`n"))
 }
 $isCard=[string]$p.payment.method -ceq 'CARD'
 if($isCard) {
  if(-not $Config.PSObject.Properties['cardEnabled'] -or $Config.cardEnabled -ne $true -or -not $Config.PSObject.Properties['cardPayment']) {throw 'Card execution is not enabled.'}
  $profile=$Config.cardPayment
  if($profile.resultFormat -ceq 'OPERATOR_CONFIRMATION' -and $profile.transactionType -ne 1) {throw 'Operator confirmation requires the programmed Sale payment type.'}
  if($profile.confirmed -ne $true -or $profile.resultFormat -cnotin @('POS_LINE8_OS7','OPERATOR_CONFIRMATION') -or [string]$profile.code -notmatch '^([2-9]|[12][0-9]|30)$' -or [string]$p.payment.code -cne [string]$profile.code -or [string]$profile.posTerminalId -notmatch '^([1-9]|10)$' -or $profile.transactionType -notin @(1,6)) {throw 'Card payment profile is not confirmed.'}
 } elseif([string]$p.payment.method -cne 'CASH' -or $p.payment.code -ne 1) {throw 'Unsupported fiscal payment.'}
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
 $commands.Add('PAY||'+[string]$p.payment.code)
 $encoding=[Text.Encoding]::GetEncoding(1253,[Text.EncoderFallback]::ExceptionFallback,[Text.DecoderFallback]::ExceptionFallback)
 return ,$encoding.GetBytes(($commands -join "`r`n")+"`r`n")
}
function Read-FtextCashResult([byte[]]$Bytes,$Config,$Request) {
 if($Request.PSObject.Properties['kind'] -and [string]$Request.kind -ceq 'FTEXT_VOID') {
  $void=[ordered]@{requestId=[string]$Request.id;originalRequestId=[string]$Request.originalRequestId;settingsHash=[string]$Config.settingsHash;outcome='REQUIRES_CHECK';description='VOID was not verified. Do not resend.'}
  try {
   $status=Read-FtextStatusResult $Bytes ([string]$Config.serialNumber)
   $void.rawResultHash=Get-FtextCashHash $Bytes;$void.code=$status.code
   $lines=@([Text.Encoding]::GetEncoding(1253).GetString($Bytes) -split '\r?\n')
   if($status.ok -and ($lines.Count -le 6 -or [string]::IsNullOrWhiteSpace([string]$lines[6])) -and ($lines.Count -le 7 -or [string]::IsNullOrWhiteSpace([string]$lines[7]))) {
    $void.outcome='VOID_CONFIRMED';$void.serialNumber=$status.serialNumber;$void.dayId=$status.dayId;$void.dayCounter=$status.dayCounter;$void.deviceTime=$status.deviceTime;$void.Remove('description')
   }
  } catch {}
  return [pscustomobject]$void
 }
 $report=[ordered]@{requestId=[string]$Request.id;settingsHash=[string]$Config.settingsHash;outcome='REQUIRES_CHECK';description='The physical receipt could not be verified. Do not resend.'}
 try {
  $status=Read-FtextStatusResult $Bytes ([string]$Config.serialNumber)
  $report.rawResultHash=Get-FtextCashHash $Bytes;$report.code=$status.code
  if(-not $status.ok -and [string]$status.failedCommand -match '^PAY\|(?:[0-9]+\.[0-9]{2})?\|(?:[2-9]|[12][0-9]|30)$') {$report.failedCommand=[string]$status.failedCommand}
  if($status.ok) {
   $text=[Text.Encoding]::GetEncoding(1253).GetString($Bytes);$lines=@($text -split '\r?\n');$uri=$null
   if($lines.Count -lt 7 -or [decimal]$status.dayCounter -le 0 -or -not [Uri]::TryCreate($lines[6],[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -cne 'https' -or $uri.UserInfo -or -not ($uri.Host -eq 'aade.gr' -or $uri.Host.EndsWith('.aade.gr'))) {throw 'No final AADE receipt URL.'}
   if([string]$Request.plan.payment.method -ceq 'CARD') {
    if(-not $Config.PSObject.Properties['cardEnabled'] -or $Config.cardEnabled -ne $true -or -not $Config.PSObject.Properties['cardPayment'] -or $Config.cardPayment.resultFormat -cnotin @('POS_LINE8_OS7','OPERATOR_CONFIRMATION') -or $Config.cardPayment.confirmed -ne $true -or [string]$Request.plan.payment.code -cne [string]$Config.cardPayment.code) {throw 'Unconfirmed card result format.'}
    $line='';if($lines.Count -gt 7) {$line=[string]$lines[7]}
    if($Config.cardPayment.resultFormat -ceq 'POS_LINE8_OS7' -or -not [string]::IsNullOrWhiteSpace($line)) {
    if($line -notmatch '^#[^#]+$') {throw 'One complete POS payment is required.'}
    $fields=@($line.Substring(1).Split(';'))
    if($fields.Count -ne 3 -or [string]::IsNullOrWhiteSpace($fields[0]) -or $fields[0] -cne $fields[0].Trim() -or $fields[0].Length -gt 60 -or $fields[0] -match '[|\x00-\x1f\x7f-\x9f]' -or $fields[0] -match '(?i)iris|[0-9]{7}' -or $fields[1] -notmatch '^(0|[1-9][0-9]{0,8})\.[0-9]{2}$' -or $fields[2].Length -lt 13 -or $fields[2].Length -gt 19 -or $fields[2] -notmatch '^[0-9]{0,6}\*{6,15}[0-9]{4}$') {throw 'Invalid masked-card evidence.'}
    if($fields[1] -cne [string]$Request.plan.payment.amount -or $fields[1] -cne [string]$Request.plan.total -or [decimal]::Parse($fields[1],[Globalization.CultureInfo]::InvariantCulture) -le 0) {throw 'Card amount does not match the checkout.'}
    $report.posPayments=@([pscustomobject]@{cardType=$fields[0];amount=$fields[1];cardNumberMasked=$fields[2]})
    }
   } elseif($lines.Count -gt 7 -and -not [string]::IsNullOrWhiteSpace([string]$lines[7])) {throw 'Unexpected POS payment in cash receipt.'}
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
 param([Parameter(Mandatory=$true)][string]$ConfigPath,[Parameter(Mandatory=$true)]$Request,[ValidateRange(1,120)][int]$TimeoutSeconds=30,[scriptblock]$AcceptHandoff)
 $c=Get-FtextConfig $ConfigPath;$folder=$c.workFolder
 $hash=Get-FtextCashHash ([Text.Encoding]::UTF8.GetBytes($folder.ToUpperInvariant()))
 $mutex=New-Object Threading.Mutex($false,('Global\MyWorkStationFtext_'+$hash.ToUpperInvariant()));$held=$false
 try {
  try {$held=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$held=$true}
  if(-not $held) {throw 'Another connector is using this ftext folder.'}
  $resultPath=Join-Path $folder ('mws-cash-'+$Request.id+'.res')
  $commandBytes=New-FtextCashCommand $c $Request $resultPath
  $digest=Get-FtextCashHash $commandBytes
  $handoff=$Request.PSObject.Properties['handoff']
  if($handoff) {
   if($Request.handoff.version -ne 1 -or [string]$Request.handoff.nonce -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or [string]$Request.handoff.commandHash -cne $digest -or $null -eq $AcceptHandoff -or ($Request.PSObject.Properties['kind'] -and [string]$Request.kind -ceq 'FTEXT_VOID')) {throw 'Unverified negotiated handoff. No fiscal command was written.'}
  }
  $intentPath=Join-Path $folder ('mws-cash-'+$Request.id+'.intent.json')
  $reportPath=Join-Path $folder ('mws-cash-'+$Request.id+'.report.json')
  $activePath=Join-Path $folder '.mws-ftext-cash.json'
  $pending=Get-FtextCashPending $c
  $publish=$false
  if($null -ne $pending -and [string]$pending.request.id -cne [string]$Request.id) {throw 'Another cash request is unresolved.'}
  if(Test-Path -LiteralPath $intentPath) {
   $intent=Get-Content -LiteralPath $intentPath -Raw -Encoding UTF8 | ConvertFrom-Json
   if([string]$intent.commandHash -cne $digest -or [string]$intent.settingsHash -cne [string]$c.settingsHash) {throw 'Cash request changed; no resend is permitted.'}
   if(-not $pending) {throw 'This cash request was already acknowledged. No resend is permitted.'}
  } else {
   if($pending -or (Test-Path -LiteralPath (Join-Path $folder '.mws-ftext-status.json')) -or @(Get-ChildItem -LiteralPath $folder -Filter '*.txt' -File).Count -gt 0 -or (Test-Path -LiteralPath $resultPath) -or (Test-Path -LiteralPath $reportPath)) {throw 'Pending or pre-existing ftext files. No command was written.'}
   if($Request.PSObject.Properties['kind'] -and [string]$Request.kind -ceq 'FTEXT_VOID') {
    $originalPath=Join-Path $folder ('mws-cash-'+[string]$Request.originalRequestId+'.res')
    if(-not (Test-Path -LiteralPath $originalPath -PathType Leaf) -or (Get-FtextCashHash ([IO.File]::ReadAllBytes($originalPath))) -cne [string]$Request.originalRawResultHash) {throw 'Original payment result changed or missing. No VOID was written.'}
   }
   $intent=[ordered]@{commandHash=$digest;settingsHash=$c.settingsHash;requestId=$Request.id}
   # Legacy intent is irreversible. Negotiated handoff still needs the unique
   # server grant before its FIRST publication; accepted grants are never renewed.
   Write-FtextCashDurable $intentPath $intent
   Write-FtextCashDurable $activePath ([ordered]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;serialNumber=$c.serialNumber;settingsHash=$c.settingsHash;request=$Request})
   $publish=-not $handoff
  }
  if(Test-Path -LiteralPath $reportPath) {return Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json}
  $temp=Join-Path $folder ('mws-cash-'+$Request.id+'.pending');$target=Join-Path $folder ('mws-cash-'+$Request.id+'.txt')
  if($handoff -and -not (Test-Path -LiteralPath $resultPath) -and -not (Test-Path -LiteralPath $temp) -and -not (Test-Path -LiteralPath $target)) {
   $grant=& $AcceptHandoff $Request $digest $ConfigPath
   if($grant -isnot [bool]) {throw 'Handoff permission was not verified. No fiscal command was written.'}
   $publish=$grant
  }
  if($publish) {
   if((Test-Path -LiteralPath (Join-Path $folder '.mws-ftext-status.json')) -or @(Get-ChildItem -LiteralPath $folder -Filter '*.txt' -File).Count -gt 0 -or (Test-Path -LiteralPath $temp) -or (Test-Path -LiteralPath $resultPath)) {throw 'Input changed before publication. Original handoff retained; no resend.'}
   $temp=Join-Path $folder ('mws-cash-'+$Request.id+'.pending');$target=Join-Path $folder ('mws-cash-'+$Request.id+'.txt')
   $s=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   try {$s.Write($commandBytes,0,$commandBytes.Length);$s.Flush($true)} finally {$s.Dispose()}
   [IO.File]::Move($temp,$target)
  }
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
function Read-FtextEvidenceFile([string]$Path,[int]$Limit) {
 $item=Get-Item -LiteralPath $Path -ErrorAction Stop
 if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'Unsafe evidence file.'}
 $s=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
 try {
  if($s.Length -lt 1 -or $s.Length -gt $Limit) {throw 'Invalid evidence size.'}
  $bytes=New-Object byte[] ([int]$s.Length);$offset=0
  while($offset -lt $bytes.Length) {$n=$s.Read($bytes,$offset,$bytes.Length-$offset);if($n -eq 0){throw 'Incomplete evidence file.'};$offset+=$n}
  return ,$bytes
 } finally {$s.Dispose()}
}
function Read-FtextLateErrorEvidence($Config,$Request) {
 if([string]$Request.kind -cne 'FTEXT_ERROR_RECHECK' -or [string]$Request.originalResultHash -notmatch '^[a-f0-9]{64}$' -or [string]$Request.plan.payment.method -cne 'CARD') {throw 'Invalid error recheck.'}
 $folder=[string]$Config.workFolder
 $resultPath=Join-Path $folder ('mws-cash-'+$Request.id+'.res')
 # This validates the original plan and computes bytes; it never publishes them.
 $commandHash=Get-FtextCashHash (New-FtextCashCommand $Config $Request $resultPath)
 $hash=Get-FtextCashHash ([Text.Encoding]::UTF8.GetBytes($folder.ToUpperInvariant()))
 $mutex=New-Object Threading.Mutex($false,('Global\MyWorkStationFtext_'+$hash.ToUpperInvariant()));$held=$false
 try {
  try {$held=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$held=$true}
  if(-not $held) {throw 'Another connector is using this ftext folder.'}
  if((Get-FtextCashPending $Config) -or (Test-Path -LiteralPath (Join-Path $folder '.mws-ftext-status.json')) -or @(Get-ChildItem -LiteralPath $folder -Filter '*.txt' -File).Count -gt 0) {throw 'The ftext folder is busy; evidence retained.'}
  $intentBytes=Read-FtextEvidenceFile (Join-Path $folder ('mws-cash-'+$Request.id+'.intent.json')) 4096
  $intent=[Text.Encoding]::UTF8.GetString($intentBytes) | ConvertFrom-Json
  if(@($intent.PSObject.Properties).Count -ne 3 -or [string]$intent.requestId -cne [string]$Request.id -or [string]$intent.settingsHash -cne [string]$Config.settingsHash -or [string]$intent.commandHash -cne $commandHash) {throw 'Original intent does not match.'}
  $reportBytes=Read-FtextEvidenceFile (Join-Path $folder ('mws-cash-'+$Request.id+'.report.json')) 4096
  if((Get-FtextCashHash $reportBytes) -cne [string]$Request.originalResultHash) {throw 'Original report does not match.'}
  $report=[Text.Encoding]::UTF8.GetString($reportBytes) | ConvertFrom-Json
  if(@($report.PSObject.Properties).Count -ne 4 -or [string]$report.requestId -cne [string]$Request.id -or [string]$report.settingsHash -cne [string]$Config.settingsHash -or [string]$report.outcome -cne 'REQUIRES_CHECK' -or [string]$report.description -cne 'The physical receipt could not be verified. Do not resend.') {throw 'Only the original unknown report can be rechecked.'}
  $bytes=Read-FtextEvidenceFile $resultPath 65536
  $parsed=Read-FtextCashResult $bytes $Config $Request
  $lines=@([Text.Encoding]::GetEncoding(1253).GetString($bytes) -split '\r?\n')
  if(-not $parsed.PSObject.Properties['code'] -or $parsed.code -notin @(44,48) -or -not $parsed.PSObject.Properties['failedCommand'] -or [string]$parsed.failedCommand -cne ('PAY||'+[string]$Request.plan.payment.code) -or @($lines | Select-Object -Skip 3 | Where-Object {$_ -notmatch '^[ \t]*$'}).Count -gt 0) {throw 'No exact original PAY error was found.'}
  return [pscustomobject]@{requestId=[string]$Request.id;settingsHash=[string]$Config.settingsHash;originalResultHash=[string]$Request.originalResultHash;commandHash=$commandHash;rawResultBase64=[Convert]::ToBase64String($bytes)}
 } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Read-FtextLateReceiptEvidence($Config,$Request) {
 if([string]$Request.kind -cne 'FTEXT_LATE_RECEIPT_RECHECK' -or [string]$Request.originalResultHash -notmatch '^[a-f0-9]{64}$' -or [string]$Request.plan.payment.method -cnotin @('CASH','CARD')) {throw 'Invalid original receipt recheck.'}
 $folder=[string]$Config.workFolder
 $resultPath=Join-Path $folder ('mws-cash-'+$Request.id+'.res')
 # This validates the original plan and computes bytes; it never publishes them.
 $commandHash=Get-FtextCashHash (New-FtextCashCommand $Config $Request $resultPath)
 $hash=Get-FtextCashHash ([Text.Encoding]::UTF8.GetBytes($folder.ToUpperInvariant()))
 $mutex=New-Object Threading.Mutex($false,('Global\MyWorkStationFtext_'+$hash.ToUpperInvariant()));$held=$false
 try {
  try {$held=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$held=$true}
  if(-not $held) {throw 'Another connector is using this ftext folder.'}
  if((Get-FtextCashPending $Config) -or (Test-Path -LiteralPath (Join-Path $folder '.mws-ftext-status.json')) -or @(Get-ChildItem -LiteralPath $folder -Filter '*.txt' -File).Count -gt 0) {throw 'The ftext folder is busy; evidence retained.'}
  $intentBytes=Read-FtextEvidenceFile (Join-Path $folder ('mws-cash-'+$Request.id+'.intent.json')) 4096
  $intent=[Text.Encoding]::UTF8.GetString($intentBytes) | ConvertFrom-Json
  if(@($intent.PSObject.Properties).Count -ne 3 -or [string]$intent.requestId -cne [string]$Request.id -or [string]$intent.settingsHash -cne [string]$Config.settingsHash -or [string]$intent.commandHash -cne $commandHash) {throw 'Original intent does not match.'}
  $reportBytes=Read-FtextEvidenceFile (Join-Path $folder ('mws-cash-'+$Request.id+'.report.json')) 4096
  if((Get-FtextCashHash $reportBytes) -cne [string]$Request.originalResultHash) {throw 'Original report does not match.'}
  $report=[Text.Encoding]::UTF8.GetString($reportBytes) | ConvertFrom-Json
  if(@($report.PSObject.Properties).Count -ne 4 -or [string]$report.requestId -cne [string]$Request.id -or [string]$report.settingsHash -cne [string]$Config.settingsHash -or [string]$report.outcome -cne 'REQUIRES_CHECK' -or [string]$report.description -cne 'The physical receipt could not be verified. Do not resend.') {throw 'Only the original unknown report can be rechecked.'}
  $bytes=Read-FtextEvidenceFile $resultPath 65536
  $parsed=Read-FtextCashResult $bytes $Config $Request
  if([string]$parsed.outcome -cne 'CONFIRMED') {return $null}
  return [pscustomobject]@{requestId=[string]$Request.id;settingsHash=[string]$Config.settingsHash;originalResultHash=[string]$Request.originalResultHash;intentBase64=[Convert]::ToBase64String($intentBytes);reportBase64=[Convert]::ToBase64String($reportBytes);rawResultBase64=[Convert]::ToBase64String($bytes)}
 } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
Export-ModuleMember -Function New-FtextCashCommand,Read-FtextCashResult,Get-FtextCashPending,Invoke-FtextCashRequest,Complete-FtextCashReport,Read-FtextLateErrorEvidence,Read-FtextLateReceiptEvidence
