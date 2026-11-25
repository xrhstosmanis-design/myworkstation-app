$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Cash.psm1') -Force
$oldPassive=$env:MWS_FTEXT_RIZAREIO_PASSIVE_TIMING
$oldLab=$env:MWS_FTEXT_LAB_TIMING
$env:MWS_FTEXT_RIZAREIO_PASSIVE_TIMING='1'
$env:MWS_FTEXT_LAB_TIMING=$null
function Test-TimingScope([string]$Store,[string]$Terminal,[string]$Serial,[bool]$Expected) {
 $folder=Join-Path ([IO.Path]::GetTempPath()) ('mws-passive-fixture-'+[Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $folder | Out-Null
 $job=$null
 try {
  $configPath=Join-Path $folder 'config.json'
  $c=[pscustomobject]@{companyId='fixture-company';storeId=$Store;terminalPos=$Terminal;fiscalDeviceCode='FISCAL-01';serialNumber=$Serial;workFolder=$folder;settingsHash=('a'*64);configurationId=[Guid]::NewGuid().ToString();cashEnabled=$true;cashDepartments=@([pscustomobject]@{department=4;vatRate=13;vatCode='2'})}
  $c | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $configPath -Encoding UTF8
  $scope=[pscustomobject]@{companyId=$c.companyId;storeId=$Store;terminalPos=$Terminal;fiscalDeviceCode=$c.fiscalDeviceCode}
  $id=[Guid]::NewGuid().ToString()
  $r=[pscustomobject]@{id=$id;settingsHash=$c.settingsHash;scope=$scope;serialNumber=$Serial;plan=[pscustomobject]@{schemaVersion='MWS_FTEXT_SALE_PLAN_V1';configurationId=$c.configurationId;settingsHash=$c.settingsHash;scope=$scope;total='1.25';payment=[pscustomobject]@{method='CASH';code=1;amount='1.25'};lines=@([pscustomobject]@{description='SYNTHETIC';quantity='1.000';unitPrice='1.25';discount='0.00';lineTotal='1.25';department='4';vatRate='13.00';vatCode='2'})}}
  $nl=[string][char]13+[string][char]10
  $valid=(@('0','17','42',$Serial,'20261022120000','','https://www1.aade.gr/dcl/fixture','') -join $nl)+$nl
  $job=Start-Job -ArgumentList $folder,$id,$valid -ScriptBlock {
   param($path,$requestId,$response)
   $target=Join-Path $path ('mws-cash-'+$requestId+'.txt')
   for($i=0;$i -lt 120;$i++) {
    if(Test-Path -LiteralPath $target) {
     Remove-Item -LiteralPath $target
     [IO.File]::WriteAllBytes((Join-Path $path ('mws-cash-'+$requestId+'.res')),[Text.Encoding]::GetEncoding(1253).GetBytes($response))
     return
    }
    Start-Sleep -Milliseconds 100
   }
   throw 'Synthetic driver saw no input.'
  }
  $captured=@(Invoke-FtextCashRequest -ConfigPath $configPath -Request $r -TimeoutSeconds 15 6>&1)
  Wait-Job $job | Out-Null
  Receive-Job $job -ErrorAction Stop | Out-Null
  $report=@($captured | Where-Object { $_ -is [pscustomobject] -and $_.PSObject.Properties['outcome'] })
  if($report.Count -ne 1 -or $report[0].outcome -cne 'CONFIRMED') {throw 'Synthetic receipt not confirmed.'}
  $log=$captured | Out-String -Width 4096
  $marker=('FTEXT_RIZAREIO_PASSIVE_TIMING requestId='+[regex]::Escape($id)+' publish_to_result_ms=[0-9]+ elapsed_ms=[0-9]+ eftpos_visible_ms=NOT_OBSERVED')
  if(($log -match $marker) -ne $Expected) {throw 'Passive timing scope mismatch.'}
  if(@(Get-ChildItem -LiteralPath $folder -Filter '*.txt' -File).Count -ne 0) {throw 'Synthetic receipt input left in folder.'}
  Write-Host ('PASS synthetic passive scope '+$(if($Expected){'ACCEPT'}else{'REJECT'}))
 } finally {
  if($job) {Remove-Job $job -Force -ErrorAction SilentlyContinue}
  Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
 }
}
try {
 Test-TimingScope 'cmvgtyt6d000zh7gtbsp1en3p' 'RIZAREIO-POS-01' 'DSM24014923' $true
 Test-TimingScope 'fixture-store' 'RIZAREIO-POS-01' 'DSM24014923' $false
 Test-TimingScope 'cmvgtyt6d000zh7gtbsp1en3p' 'OTHER-POS-01' 'DSM24014923' $false
 Test-TimingScope 'cmvgtyt6d000zh7gtbsp1en3p' 'RIZAREIO-POS-01' 'WRONG123' $false
 Write-Host 'PASS: all four synthetic passive timing scope scenarios.'
} finally {
 $env:MWS_FTEXT_RIZAREIO_PASSIVE_TIMING=$oldPassive
 $env:MWS_FTEXT_LAB_TIMING=$oldLab
}
