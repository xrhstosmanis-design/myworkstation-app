param([string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'))
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Ftext.psm1') -Force
Invoke-FtextStatus -ConfigPath $ConfigPath | ConvertTo-Json -Depth 5
