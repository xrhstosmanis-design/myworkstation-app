// Contract guard for the optional FTEXT LAB timing markers.
// This does NOT replace Windows PowerShell 5.1 or physical EFTPOS LAB testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const cash=readFileSync(resolve(root,'tools/windows-ftext/Cash.psm1'),'utf8');
const start=cash.indexOf('function Invoke-FtextCashRequest {');
const end=cash.indexOf('\nfunction Complete-FtextCashReport',start);
assert.ok(start>=0&&end>start);
const fn=cash.slice(start,end);
test('LAB timing is disabled unless specifically opted in',()=>{
  assert.match(fn,/\$labTiming=\(\$env:MWS_FTEXT_LAB_TIMING -ceq '1'\)/);
  assert.match(fn,/if\(\$labTiming\) \{\$labPublishedMs=\$labClock.ElapsedMilliseconds\}/);
  assert.match(fn,/if\(\$labTiming\)\{\$labResultMs=\$labClock.ElapsedMilliseconds\}/);
});
test('result timing follows actual local command publication and complete reading',()=>{
  assert.ok(fn.indexOf('[IO.File]::Move($temp,$target)')<fn.indexOf('$labPublishedMs=$labClock.ElapsedMilliseconds'));
  assert.ok(fn.indexOf('$labResultMs=$labClock.ElapsedMilliseconds')<fn.indexOf('Write-FtextCashDurable $reportPath $report'));
});
test('timing cannot be mistaken for observed EFTPOS activation',()=>{
  assert.match(fn,/eftpos_visible_ms=NOT_OBSERVED/);
  assert.match(fn,/publish_to_result_ms=/);
});
test('timing reports only after durable fiscal result report',()=>{
  assert.ok(fn.indexOf('Write-FtextCashDurable $reportPath $report')<fn.indexOf('FTEXT_LAB_TIMING requestId='));
  assert.match(fn,/if\(\$labTiming -and \$null -ne \$labPublishedMs\) \{[\s\S]*?try \{[\s\S]*?Write-Host/);
});
test('one-shot fiscal publication and polling safety remain unchanged',()=>{
  assert.match(fn,/\[IO.FileMode\]::CreateNew/);
  assert.match(fn,/\$s.Flush\(\$true\)/);
  assert.match(fn,/Start-Sleep -Milliseconds 200/);
  assert.match(fn,/\$deadline=\[DateTime\]::UtcNow.AddSeconds\(\$TimeoutSeconds\)/);
});
