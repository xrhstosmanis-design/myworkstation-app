# Isolated functional checks: disposable Java keys, fake CLI, no network or owner credentials.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Join-Path ([IO.Path]::GetTempPath()) ('mw-signing-test-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory $root
$helper = Join-Path $PSScriptRoot 'Setup-OwnerSigning.ps1'
$repo = 'xrhstosmanis-design/myworkstation-app'
$hostExe = (Get-Process -Id $PID).Path
$mock = Join-Path $root 'fake-gh.ps1'
$oldFixture = $env:MWS_SIGNING_FIXTURE
function Assert([bool]$Condition,[string]$Name) { if (-not $Condition) { throw ('FAILED: '+$Name) } }
function Reject([scriptblock]$Action,[string]$Name) {
    $failed = $false
    try { & $Action } catch { $failed = $true }
    Assert $failed $Name
}
function Hash([byte[]]$Bytes) {
    $h = [Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() } finally { $h.Dispose() }
}
function Publish([string]$Path,[string]$Confirmation = $repo) {
    & $helper -Mode Publish -Directory $Path -ConfirmRepository $Confirmation -BackupConfirmed -GhExecutable $hostExe -GhArgumentPrefix @('-NoProfile','-File',$mock)
}
function Fixture([string]$Name) {
    $env:MWS_SIGNING_FIXTURE = Join-Path $root $Name
    $null = New-Item -ItemType Directory $env:MWS_SIGNING_FIXTURE
}
try {
    foreach ($file in @($helper,$PSCommandPath)) {
        $tokens = $null; $errors = $null
        $null = [Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
        Assert ($errors.Count -eq 0) 'PowerShell syntax'
    }
    @'
$ErrorActionPreference = 'Stop'
$f = $env:MWS_SIGNING_FIXTURE
if (-not $f) { exit 90 }
$secrets = Join-Path $f 'secrets.txt'
$pin = Join-Path $f 'pin.txt'
if ($args[0] -eq 'api') { Write-Output 'true'; exit 0 }
if ($args[0] -eq 'secret' -and $args[1] -eq 'list') {
    if (Test-Path $secrets) {
        $items = @(Get-Content $secrets | Select-Object -Unique | ForEach-Object { '{"name":"'+$_+'"}' })
        Write-Output ('['+($items -join ',')+']')
    } else { Write-Output '[]' }
    exit 0
}
if ($args[0] -eq 'variable' -and $args[1] -eq 'list') {
    if (Test-Path $pin) { Write-Output '[{"name":"MW_CHAT_CERT_SHA256"}]' } else { Write-Output '[]' }
    exit 0
}
if ($args[0] -eq 'variable' -and $args[1] -eq 'get') { Get-Content $pin; exit 0 }
if ($args[1] -eq 'set') {
    $value = [Console]::In.ReadToEnd()
    $h = [Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-','').ToLowerInvariant() } finally { $h.Dispose() }
    Add-Content (Join-Path $f 'writes.txt') ($args[2]+'|'+$hash+'|'+$value.Length)
    if ($args[0] -eq 'secret') { Add-Content $secrets $args[2] }
    else { [IO.File]::WriteAllText($pin,$value) }
    if ((Test-Path (Join-Path $f 'fail.txt')) -and $args[2] -eq 'MW_CHAT_KEY_ALIAS') { exit 7 }
    exit 0
}
exit 91
'@ | Set-Content -LiteralPath $mock -Encoding UTF8
    $backup = Join-Path $root 'private backup'
    & $helper -Mode Prepare -Directory $backup
    $state = Get-Content (Join-Path $backup 'setup-status.json') -Raw | ConvertFrom-Json
    Assert (-not $state.complete) 'Prepare is not publication'
    Assert ($state.publishedNames.Count -eq 0) 'Prepare has no published secrets'
    $acl = Get-Acl $backup
    Assert $acl.AreAccessRulesProtected 'Private directory disables inherited permissions'
    Assert ($acl.Access.Count -eq 2) 'Only owner and SYSTEM receive grants'
    $key = Join-Path $backup 'mw-chat-preview.p12'
    $keyHash = Hash ([IO.File]::ReadAllBytes($key))
    Assert ($keyHash -eq $state.keystoreSha256) 'Actual PKCS12 checksum'
    Assert ((Hash ([IO.File]::ReadAllBytes((Join-Path $backup 'certificate.der')))) -eq $state.certificateSha256) 'Actual exported certificate fingerprint'
    $oldPassword = $env:MWS_TEST_SIGNING_PASSWORD
    try {
        $env:MWS_TEST_SIGNING_PASSWORD = [IO.File]::ReadAllText((Join-Path $backup 'keystore-password.txt'))
        & keytool -list -storetype JKS -keystore $key -storepass:env MWS_TEST_SIGNING_PASSWORD *> $null
        Assert ($LASTEXITCODE -eq 0) 'Java17 JKS compatibility opens generated PKCS12 for existing Gradle signing configuration'
    } finally { $env:MWS_TEST_SIGNING_PASSWORD = $oldPassword }
    Reject { & $helper -Mode Prepare -Directory $backup } 'Never overwrite prepared key'
    Assert ((Hash ([IO.File]::ReadAllBytes($key))) -eq $keyHash) 'Protected key unchanged'

    Fixture 'normal'
    Reject { Publish $backup 'somebody/else' } 'Exact repository confirmation required'
    Assert (-not (Test-Path (Join-Path $env:MWS_SIGNING_FIXTURE 'writes.txt'))) 'Wrong confirmation causes zero writes'
    Publish $backup
    $state = Get-Content (Join-Path $backup 'setup-status.json') -Raw | ConvertFrom-Json
    Assert $state.complete 'All four secrets and pin complete'
    $writes = @(Get-Content (Join-Path $env:MWS_SIGNING_FIXTURE 'writes.txt'))
    Assert ($writes.Count -eq 5) 'Exactly four secret writes plus public pin'
    $pw = [IO.File]::ReadAllText((Join-Path $backup 'keystore-password.txt'))
    $expected = @([Convert]::ToBase64String([IO.File]::ReadAllBytes($key)),$pw,'mw-chat-preview',$pw,$state.certificateSha256)
    for ($i=0;$i -lt 5;$i++) {
        $parts = $writes[$i].Split('|')
        Assert ($parts[1] -eq (Hash ([Text.Encoding]::UTF8.GetBytes($expected[$i])))) 'Exact stdin payload, no extra newline'
        Assert ([int]$parts[2] -eq $expected[$i].Length) 'Exact stdin length'
    }
    [Array]::Clear($expected,0,$expected.Length); $pw = $null

    $second = Join-Path $root 'second backup'
    & $helper -Mode Prepare -Directory $second
    Fixture 'foreign'
    Set-Content (Join-Path $env:MWS_SIGNING_FIXTURE 'secrets.txt') 'MW_CHAT_STORE_PASSWORD'
    Reject { Publish $second } 'Unowned existing signing secret blocks publication'
    Assert (-not (Test-Path (Join-Path $env:MWS_SIGNING_FIXTURE 'writes.txt'))) 'Existing setup never overwritten'
    Fixture 'different pin'
    Set-Content (Join-Path $env:MWS_SIGNING_FIXTURE 'pin.txt') ('0'*64)
    Reject { Publish $second } 'Different pinned certificate blocks publication'
    Assert (-not (Test-Path (Join-Path $env:MWS_SIGNING_FIXTURE 'writes.txt'))) 'Mismatched pin causes zero writes'

    Fixture 'resume'
    Set-Content (Join-Path $env:MWS_SIGNING_FIXTURE 'fail.txt') 'fail once'
    $before = Hash ([IO.File]::ReadAllBytes((Join-Path $second 'mw-chat-preview.p12')))
    Reject { Publish $second } 'Ambiguous partial publication stops'
    $partial = Get-Content (Join-Path $second 'setup-status.json') -Raw | ConvertFrom-Json
    Assert (-not $partial.complete -and $partial.unknownName -eq 'MW_CHAT_KEY_ALIAS') 'Unknown attempted name recorded before write'
    Remove-Item (Join-Path $env:MWS_SIGNING_FIXTURE 'fail.txt')
    Publish $second
    $complete = Get-Content (Join-Path $second 'setup-status.json') -Raw | ConvertFrom-Json
    Assert $complete.complete 'Explicit same-backup resume completes'
    Assert ((Hash ([IO.File]::ReadAllBytes((Join-Path $second 'mw-chat-preview.p12')))) -eq $before) 'Resume never rotates key'
    [IO.File]::WriteAllText((Join-Path $second 'mw-chat-preview.p12'),'tampered')
    $prior = @(Get-Content (Join-Path $env:MWS_SIGNING_FIXTURE 'writes.txt')).Count
    Reject { Publish $second } 'Changed local key fails closed'
    Assert (@(Get-Content (Join-Path $env:MWS_SIGNING_FIXTURE 'writes.txt')).Count -eq $prior) 'Tampered key causes zero new writes'
    Write-Host 'PASS: real disposable PKCS12 preparation, certificate, ACL, exact stdin, confirmation, existing-key/pin guards, unknown stop and same-key resume. No network or owner credentials.'
} finally {
    $env:MWS_SIGNING_FIXTURE = $oldFixture
    if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
