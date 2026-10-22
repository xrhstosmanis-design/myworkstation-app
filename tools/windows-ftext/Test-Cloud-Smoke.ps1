$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
$root=Join-Path ([IO.Path]::GetTempPath()) ('ftext-cloud-fixture-'+[Guid]::NewGuid().ToString('N'))
$oldLocal=$env:LOCALAPPDATA
New-Item -ItemType Directory -Path $root | Out-Null
try {
    $env:LOCALAPPDATA=$root
    $c=[pscustomobject]@{companyId='fixture-company';storeId='fixture-store';terminalPos='POS-01';serialNumber='TEST12345';workFolder=(Join-Path $root 'work');settingsHash=('a'*64);apiBase='https://fixture.invalid';fiscalDeviceCode='FISCAL-01';protocol='SOLIDUS(II)T';configurationId=[Guid]::NewGuid().ToString();lifecycleGeneration='0'}
    $configPath=Join-Path $root 'config.json'
    $c | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    $loaded=Get-FtextCloudConfig $configPath
    if($loaded.settingsHash -cne $c.settingsHash) { throw 'Config did not round trip.' }
    $response=[pscustomobject]@{companyId=$c.companyId;storeId=$c.storeId;terminalPos=$c.terminalPos;settingsHash=$c.settingsHash;settings=$c;fiscalCheckoutEnabled=$false}
    Confirm-FtextCloudIdentity $c $response
    foreach($key in @('companyId','storeId','terminalPos','settingsHash')) {
        $wrong=$response | ConvertTo-Json -Depth 5 | ConvertFrom-Json
        $wrong.$key='foreign'
        $rejected=$false;try { Confirm-FtextCloudIdentity $c $wrong } catch { $rejected=$true }
        if(-not $rejected) { throw "Wrong $key was accepted." }
    }
    foreach($key in @('serialNumber','workFolder','fiscalDeviceCode','configurationId','lifecycleGeneration','protocol')) {
        $wrong=$response | ConvertTo-Json -Depth 5 | ConvertFrom-Json
        $wrong.settings.$key='changed'
        $rejected=$false;try { Confirm-FtextCloudIdentity $c $wrong } catch { $rejected=$true }
        if(-not $rejected) { throw "Changed settings $key were accepted." }
    }
    $credentialPath=Get-FtextCredentialPath $c
    New-Item -ItemType Directory -Path (Split-Path -Parent $credentialPath) -Force | Out-Null
    $credential=New-Object Management.Automation.PSCredential($c.settingsHash,(ConvertTo-SecureString 'fixture-only-device-token' -AsPlainText -Force))
    $credential | Export-Clixml -LiteralPath $credentialPath
    if((Read-FtextDeviceToken $c) -cne 'fixture-only-device-token') { throw 'DPAPI credential did not round trip.' }
    if((Get-Content -LiteralPath $credentialPath -Raw).Contains('fixture-only-device-token')) { throw 'Credential was stored in clear text.' }
    $changed=$c | ConvertTo-Json | ConvertFrom-Json;$changed.settingsHash='b'*64
    $rejected=$false;try { Read-FtextDeviceToken $changed | Out-Null } catch { $rejected=$true }
    if(-not $rejected) { throw 'Changed settings used the previous credential.' }
    # No credential means no network call and no physical STATUS input.
    Remove-Item -LiteralPath $credentialPath
    New-Item -ItemType Directory -Path $c.workFolder | Out-Null
    $rejected=$false;try { & (Join-Path $PSScriptRoot 'Cloud-Test.ps1') -ConfigPath $configPath } catch { $rejected=$true }
    if(-not $rejected -or @(Get-ChildItem -LiteralPath $c.workFolder -File).Count -ne 0) { throw 'Unpaired check reached physical transport.' }
    Write-Host 'PASS: config, 10 foreign/settings boundaries, Windows DPAPI, credential rotation and unpaired no-STATUS.'
} finally {
    $env:LOCALAPPDATA=$oldLocal
    Remove-Item -LiteralPath $root -Recurse -Force
}
