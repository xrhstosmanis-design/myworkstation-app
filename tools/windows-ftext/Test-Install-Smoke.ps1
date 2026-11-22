$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('ftext-install-'+[guid]::NewGuid())
$oldLocal=$env:LOCALAPPDATA
New-Item -ItemType Directory -Path $root | Out-Null
try {
    $env:LOCALAPPDATA=$root
    $folder=Join-Path $root 'input'; New-Item -ItemType Directory $folder | Out-Null
    $names=@('Ftext.psm1','Cloud-Tools.psm1','Pair.ps1','Cloud-Test.ps1','Cloud-Connector.ps1','Setup.ps1','Cash.psm1')
    $files=[ordered]@{}
    foreach($name in $names) { $files[$name]=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))) }
    $template=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Install.template.cmd'))
    foreach($cash in @($false,$true)) {
        $config=@{companyId='install-company';storeId='install-store';terminalPos=('POS-'+$cash);serialNumber='UNIT123';fiscalDeviceCode='UNIT-FISCAL';workFolder=$folder;protocol='SOLIDUS(II)T';configurationId='unit-config';lifecycleGeneration='0';settingsHash=('a'*64);apiBase='https://unit.invalid';storeName='Isolated installation';cashEnabled=$cash}
        $config64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($config|ConvertTo-Json -Compress)))
        $files64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($files|ConvertTo-Json -Compress)))
        $package=$template.Replace('__CONFIG_BASE64__',$config64).Replace('__FILES_BASE64__',$files64)
        $source=($package -split '(?m)^# MWS_FTEXT_POWERSHELL_BEGIN\r?$',2)[1]
        # Only menu exit is selected. Pair, STATUS and connector never run.
        function Read-Host { param($Prompt) return '4' }
        $output=(& ([scriptblock]::Create($source)) 6>&1 | Out-String)
        if($output -notmatch '4. Close setup' -or $output -notmatch '9. Safe STATUS communication recovery' -or $output -match 'STOP:') { throw "Setup did not open: $output" }
        $destination=Join-Path $root ('MyWorkStation\Ftext\install-company\install-store\'+$config.terminalPos)
        foreach($name in $names) {
            $expected=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name)))
            $actual=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $destination $name)))
            if($actual -cne $expected) { throw "Extracted payload differs: $name" }
        }
        $readback=Get-Content -LiteralPath (Join-Path $destination 'config.json') -Raw | ConvertFrom-Json
        if($readback.terminalPos -ne $config.terminalPos -or $readback.cashEnabled -ne $cash) {throw 'Configuration changed'}
        Write-Host "PASS actual installer opens real setup and extracts all seven files, cash=$cash"
    }
    # Real menu option 9 must fail closed if option 2 owns the cloud STATUS mutex.
    $sha=[Security.Cryptography.SHA256]::Create()
    try {$scopeHash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($config.companyId+'|'+$config.storeId+'|'+$config.terminalPos))).Replace('-','')} finally {$sha.Dispose()}
    $mutexName='Global\MWS.Ftext.CloudTest.'+$scopeHash
    $readyFile=Join-Path $root 'option2-held.txt'
    $guardJob=Start-Job -ArgumentList $mutexName,$readyFile -ScriptBlock {
        param($name,$path)
        $mutex=New-Object Threading.Mutex($false,$name);$held=$false
        try {
            $held=$mutex.WaitOne(0)
            if(-not $held){throw 'Could not hold option 2 mutex.'}
            [IO.File]::WriteAllText($path,'HELD')
            Start-Sleep -Seconds 15
        } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
    }
    try {
        for($i=0;$i -lt 100 -and -not (Test-Path -LiteralPath $readyFile);$i++){Start-Sleep -Milliseconds 100}
        if(-not (Test-Path -LiteralPath $readyFile)){throw 'Option 2 mutex test worker did not start.'}
        $global:FTEXT_TEST_MENU_CHOICES=New-Object 'Collections.Generic.Queue[string]'
        foreach($answer in @('9','RECOVER','4')){$global:FTEXT_TEST_MENU_CHOICES.Enqueue($answer)}
        function Read-Host {param($Prompt) if($global:FTEXT_TEST_MENU_CHOICES.Count -eq 0){throw 'Unexpected menu prompt.'};return $global:FTEXT_TEST_MENU_CHOICES.Dequeue()}
        $result=(& (Join-Path $destination 'Setup.ps1') -ConfigPath (Join-Path $destination 'config.json') 6>&1 | Out-String)
        if($result -notmatch 'STOP: option 2 STATUS check is still running' -or $result -match 'STATUS RECOVERY:'){
            throw "Option 9 did not reject overlapping option 2: $result"
        }
        if(@(Get-ChildItem -LiteralPath $folder -Force -File).Count -ne 0){throw 'Option 9 touched input while option 2 was active.'}
        Write-Host 'PASS CMD option 9 blocks concurrent option 2 STATUS without changing input'
    } finally {
        if($null -ne $guardJob){Stop-Job $guardJob -ErrorAction SilentlyContinue;Remove-Job $guardJob -Force -ErrorAction SilentlyContinue}
        Remove-Variable -Name FTEXT_TEST_MENU_CHOICES -Scope Global -ErrorAction SilentlyContinue
        # Restore the original menu-exit stub for the following invalid-package test.
        function Read-Host {param($Prompt) return '4'}
    }
    # The fixed allowlist must continue to reject any unrecognized payload.
    $files['Unexpected.ps1']=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("throw 'must not execute'"))
    $bad=$template.Replace('__CONFIG_BASE64__',$config64).Replace('__FILES_BASE64__',[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($files|ConvertTo-Json -Compress))))
    # Preserve the real extraction guard and replace only exit so rejection can be asserted in-process.
    $badSource=(($bad -split '(?m)^# MWS_FTEXT_POWERSHELL_BEGIN\r?$',2)[1]).Replace('exit 1',"throw 'REJECTED_PACKAGE'")
    $rejected=$false
    try { & ([scriptblock]::Create($badSource)) | Out-Null } catch {if($_.Exception.Message -eq 'REJECTED_PACKAGE') {$rejected=$true} else {throw}}
    if(-not $rejected -or (Test-Path -LiteralPath (Join-Path $destination 'Unexpected.ps1'))) {throw 'Unexpected file was accepted'}
    Write-Host 'PASS unknown package files still rejected'
} finally {
    Remove-Item Function:\Read-Host -ErrorAction SilentlyContinue
    $env:LOCALAPPDATA=$oldLocal
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
