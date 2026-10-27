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
Export-ModuleMember -Function Get-FtextConfig,Read-FtextStatusResult,Invoke-FtextStatus
