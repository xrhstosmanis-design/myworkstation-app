param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'Cloud-Tools.psm1') -Force
$c=Get-FtextCloudConfig $ConfigPath
$code=(Read-Host 'Pairing code FT-xxxxxxxx').Trim().ToUpperInvariant()
if($code -notmatch '^FT-\d{8}$') { throw 'Invalid ftext pairing code.' }
$body=@{code=$code;expectedCompanyId=$c.companyId;expectedStoreId=$c.storeId;terminalPos=$c.terminalPos;settingsHash=$c.settingsHash} | ConvertTo-Json -Compress
$response=Invoke-RestMethod -Method Post -Uri ($c.apiBase+'/api/ftext/v1/pair') -ContentType 'application/json' -Body $body
Confirm-FtextCloudIdentity $c $response
if([string]::IsNullOrWhiteSpace([string]$response.token)) { throw 'Missing device credential.' }
$credential=New-Object Management.Automation.PSCredential($c.settingsHash,(ConvertTo-SecureString ([string]$response.token) -AsPlainText -Force))
$path=Get-FtextCredentialPath $c
New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
$temp=$path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
try { $credential | Export-Clixml -LiteralPath $temp; Move-Item -LiteralPath $temp -Destination $path -Force } finally { if(Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
Write-Host ('Paired: '+$c.storeId+' / '+$c.terminalPos)
