$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Ftext.psm1') -Force
$root=Join-Path ([IO.Path]::GetTempPath()) ('mws-status-archive-test-'+[Guid]::NewGuid().ToString('N'))
$oldLocal=$env:LOCALAPPDATA
function Assert-Archive($Condition,[string]$Message) {if(-not $Condition) {throw $Message}}
function Reject-Archive([scriptblock]$Action) {$failed=$false;try {& $Action | Out-Null} catch {$failed=$true};Assert-Archive $failed ('Expected maintenance refusal: '+$Action.ToString())}
try {
 $folder=Join-Path $root 'input';$null=New-Item -ItemType Directory -Path $folder -Force
 $env:LOCALAPPDATA=Join-Path $root 'local'
 $c=[pscustomobject]@{companyId='archive-company';storeId='archive-store';terminalPos='POS-01';serialNumber='ARCHIVE123';workFolder=$folder}
 $config=Join-Path $root 'config.json';$c | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
 # Linux local verification exercises real moves/mutex/journals. Windows CI
 # uses the real production Windows configuration parser without substitution.
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  & (Get-Module Ftext) {param($Fixture);$script:ArchiveFixtureConfig=$Fixture;Set-Item Function:script:Get-FtextConfig -Value {param($Path);return $script:ArchiveFixtureConfig}} $c
 }
 $resultBytes=[Text.Encoding]::GetEncoding(1253).GetBytes("0`r`n17`r`n42`r`nARCHIVE123`r`nfixture time`r`n`r`n`r`n`r`n")
 $result=Read-FtextStatusResult $resultBytes $c.serialNumber
 for($i=0;$i -lt 103;$i++) {
  $id=$i.ToString('x32');$prefix=Join-Path $folder ('mws-status-'+$id)
  [IO.File]::WriteAllBytes(($prefix+'.res'),$resultBytes)
  $proof=[ordered]@{requestId=$id;companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;checkedAt=[DateTime]::UtcNow.AddHours(-3).ToString('o');result=$result}
  [IO.File]::WriteAllText(($prefix+'.json'),($proof | ConvertTo-Json -Depth 5))
  (Get-Item -LiteralPath ($prefix+'.json')).LastWriteTimeUtc=[DateTime]::UtcNow.AddHours(-2).AddSeconds($i)
 }
 $fiscal=Join-Path $folder 'mws-cash-11111111-1111-4111-8111-111111111111.res';[IO.File]::WriteAllText($fiscal,'PROTECTED ORIGINAL FISCAL EVIDENCE')
 $fiscalHash=(Get-FileHash -LiteralPath $fiscal).Hash
 $before=@(Get-ChildItem -LiteralPath $folder -File).Count
 $plan=Invoke-FtextStatusArchive -ConfigPath $config
 Assert-Archive ($plan.candidatePairs -eq 3 -and $plan.acknowledgedPairs -eq 0) 'Recent safety tail was not retained.'
 Assert-Archive (-not (Test-Path -LiteralPath $env:LOCALAPPDATA)) 'Dry-run wrote an archive.'
 Assert-Archive (@(Get-ChildItem -LiteralPath $folder -File).Count -eq $before) 'Dry-run changed evidence.'
 $ids=@($plan.candidateIds)
 $proofPath=Join-Path $folder ('mws-status-'+$ids[2]+'.json');$proofBytes=[IO.File]::ReadAllBytes($proofPath);$proofTime=(Get-Item -LiteralPath $proofPath).LastWriteTimeUtc
 $bad=Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json;$bad.storeId='foreign-store'
 [IO.File]::WriteAllText($proofPath,($bad | ConvertTo-Json -Depth 6));[IO.File]::SetLastWriteTimeUtc($proofPath,$proofTime)
 $badPlan=Invoke-FtextStatusArchive -ConfigPath $config
 Assert-Archive ($badPlan.rejectedPairs -eq 1 -and $badPlan.candidatePairs -eq 2) 'Foreign evidence was eligible for archive.'
 [IO.File]::WriteAllBytes($proofPath,$proofBytes);[IO.File]::SetLastWriteTimeUtc($proofPath,$proofTime)
 $receiptPath=Join-Path $folder ('mws-status-'+$ids[2]+'.res');$savedResult=[IO.File]::ReadAllBytes($receiptPath)
 [IO.File]::WriteAllText($receiptPath,"0`r`n17`r`n42`r`nARCHIVE123`r`nfixture time`r`n`r`nhttps://www1.aade.gr/dcl/protected-fixture`r`n")
 $fiscalPlan=Invoke-FtextStatusArchive -ConfigPath $config
 Assert-Archive ($fiscalPlan.rejectedPairs -eq 1 -and $fiscalPlan.candidatePairs -eq 2) 'Mislabelled fiscal evidence was eligible for STATUS archive.'
 [IO.File]::WriteAllBytes($receiptPath,$savedResult)
 $only=@($ids[0]);$applied=Invoke-FtextStatusArchive -ConfigPath $config -Mode Apply -AcknowledgedIds $only
 Assert-Archive ($applied.movedFiles -eq 2) 'Unacknowledged history was moved.'
 Assert-Archive ((Get-FileHash -LiteralPath $fiscal).Hash -ceq $fiscalHash) 'Fiscal evidence changed.'
 $restored=Invoke-FtextStatusArchive -ConfigPath $config -Mode Restore
 Assert-Archive ($restored.movedFiles -eq 2) 'Archive did not restore both original files.'
 Assert-Archive (@(Get-ChildItem -LiteralPath $folder -File).Count -eq $before) 'Restore lost evidence.'
 $input=Join-Path $folder 'foreign.txt';[IO.File]::WriteAllText($input,'FOREIGN INPUT')
 Reject-Archive {Invoke-FtextStatusArchive -ConfigPath $config -Mode Apply -AcknowledgedIds $ids}
 Assert-Archive ([IO.File]::ReadAllText($input) -ceq 'FOREIGN INPUT') 'Foreign input changed.'
 Remove-Item -LiteralPath $input
 $pending=Join-Path $folder '.mws-ftext-cash.json';[IO.File]::WriteAllText($pending,'unresolved original')
 Reject-Archive {Invoke-FtextStatusArchive -ConfigPath $config}
 Remove-Item -LiteralPath $pending -Force
 $statusMarker=Join-Path $folder '.mws-ftext-status.json'
 [IO.File]::WriteAllText($statusMarker,'{"id":"unknown"}')
 Reject-Archive {Invoke-FtextStatusArchive -ConfigPath $config}
 Remove-Item -LiteralPath $statusMarker -Force
 $marker=[ordered]@{id=$ids[2];command='STATUS';companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;serialNumber=$c.serialNumber}
 [IO.File]::WriteAllText($statusMarker,($marker | ConvertTo-Json))
 $markerBytes=[IO.File]::ReadAllBytes($statusMarker)
 $markerPlan=Invoke-FtextStatusArchive -ConfigPath $config
 Assert-Archive ($markerPlan.candidateIds -cnotcontains $ids[2]) 'Original STATUS marker evidence was selected.'
 Assert-Archive ([Convert]::ToBase64String([IO.File]::ReadAllBytes($statusMarker)) -ceq [Convert]::ToBase64String($markerBytes)) 'Original STATUS marker was modified.'
 Remove-Item -LiteralPath $statusMarker -Force
 $linked=Join-Path $root 'linked-local';$targetDir=Join-Path $root 'link-target';$null=New-Item -ItemType Directory -Path $targetDir
 $linkType=if([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {'Junction'} else {'SymbolicLink'}
 $null=New-Item -ItemType $linkType -Path $linked -Target $targetDir
 $env:LOCALAPPDATA=$linked
 Reject-Archive {Invoke-FtextStatusArchive -ConfigPath $config}
 $env:LOCALAPPDATA=Join-Path $root 'local';Remove-Item -LiteralPath $linked -Force
 # Model a process interruption after the first atomic move using a pinned
 # journal and unchanged real bytes, then exercise production resume.
 $archiveRoot=$plan.archiveRoot;$journalId=[Guid]::NewGuid().ToString('N');$destination=Join-Path $archiveRoot $journalId
 $null=New-Item -ItemType Directory -Path $destination -Force
 $files=@();foreach($suffix in @('.json','.res')) {$name='mws-status-'+$ids[1]+$suffix;$item=Get-Item -LiteralPath (Join-Path $folder $name);$files+=@{name=$name;sha256=(Get-FileHash -LiteralPath $item.FullName).Hash.ToLowerInvariant();createdUtc=$item.CreationTimeUtc.ToString('o');modifiedUtc=$item.LastWriteTimeUtc.ToString('o')}}
 $journal=[ordered]@{schema='MWS_FTEXT_STATUS_ARCHIVE_V1';id=$journalId;companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;serialNumber=$c.serialNumber;workFolder=$c.workFolder;files=$files}
 $active=Join-Path $archiveRoot 'active-maintenance.json'
 [IO.File]::WriteAllText($active,($journal | ConvertTo-Json -Depth 6))
 [IO.File]::Move((Join-Path $folder $files[0].name),(Join-Path $destination $files[0].name))
 Reject-Archive {Invoke-FtextStatusArchive -ConfigPath $config -Mode Apply -AcknowledgedIds @($ids[0])}
 $resumed=Invoke-FtextStatusArchive -ConfigPath $config -Mode Apply -AcknowledgedIds @($ids[1])
 Assert-Archive ($resumed.movedFiles -eq 1) 'Interrupted archive did not resume without duplicate moves.'
 $target=Join-Path $destination $files[0].name;$original=[IO.File]::ReadAllBytes($target)
 [IO.File]::WriteAllText($target,'changed evidence')
 Reject-Archive {Invoke-FtextStatusArchive -ConfigPath $config -Mode Restore}
 Assert-Archive (-not (Test-Path -LiteralPath (Join-Path $folder $files[1].name))) 'Failed preflight partially restored another file.'
 [IO.File]::WriteAllBytes($target,$original)
 # Destination collision must never overwrite the original or archived bytes.
 [IO.File]::WriteAllText((Join-Path $folder $files[0].name),'collision')
 Reject-Archive {Invoke-FtextStatusArchive -ConfigPath $config -Mode Restore}
 Assert-Archive ([IO.File]::ReadAllText((Join-Path $folder $files[0].name)) -ceq 'collision') 'Restore overwrote a collision.'
 Remove-Item -LiteralPath (Join-Path $folder $files[0].name)
 $null=Invoke-FtextStatusArchive -ConfigPath $config -Mode Restore
 Assert-Archive ((Get-FileHash -LiteralPath $fiscal).Hash -ceq $fiscalHash) 'Maintenance touched fiscal evidence.'
 Assert-Archive (@(Get-ChildItem -LiteralPath $folder -File).Count -eq $before) 'Final evidence count changed.'
 Write-Host 'PASS: STATUS-only dry-run, acknowledged pairs, safety tail, protected inputs/fiscal files, interrupted atomic moves, hash failure, collisions and exact restore.'
} finally {
 $env:LOCALAPPDATA=$oldLocal
 if(Test-Path -LiteralPath $root) {Remove-Item -LiteralPath $root -Recurse -Force}
}
