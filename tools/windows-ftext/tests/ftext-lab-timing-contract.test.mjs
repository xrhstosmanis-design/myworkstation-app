// Contract guard for FTEXT diagnostics. No physical EFTPOS or fiscal execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const cash=readFileSync(resolve(root,'tools/windows-ftext/Cash.psm1'),'utf8');
const start=cash.indexOf('function Invoke-FtextCashRequest {');
const end=cash.indexOf('\nfunction Complete-FtextCashReport',start);
assert.ok(start>=0 && end>start);
const fn=cash.slice(start,end);
test('diagnostics opt-in and production scope are explicit',()=>{
  assert.match(fn,/\$labTiming=\(\$env:MWS_FTEXT_LAB_TIMING -ceq '1'\)/);
  assert.match(fn,/\$rizareioPassive=\(\$env:MWS_FTEXT_RIZAREIO_PASSIVE_TIMING -ceq '1' -and/);
  for(const value of ['cmvgtyt6d000zh7gtbsp1en3p','RIZAREIO-POS-01','DSM24014923']){
    assert.ok(fn.includes(value),'required scope '+value);
  }
  assert.match(fn,/\$timingEnabled=\(\$labTiming -or \$rizareioPassive\)/);
  assert.match(fn,/if\(\$timingEnabled\) \{\$labPublishedMs=\$labClock.ElapsedMilliseconds\}/);
  assert.match(fn,/if\(\$timingEnabled\)\{\$labResultMs=\$labClock.ElapsedMilliseconds\}/);
});
test('result timing follows local command publication and complete reading',()=>{
  assert.ok(fn.indexOf('[IO.File]::Move($temp,$target)')<fn.indexOf('$labPublishedMs=$labClock.ElapsedMilliseconds'));
  assert.ok(fn.indexOf('$labResultMs=$labClock.ElapsedMilliseconds')<fn.indexOf('Write-FtextCashDurable $reportPath $report'));
});
test('timing is not physical EFTPOS activation',()=>{
  assert.match(fn,/eftpos_visible_ms=NOT_OBSERVED/);
  assert.match(fn,/publish_to_result_ms=/);
  assert.match(fn,/\$prefix=if\(\$rizareioPassive\) \{'FTEXT_RIZAREIO_PASSIVE_TIMING'\} else \{'FTEXT_LAB_TIMING'\}/);
});
test('diagnostic output occurs only after durable report',()=>{
  assert.ok(fn.indexOf('Write-FtextCashDurable $reportPath $report')<fn.indexOf('Write-Host ($prefix+'));
  assert.match(fn,/if\(\$timingEnabled -and \$null -ne \$labPublishedMs\) \{[\s\S]*?try \{[\s\S]*?Write-Host/);
});
test('one-shot fiscal publication and polling safety unchanged',()=>{
  assert.match(fn,/\[IO.FileMode\]::CreateNew/);
  assert.match(fn,/\$s.Flush\(\$true\)/);
  assert.match(fn,/Start-Sleep -Milliseconds 200/);
  assert.match(fn,/\$deadline=\[DateTime\]::UtcNow.AddSeconds\(\$TimeoutSeconds\)/);
});
