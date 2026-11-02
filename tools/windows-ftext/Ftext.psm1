Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FtextConfig([string]$Path) {
    $c = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($key in @('companyId','storeId','terminalPos','serialNumber','workFolder')) {
        if (-not $c.PSObject.Properties[$key] -or [string]::IsNullOrWhiteSpace([string]$c.$key)) { throw "Missing configuration field: $key" }
    }
    foreach ($key in @('companyId','storeId','terminalPos','serialNumber')) {
        if ([string]$c.$key -notmatch '^[A-Za-z0-9_-]{2,80}$') { throw "Invalid configuration field: $key" }
    }
    if ([string]$c.workFolder -notmatch '^[A-Za-z]:\\' -or [string]$c.workFolder -match '[|\r\n]' -or ([string]$c.workFolder).Contains('..')) { throw 'An explicit local Windows folder is required.' }
    $c.workFolder = [IO.Path]::GetFullPath([string]$c.workFolder).TrimEnd('\')
    if ($c.workFolder.Length -lt 4) { throw 'Do not use a drive root as the ftext folder.' }
    if (-not (Test-Path -LiteralPath $c.workFolder -PathType Container)) { throw 'The confirmed ftext input folder does not exist.' }
    return $c
}

function Read-FtextStatusResult([byte[]]$Bytes, [string]$ExpectedSerial) {
    if ($Bytes.Length -eq 0 -or $Bytes.Length -gt 65536) { throw 'Empty or oversized ftext result.' }
    $enc = [Text.Encoding]::GetEncoding(1253, [Text.EncoderFallback]::ExceptionFallback, [Text.DecoderFallback]::ExceptionFallback)
    $text = $enc.GetString($Bytes)
    if ($text -notmatch '[\r\n]$' -or $text.Contains([char]0)) { throw 'Incomplete ftext result.' }
    $lines = @($text -split '\r?\n')
    if ($lines[0] -notmatch '^[ \t]*(\d{1,3})[ \t]*$') { throw 'Invalid ftext result code.' }
    $code = [int]$Matches[1]
    if ($code -ne 0) {
        if ($lines.Length -lt 4 -or [string]::IsNullOrWhiteSpace($lines[1]) -or [string]::IsNullOrWhiteSpace($lines[2])) { throw 'Incomplete ftext error.' }
        $failedCommand = [string]$lines[2]
        if ($failedCommand.StartsWith('InputLine: ', [StringComparison]::Ordinal)) { $failedCommand = $failedCommand.Substring(11) }
        return [pscustomobject]@{ ok=$false; code=$code; description=$lines[1]; failedCommand=$failedCommand; fiscalExecution=$false }
    }
    if ($lines.Length -lt 6 -or $lines[1] -notmatch '^\d+$' -or $lines[2] -notmatch '^\d+$' -or [string]::IsNullOrWhiteSpace($lines[4])) { throw 'Incomplete ftext status.' }
    if ($lines[3].Trim() -cne $ExpectedSerial) { throw 'The fiscal device serial does not match this installation.' }
    # STATUS success is communication evidence only. It NEVER confirms a sale.
    return [pscustomobject]@{ ok=$true; code=0; dayId=$lines[1]; dayCounter=$lines[2]; serialNumber=$lines[3].Trim(); deviceTime=$lines[4]; fiscalExecution=$false }
}

function Invoke-FtextStatus {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$ConfigPath, [ValidateRange(1,120)][int]$TimeoutSeconds=30)
    $c = Get-FtextConfig $ConfigPath
    $folder = $c.workFolder
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($folder.ToUpperInvariant()))).Replace('-','') } finally { $sha.Dispose() }
    $mutex = New-Object Threading.Mutex($false, ('Global\MyWorkStationFtext_' + $hash))
    $locked = $false
    try {
        try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'Another connector is using this ftext folder.' }
        $markerPath = Join-Path $folder '.mws-ftext-status.json'
        $pending = $null
        if (Test-Path -LiteralPath $markerPath) {
            $pending = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($key in @('companyId','storeId','terminalPos','serialNumber')) {
                if ([string]$pending.$key -cne [string]$c.$key) { throw 'An unresolved request belongs to another installation. No command was written.' }
            }
            if ([string]$pending.id -notmatch '^[a-f0-9]{32}$' -or $pending.command -cne 'STATUS') { throw 'Invalid unresolved STATUS marker. No command was written.' }
        } else {
            # Never mix the first check with an existing Simple/other input batch.
            if (@(Get-ChildItem -LiteralPath $folder -Filter '*.txt' -File).Count -gt 0) { throw 'Pending ftext input exists. No command was written.' }
            $id = [Guid]::NewGuid().ToString('N')
            $pending = [ordered]@{ id=$id; command='STATUS'; companyId=$c.companyId; storeId=$c.storeId; terminalPos=$c.terminalPos; serialNumber=$c.serialNumber; createdAt=[DateTime]::UtcNow.ToString('o') }
            $markerBytes = [Text.Encoding]::UTF8.GetBytes(($pending | ConvertTo-Json -Compress))
            $stream = [IO.File]::Open($markerPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            try { $stream.Write($markerBytes,0,$markerBytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
            $resultPath = Join-Path $folder ('mws-status-' + $id + '.res')
            $commandPath = Join-Path $folder ('mws-status-' + $id + '.txt')
            $tempPath = Join-Path $folder ('mws-status-' + $id + '.pending')
            $encoding = [Text.Encoding]::GetEncoding(1253,[Text.EncoderFallback]::ExceptionFallback,[Text.DecoderFallback]::ExceptionFallback)
            $commandBytes = $encoding.GetBytes("RESULT_FILENAME|$resultPath`r`nSTATUS`r`n")
            # No arbitrary command argument is accepted. Only STATUS can be emitted.
            if ((Test-Path -LiteralPath $resultPath) -or (Test-Path -LiteralPath $commandPath)) { throw 'Request path already exists; no overwrite allowed.' }
            $stream = [IO.File]::Open($tempPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            try { $stream.Write($commandBytes,0,$commandBytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
            [IO.File]::Move($tempPath,$commandPath)
        }
        $id = [string]$pending.id
        $resultPath = Join-Path $folder ('mws-status-' + $id + '.res')
        $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        while ([DateTime]::UtcNow -lt $deadline) {
            if (Test-Path -LiteralPath $resultPath -PathType Leaf) {
                $stream = $null
                try {
                    $stream = [IO.File]::Open($resultPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
                    if ($stream.Length -gt 65536) { throw 'Oversized ftext result.' }
                    $bytes = New-Object byte[] ([int]$stream.Length)
                    $offset = 0
                    while ($offset -lt $bytes.Length) {
                        $count = $stream.Read($bytes,$offset,$bytes.Length-$offset)
                        if ($count -eq 0) { break }; $offset += $count
                    }
                } catch [IO.IOException] { Start-Sleep -Milliseconds 200; continue } finally { if ($null -ne $stream) { $stream.Dispose() } }
                try { $result = Read-FtextStatusResult $bytes ([string]$c.serialNumber) } catch { Start-Sleep -Milliseconds 200; continue }
                # Keep a durable, redacted result before resolving the marker.
                $evidence = [ordered]@{ requestId=$id; companyId=$c.companyId; storeId=$c.storeId; terminalPos=$c.terminalPos; checkedAt=[DateTime]::UtcNow.ToString('o'); result=$result }
                $evidencePath = Join-Path $folder ('mws-status-' + $id + '.json')
                $jsonBytes = [Text.Encoding]::UTF8.GetBytes(($evidence | ConvertTo-Json -Depth 5))
                if (Test-Path -LiteralPath $evidencePath) {
                    $saved = Get-Content -LiteralPath $evidencePath -Raw -Encoding UTF8 | ConvertFrom-Json
                    foreach ($key in @('companyId','storeId','terminalPos')) {
                        if ([string]$saved.$key -cne [string]$c.$key) { throw 'Stored evidence scope mismatch.' }
                    }
                    if ($saved.requestId -cne $id -or ($saved.result | ConvertTo-Json -Compress) -cne ($result | ConvertTo-Json -Compress)) { throw 'Stored evidence does not match the current result.' }
                    Remove-Item -LiteralPath $markerPath
                    return $saved
                }
                $stream = [IO.File]::Open($evidencePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                try { $stream.Write($jsonBytes,0,$jsonBytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
                Remove-Item -LiteralPath $markerPath
                return [pscustomobject]$evidence
            }
            Start-Sleep -Milliseconds 200
        }
        throw 'No verified STATUS result. The request remains unresolved; reopening only reads its result and never resends it.'
    } finally { if ($locked) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
}
function Get-FtextArchiveHash([string]$Path) {
    $item=Get-Item -LiteralPath $Path -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 65536) {throw 'Unsafe STATUS evidence file.'}
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Read-FtextArchiveStatus([string]$Path,[string]$Serial) {
    $null=Get-FtextArchiveHash $Path
    $bytes=[IO.File]::ReadAllBytes($Path)
    $lines=@([Text.Encoding]::GetEncoding(1253).GetString($bytes) -split '\r?\n')
    if(($lines.Count -gt 6 -and -not [string]::IsNullOrWhiteSpace($lines[6])) -or ($lines.Count -gt 7 -and -not [string]::IsNullOrWhiteSpace($lines[7]))) {throw 'Fiscal receipt/payment evidence must never be archived as STATUS.'}
    return Read-FtextStatusResult $bytes $Serial
}
function Assert-FtextArchivePath([string]$Path) {
    $p=[IO.Path]::GetFullPath($Path)
    while(-not [string]::IsNullOrEmpty($p)) {
        if(Test-Path -LiteralPath $p) {if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'Archive paths must not contain reparse points.'}}
        $parent=[IO.Path]::GetDirectoryName($p)
        if($parent -eq $p) {break};$p=$parent
    }
}
function Get-FtextArchiveRoot($Config) {
    if([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {throw 'Local archive root is unavailable.'}
    $root=Join-Path $env:LOCALAPPDATA ('MyWorkStation\FtextStatusArchive\'+$Config.companyId+'\'+$Config.storeId+'\'+$Config.terminalPos)
    $root=[IO.Path]::GetFullPath($root)
    $input=[IO.Path]::GetFullPath($Config.workFolder).TrimEnd('\','/')
    if($root.StartsWith($input+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $root -ieq $input -or [IO.Path]::GetPathRoot($root) -ine [IO.Path]::GetPathRoot($input)) {throw 'Archive must be outside the input folder on the same local volume.'}
    Assert-FtextArchivePath $root;Assert-FtextArchivePath $input
    return $root
}
function Assert-FtextArchiveQuiescent($Config) {
    if(Test-Path -LiteralPath (Join-Path $Config.workFolder '.mws-ftext-cash.json')) {throw 'Original fiscal recovery is pending. No maintenance is allowed.'}
    if([IO.Directory]::GetFiles($Config.workFolder,'*.txt').Length -gt 0 -or [IO.Directory]::GetFiles($Config.workFolder,'*.pending').Length -gt 0) {throw 'Input is pending. No maintenance is allowed.'}
    $markerPath=Join-Path $Config.workFolder '.mws-ftext-status.json'
    if(Test-Path -LiteralPath $markerPath) {
        $null=Get-FtextArchiveHash $markerPath
        $m=Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach($key in @('companyId','storeId','terminalPos','serialNumber')) {if([string]$m.$key -cne [string]$Config.$key) {throw 'Unknown STATUS marker retained. No maintenance is allowed.'}}
        if($m.command -cne 'STATUS' -or [string]$m.id -notmatch '^[a-f0-9]{32}$') {throw 'Unknown STATUS marker retained.'}
        $path=Join-Path $Config.workFolder ('mws-status-'+$m.id+'.res')
        $null=Get-FtextArchiveHash $path
        $result=Read-FtextArchiveStatus $path ([string]$Config.serialNumber)
        if(-not $result.ok) {throw 'Original STATUS is unresolved. No maintenance is allowed.'}
        return [string]$m.id
    }
    return ''
}
function Read-FtextArchiveJournal($Config,[string]$Path) {
    Assert-FtextArchivePath $Path
    $item=Get-Item -LiteralPath $Path -Force
    if($item.Length -gt 2097152 -or $item.PSIsContainer) {throw 'Oversized maintenance journal.'}
    $j=Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    if($j.schema -cne 'MWS_FTEXT_STATUS_ARCHIVE_V1' -or [string]$j.id -notmatch '^[a-f0-9]{32}$' -or @($j.files).Count -lt 2 -or @($j.files).Count -gt 2000) {throw 'Invalid maintenance journal.'}
    foreach($key in @('companyId','storeId','terminalPos','serialNumber','workFolder')) {if([string]$j.$key -cne [string]$Config.$key) {throw 'Maintenance journal belongs to another installation.'}}
    $seen=@{}
    foreach($f in @($j.files)) {
        if([string]$f.name -notmatch '^mws-status-[a-f0-9]{32}\.(json|res)$' -or [string]$f.sha256 -notmatch '^[a-f0-9]{64}$' -or $seen.ContainsKey([string]$f.name)) {throw 'Invalid archived file identity.'}
        foreach($time in @('createdUtc','modifiedUtc')) {$null=[DateTimeOffset]::Parse([string]$f.$time,[Globalization.CultureInfo]::InvariantCulture)}
        $seen[[string]$f.name]=$true
    }
    foreach($f in @($j.files)) {foreach($suffix in @('.json','.res')) {if(-not $seen.ContainsKey(([string]$f.name).Substring(0,43)+$suffix)) {throw 'Incomplete STATUS pair in journal.'}}}
    return $j
}
function Invoke-FtextStatusArchive {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$ConfigPath,[ValidateSet('Plan','Apply','Restore')][string]$Mode='Plan',[string[]]$AcknowledgedIds=@())
    $c=Get-FtextConfig $ConfigPath;$root=Get-FtextArchiveRoot $c
    $sha=[Security.Cryptography.SHA256]::Create()
    try {$hash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($c.workFolder.ToUpperInvariant()))).Replace('-','')} finally {$sha.Dispose()}
    $mutex=New-Object Threading.Mutex($false,('Global\MyWorkStationFtext_'+$hash));$held=$false
    try {
        try {$held=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$held=$true}
        if(-not $held) {throw 'The FTEXT folder is busy. Stop the connector before maintenance.'}
        $retainedMarker=Assert-FtextArchiveQuiescent $c
        $active=Join-Path $root 'active-maintenance.json'
        $journal=$null;$journalPath=$null
        if(Test-Path -LiteralPath $active) {$journalPath=$active;$journal=Read-FtextArchiveJournal $c $active}
        if($Mode -ceq 'Restore' -and $null -eq $journal) {
            $last=if(Test-Path -LiteralPath $root) {Get-ChildItem -LiteralPath $root -Filter 'history-*.json' -File | Where-Object {$_.Name -match '^history-[a-f0-9]{32}\.json$'} | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1} else {$null}
            if($null -eq $last) {throw 'No reversible STATUS archive journal was found.'}
            $journalPath=$last.FullName;$journal=Read-FtextArchiveJournal $c $journalPath
        }
        $ids=New-Object 'Collections.Generic.List[string]';$files=New-Object 'Collections.Generic.List[object]';$rejected=0;$retained=0
        if($null -ne $journal) {
            foreach($f in @($journal.files)) {if($f.name.Substring(11,32) -ceq $retainedMarker) {throw 'An archived STATUS is now active. Original files retained.'};$files.Add($f);if(-not $ids.Contains($f.name.Substring(11,32))) {$ids.Add($f.name.Substring(11,32))}}
        } else {
            $all=@(Get-ChildItem -LiteralPath $c.workFolder -Filter 'mws-status-*.json' -File | Where-Object {$_.Name -match '^mws-status-[a-f0-9]{32}\.json$'} | Sort-Object LastWriteTimeUtc -Descending)
            for($i=0;$i -lt $all.Count;$i++) {
                $item=$all[$i];$id=$item.Name.Substring(11,32)
                if($i -lt 100 -or $id -ceq $retainedMarker -or $item.LastWriteTimeUtc -gt [DateTime]::UtcNow.AddHours(-1) -or $ids.Count -ge 1000) {$retained++;continue}
                try {
                    $res=Join-Path $c.workFolder ('mws-status-'+$id+'.res')
                    $jsonHash=Get-FtextArchiveHash $item.FullName;$resHash=Get-FtextArchiveHash $res
                    $e=Get-Content -LiteralPath $item.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                    if($e.requestId -cne $id) {throw 'STATUS identity mismatch.'}
                    foreach($key in @('companyId','storeId','terminalPos')) {if([string]$e.$key -cne [string]$c.$key) {throw 'STATUS scope mismatch.'}}
                    $checked=[DateTime]::Parse([string]$e.checkedAt,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
                    if($checked -gt [DateTime]::UtcNow.AddHours(-1)) {$retained++;continue}
                    $parsed=Read-FtextArchiveStatus $res ([string]$c.serialNumber)
                    if(-not $parsed.ok -or ($parsed | ConvertTo-Json -Compress) -cne ($e.result | ConvertTo-Json -Compress)) {throw 'STATUS evidence mismatch.'}
                    $resItem=Get-Item -LiteralPath $res
                    $ids.Add($id)
                    $files.Add([ordered]@{name=$item.Name;sha256=$jsonHash;createdUtc=$item.CreationTimeUtc.ToString('o');modifiedUtc=$item.LastWriteTimeUtc.ToString('o')})
                    $files.Add([ordered]@{name=('mws-status-'+$id+'.res');sha256=$resHash;createdUtc=$resItem.CreationTimeUtc.ToString('o');modifiedUtc=$resItem.LastWriteTimeUtc.ToString('o')})
                } catch {$rejected++}
            }
        }
        $approved=@{};foreach($id in $AcknowledgedIds) {if($id -notmatch '^[a-f0-9]{32}$') {throw 'Invalid acknowledged STATUS ID.'};$approved[$id]=$true}
        $selected=@($files.ToArray() | Where-Object {$approved.ContainsKey($_.name.Substring(11,32))})
        if($Mode -ceq 'Plan') {return [pscustomobject]@{candidateIds=@($ids.ToArray());candidatePairs=$ids.Count;acknowledgedPairs=($selected.Count/2);retainedPairs=$retained;rejectedPairs=$rejected;resuming=($null -ne $journal);archiveRoot=$root}}
        if($Mode -ceq 'Apply') {
            if($null -ne $journal -and $selected.Count -ne @($journal.files).Count) {throw 'Original maintenance acknowledgement is incomplete. No further move was made.'}
            if($selected.Count -eq 0) {return [pscustomobject]@{mode=$Mode;movedFiles=0;archiveId=$null}}
            if($null -eq $journal) {
                $journal=[ordered]@{schema='MWS_FTEXT_STATUS_ARCHIVE_V1';id=[Guid]::NewGuid().ToString('N');companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;serialNumber=$c.serialNumber;workFolder=$c.workFolder;createdAt=[DateTime]::UtcNow.ToString('o');files=$selected}
                $null=[IO.Directory]::CreateDirectory($root)
                Assert-FtextArchivePath $root
                $bytes=[Text.Encoding]::UTF8.GetBytes(($journal | ConvertTo-Json -Depth 6))
                $stream=[IO.File]::Open($active,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                try {$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)} finally {$stream.Dispose()}
                $journalPath=$active
            }
        }
        $destination=Join-Path $root $journal.id
        Assert-FtextArchivePath $destination
        if($Mode -ceq 'Apply') {$null=[IO.Directory]::CreateDirectory($destination)}
        # Preflight the entire pinned batch, including partial-move recovery, before moving another file.
        $proofs=@{};$results=@{}
        foreach($f in @($journal.files)) {
            $source=Join-Path $c.workFolder $f.name;$target=Join-Path $destination $f.name
            Assert-FtextArchivePath $source;Assert-FtextArchivePath $target
            $hasSource=Test-Path -LiteralPath $source;$hasTarget=Test-Path -LiteralPath $target
            if($hasSource -eq $hasTarget) {throw 'Archive collision or missing evidence. All remaining files retained.'}
            $present=if($hasSource) {$source} else {$target}
            if((Get-FtextArchiveHash $present) -cne $f.sha256) {throw 'STATUS evidence changed. All remaining files retained.'}
            $id=$f.name.Substring(11,32)
            if($f.name.EndsWith('.res')) {
                $parsed=Read-FtextArchiveStatus $present ([string]$c.serialNumber)
                if(-not $parsed.ok) {throw 'Archived STATUS is not successful.'};$results[$id]=$parsed
            } else {
                $e=Get-Content -LiteralPath $present -Raw -Encoding UTF8 | ConvertFrom-Json
                if($e.requestId -cne $id) {throw 'Archived STATUS identity mismatch.'}
                foreach($key in @('companyId','storeId','terminalPos')) {if([string]$e.$key -cne [string]$c.$key) {throw 'Archived STATUS scope mismatch.'}}
                $proofs[$id]=$e.result
            }
        }
        foreach($id in $results.Keys) {if(($results[$id] | ConvertTo-Json -Compress) -cne ($proofs[$id] | ConvertTo-Json -Compress)) {throw 'Archived STATUS pair does not reconcile.'}}
        $moved=0
        foreach($f in @($journal.files)) {
            $source=Join-Path $c.workFolder $f.name;$target=Join-Path $destination $f.name
            $from=if($Mode -ceq 'Apply') {$source} else {$target};$to=if($Mode -ceq 'Apply') {$target} else {$source}
            if(Test-Path -LiteralPath $from) {
                Assert-FtextArchivePath $from;Assert-FtextArchivePath $to
                if((Get-FtextArchiveHash $from) -cne $f.sha256) {throw 'STATUS evidence changed before move.'}
                $null=Assert-FtextArchiveQuiescent $c
                [IO.File]::Move($from,$to)
                if((Get-FtextArchiveHash $to) -cne $f.sha256) {throw 'Archive verification failed; preserve maintenance journal.'}
                $moved++
            }
            # Repair preserved metadata as well after an interrupted atomic move.
            [IO.File]::SetCreationTimeUtc($to,([DateTimeOffset]::Parse([string]$f.createdUtc,[Globalization.CultureInfo]::InvariantCulture).UtcDateTime))
            [IO.File]::SetLastWriteTimeUtc($to,([DateTimeOffset]::Parse([string]$f.modifiedUtc,[Globalization.CultureInfo]::InvariantCulture).UtcDateTime))
        }
        $finalName=if($Mode -ceq 'Apply') {'history-'} else {'restored-'}
        [IO.File]::Move($journalPath,(Join-Path $root ($finalName+$journal.id+'.json')))
        return [pscustomobject]@{mode=$Mode;movedFiles=$moved;archiveId=$journal.id}
    } finally {if($held) {$mutex.ReleaseMutex()};$mutex.Dispose()}
}
Export-ModuleMember -Function Get-FtextConfig,Read-FtextStatusResult,Invoke-FtextStatus,Invoke-FtextStatusArchive
