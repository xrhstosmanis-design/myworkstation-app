param(
 [string]$Folder='C:\FText',
 [string]$ReportDirectory=[Environment]::GetFolderPath('Desktop'),
 [switch]$NoOpen
)
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
try {
 $inputPath=[IO.Path]::GetFullPath($Folder).TrimEnd([IO.Path]::DirectorySeparatorChar)
 $outputPath=[IO.Path]::GetFullPath($ReportDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar)
 if(-not (Test-Path -LiteralPath $inputPath -PathType Container)) {throw 'The FText folder was not found.'}
 if(-not (Test-Path -LiteralPath $outputPath -PathType Container)) {throw 'The report folder was not found.'}
 if($outputPath.Equals($inputPath,[StringComparison]::OrdinalIgnoreCase) -or $outputPath.StartsWith($inputPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'The report must be saved outside the FText folder.'}
 $pattern='^mws-cash-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(intent\.json|publish\.json|report\.json|stop\.json|res|txt|pending)$'
 $all=@(Get-ChildItem -LiteralPath $inputPath -File | Where-Object { $_.Name -cmatch $pattern -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) })
 $groups=@($all | Group-Object {([regex]::Match($_.Name,$pattern)).Groups[1].Value} | Sort-Object {($_.Group | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc} -Descending | Select-Object -First 12)
 $rows=@(foreach($group in $groups) {
  $files=@(foreach($file in ($group.Group | Sort-Object Name)) {
   [pscustomobject][ordered]@{name=$file.Name;bytes=$file.Length;createdUtc=$file.CreationTimeUtc.ToString('o');modifiedUtc=$file.LastWriteTimeUtc.ToString('o')}
  })
  [pscustomobject][ordered]@{requestId=$group.Name;files=$files}
 })
 $report=[ordered]@{schema='MWS_FTEXT_TIMING_METADATA_V1';collectedUtc=[DateTime]::UtcNow.ToString('o');powershellVersion=$PSVersionTable.PSVersion.ToString();folder=$inputPath;requestCount=$rows.Count;requests=$rows;limits='File metadata only. No fiscal command, network request, receipt contents or credentials. Copied/restored file times may be misleading.'}
 $path=Join-Path $outputPath ('Rizareio_Ftext_Timing_'+[DateTime]::UtcNow.ToString('yyyyMMdd_HHmmss_fffffff')+'.json')
 $bytes=[Text.Encoding]::UTF8.GetBytes(($report | ConvertTo-Json -Depth 8))
 $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try {$stream.Write($bytes,0,$bytes.Length)} finally {$stream.Dispose()}
 Write-Host ('REPORT SAVED: '+$path)
 if(-not $NoOpen) {Start-Process explorer.exe -ArgumentList ('/select,"'+$path+'"')}
 exit 0
} catch {
 Write-Host ('TIMING REPORT ERROR: '+$_.Exception.Message)
 exit 1
}
