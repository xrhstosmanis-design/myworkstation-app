import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('history cleanup command contract protects disabled state, readiness authenticity and log redaction',()=>{
 const r=spawnSync('python3',[new URL('../../ops/backup/history/test_cleanup.py',import.meta.url).pathname],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stdout+r.stderr);
});
test('existing scheduler keeps eight full-backup slots and runs cleanup only after the original lifecycle worker',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'history-scheduler-'));
 try{
  mkdirSync(path.join(dir,'bin'));writeFileSync(path.join(dir,'run-jobs.sh'),readFileSync(new URL('../../ops/backup/run-jobs.sh',import.meta.url)));
  const executable=(file,text)=>writeFileSync(file,text,{mode:0o755});
  executable(path.join(dir,'run-backup.sh'),'#!/bin/sh\necho full-backup\n');
  executable(path.join(dir,'bin/date'),'#!/bin/sh\necho "$HISTORY_FIXTURE_TIME"\n');
  executable(path.join(dir,'bin/python3'),'#!/bin/sh\necho "$(basename "$1")"\ncase "$1" in */lifecycle/worker.py) exit "${HISTORY_FIXTURE_FAILURE:-0}";; esac\n');
  for(const time of ['00:00','03:00','06:00','09:00','12:00','15:00','18:00','21:00','12:05']){
   const r=spawnSync('sh',[path.join(dir,'run-jobs.sh')],{encoding:'utf8',env:{...process.env,PATH:path.join(dir,'bin')+':'+process.env.PATH,ASSISTANT_HISTORY_CLEANUP_ENABLED:'true',HISTORY_FIXTURE_TIME:time}});assert.equal(r.status,0,r.stderr);assert.deepEqual(r.stdout.trim().split('\n'),[...(time==='12:05'?[]:['full-backup']),'worker.py','cleanup.py']);
  }
  const failed=spawnSync('sh',[path.join(dir,'run-jobs.sh')],{encoding:'utf8',env:{...process.env,PATH:path.join(dir,'bin')+':'+process.env.PATH,ASSISTANT_HISTORY_CLEANUP_ENABLED:'true',HISTORY_FIXTURE_TIME:'12:05',HISTORY_FIXTURE_FAILURE:'17'}});assert.equal(failed.status,17);assert.equal(failed.stdout.trim(),'worker.py');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
