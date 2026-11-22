$ErrorActionPreference = 'Stop'
$target = Join-Path $env:LOCALAPPDATA 'MyWorkStation\DocumentScanner'
New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem -LiteralPath $PSScriptRoot | Where-Object { $_.Name -ne 'pair.bin' -and $_.Name -ne 'pair.bin.new' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'MyWorkStation Scanner.lnk'))
$shortcut.TargetPath = Join-Path $target 'MyWorkStation.DocumentScanner.exe'
$shortcut.WorkingDirectory = $target
$shortcut.WindowStyle = 7
$shortcut.Save()
Start-Process -FilePath (Join-Path $target 'MyWorkStation.DocumentScanner.exe') -WorkingDirectory $target
Write-Host 'Ο σύνδεσμος εγκαταστάθηκε για αυτόν τον χρήστη Windows και θα ανοίγει με τη σύνδεσή του. Ολοκλήρωσε μία φορά τη σύνδεση μέσα στο MyWorkStation.'
