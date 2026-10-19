import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
test('real Python worker refuses missing version/encryption, corrupt readback, failed restore and obsolete prepared operation',()=>{
 const script=path.resolve('../ops/backup/lifecycle/test_worker.py');const r=spawnSync('python3',[script],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.match(r.stderr,/Ran 7 tests/);
});
