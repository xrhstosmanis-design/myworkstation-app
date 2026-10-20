# Windows PowerShell 5.1 / PowerShell 7. No owner secrets are returned or logged.
[CmdletBinding()]
param(
    [ValidateSet('Prepare','Publish')][string]$Mode = 'Prepare',
    [string]$Directory,
    [string]$ConfirmRepository,
    [switch]$BackupConfirmed,
    [string]$GhExecutable = 'gh',
    [string[]]$GhArgumentPrefix = @()
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = 'xrhstosmanis-design/myworkstation-app'
$alias = 'mw-chat-preview'
$names = @('MW_CHAT_KEYSTORE_B64','MW_CHAT_STORE_PASSWORD','MW_CHAT_KEY_ALIAS','MW_CHAT_KEY_PASSWORD')
$certName = 'MW_CHAT_CERT_SHA256'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Invoke-PrivateProcess {
    param([string]$Executable,[string[]]$Arguments,[string]$InputText = '',[hashtable]$Environment = @{})
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    # Every argument is a fixed public flag, name or Windows path. Private values use stdin/environment.
    $quoted = foreach ($arg in $Arguments) {
        if ($arg.Contains('"') -or $arg.EndsWith('\')) { throw 'Unsupported command argument.' }
        '"' + $arg + '"'
    }
    $info.Arguments = $quoted -join ' '
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.EnvironmentVariables['GH_HOST'] = 'github.com'
    foreach ($key in $Environment.Keys) { $info.EnvironmentVariables[$key] = $Environment[$key] }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { throw 'Could not start required tool.' }
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Write($InputText)
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(120000)) {
            $process.Kill()
            throw 'Tool timed out. Keep the existing backup; do not generate another key.'
        }
        $output = $outputTask.GetAwaiter().GetResult()
        $null = $errorTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw 'Tool failed. Private diagnostic output was suppressed. Keep the existing backup for resume.' }
        return $output
    } finally { $process.Dispose() }
}
function Invoke-Gh {
    param([string[]]$Arguments,[string]$InputText = '')
    Invoke-PrivateProcess $gh.Source (@($GhArgumentPrefix) + $Arguments) $InputText
}
function Write-State { [IO.File]::WriteAllText((Join-Path $Directory 'setup-status.json'), ($script:state | ConvertTo-Json -Depth 5), $utf8) }
function Get-HexHash([byte[]]$Bytes) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() }
    finally { $hash.Dispose() }
}
function Set-PrivateDirectory([string]$Path) {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($principal in @($sid, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

if ($env:OS -ne 'Windows_NT') { throw 'Run this helper on the owner Windows PC.' }
$keytool = Get-Command keytool -CommandType Application -ErrorAction SilentlyContinue
if (-not $keytool -and $env:JAVA_HOME) {
    $candidate = Join-Path $env:JAVA_HOME 'bin/keytool.exe'
    if (Test-Path -LiteralPath $candidate) { $keytool = Get-Command $candidate }
}
if (-not $keytool) { throw 'Java keytool is required. Install a Java 17 JDK from https://adoptium.net/ and reopen PowerShell.' }
if (-not $Directory) {
    if ($Mode -eq 'Publish') { throw 'Publish requires the exact existing -Directory printed by Prepare.' }
    $Directory = Join-Path $env:LOCALAPPDATA ('MyWorkStation\AndroidSigning\stable-preview-' + [Guid]::NewGuid().ToString('N'))
}
$Directory = [IO.Path]::GetFullPath($Directory)
$keystore = Join-Path $Directory 'mw-chat-preview.p12'
$passwordFile = Join-Path $Directory 'keystore-password.txt'
$certificate = Join-Path $Directory 'certificate.der'
if ($Mode -eq 'Prepare') {
    if (Test-Path -LiteralPath $Directory) { throw 'Directory already exists. Do not replace an existing key. Use Publish with its existing directory.' }
    $null = New-Item -ItemType Directory -Path $Directory
    Set-PrivateDirectory $Directory
    $random = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($random); $password = [Convert]::ToBase64String($random) }
    finally { $rng.Dispose(); [Array]::Clear($random,0,$random.Length) }
    [IO.File]::WriteAllText($passwordFile,$password,$utf8)
    try {
        $null = Invoke-PrivateProcess $keytool.Source @('-genkeypair','-alias',$alias,'-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA','-validity','10000','-dname','CN=MyWorkStation Android Chat Preview,O=MyWorkStation,C=GR','-storetype','PKCS12','-keystore',$keystore,'-storepass:env','MWS_SIGNING_PASSWORD','-keypass:env','MWS_SIGNING_PASSWORD','-noprompt') '' @{MWS_SIGNING_PASSWORD=$password}
        $null = Invoke-PrivateProcess $keytool.Source @('-exportcert','-alias',$alias,'-keystore',$keystore,'-storetype','PKCS12','-storepass:env','MWS_SIGNING_PASSWORD','-file',$certificate) '' @{MWS_SIGNING_PASSWORD=$password}
        $script:state = [ordered]@{repository=$repo;alias=$alias;createdUtc=[DateTime]::UtcNow.ToString('o');certificateSha256=(Get-HexHash ([IO.File]::ReadAllBytes($certificate)));keystoreSha256=(Get-HexHash ([IO.File]::ReadAllBytes($keystore)));publishedNames=@();unknownName='';complete=$false}
        Write-State
    } finally { $password = $null }
    Write-Host ('Private signing backup prepared in: ' + $Directory)
    Write-Host 'Copy this entire folder to an owner-controlled encrypted backup before Publish. It contains the private key AND its password. Do not send it in chat or commit/upload it as an artifact.'
    Write-Host 'Prepare performed no GitHub login, secret upload, APK build or public release.'
    return
}

$statePath = Join-Path $Directory 'setup-status.json'
if (-not (Test-Path -LiteralPath $statePath)) { throw 'Existing prepared backup is missing. No network changes made.' }
$script:state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.repository -ne $repo -or $state.alias -ne $alias -or (Get-HexHash ([IO.File]::ReadAllBytes($keystore))) -ne $state.keystoreSha256) { throw 'Backup identity mismatch. No network changes made.' }
Set-PrivateDirectory $Directory
$password = [IO.File]::ReadAllText($passwordFile)
try {
    # Re-export proves that the protected password opens this same key; do not trust a stale public DER file.
    $null = Invoke-PrivateProcess $keytool.Source @('-exportcert','-alias',$alias,'-keystore',$keystore,'-storetype','PKCS12','-storepass:env','MWS_SIGNING_PASSWORD','-file',$certificate) '' @{MWS_SIGNING_PASSWORD=$password}
    if ((Get-HexHash ([IO.File]::ReadAllBytes($certificate))) -ne $state.certificateSha256) { throw 'Signing certificate mismatch. No network changes made.' }
    $gh = Get-Command $GhExecutable -CommandType Application -ErrorAction SilentlyContinue
    if (-not $gh) { throw 'Install GitHub CLI from https://cli.github.com/ then run: gh auth login --hostname github.com --web . Keep this existing backup.' }
    $admin = (Invoke-Gh @('api','--hostname','github.com',('repos/'+$repo),'--jq','.permissions.admin')).Trim()
    if ($admin -ne 'true') { throw 'GitHub CLI needs repository administrator access. Run gh auth login --hostname github.com --web; do not create a replacement key.' }
    $existing = @((Invoke-Gh @('secret','list','--repo',$repo,'--json','name','--jq','.[].name')) -split '\r?\n' | Where-Object { $_.Length -gt 0 })
    foreach ($existingName in $existing) {
        if ($names -contains $existingName -and @($state.publishedNames) -notcontains $existingName -and $state.unknownName -ne $existingName) { throw 'Existing signing secret is not owned by this local setup. Stopped without replacing it.' }
    }
    $variables = @((Invoke-Gh @('variable','list','--repo',$repo,'--json','name','--jq','.[].name')) -split '\r?\n' | Where-Object { $_.Length -gt 0 })
    if ($variables -contains $certName) {
        $pinned = (Invoke-Gh @('variable','get',$certName,'--repo',$repo)).Trim()
        if ($pinned -ne $state.certificateSha256) { throw 'An existing different signing certificate is pinned. No replacement allowed.' }
    }
    if (-not $ConfirmRepository) { $ConfirmRepository = Read-Host ('Type the exact target repository to publish signing material: '+$repo) }
    if ($ConfirmRepository -cne $repo) { throw 'Repository confirmation did not match. No secret upload.' }
    if (-not $BackupConfirmed) {
        if ((Read-Host 'After keeping an encrypted private backup, type BACKUP to confirm') -cne 'BACKUP') { throw 'Backup confirmation missing. No secret upload.' }
    }
    Write-Host 'Publishing only the four named Android signing secrets and the public certificate pin to the confirmed repository. Local key stays in its backup folder.'
    $values = @([Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)),$password,$alias,$password)
    try {
        for ($i=0;$i -lt $names.Count;$i++) {
            $state.unknownName = $names[$i]; Write-State
            $null = Invoke-Gh @('secret','set',$names[$i],'--repo',$repo) $values[$i]
            $state.publishedNames = @(@($state.publishedNames) + $names[$i] | Select-Object -Unique)
            $state.unknownName = ''; Write-State
        }
        $state.unknownName = $certName; Write-State
        $null = Invoke-Gh @('variable','set',$certName,'--repo',$repo) $state.certificateSha256
        $state.unknownName = ''; $state.complete = $true; Write-State
    } finally { if ($values) { [Array]::Clear($values,0,$values.Length) } }
    Write-Host 'Signing configuration uploaded. This is not yet a signed APK or a physical update PASS. Retain the same key for every future update.'
} finally { $password = $null }
