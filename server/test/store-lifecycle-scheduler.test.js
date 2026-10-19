import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('five-minute recovery polling retains exactly the original eight full-backup UTC slots and always exits',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mws-scheduled-jobs-'));
 try{
  const source=await readFile(new URL('../../ops/backup/run-jobs.sh',import.meta.url),'utf8');await writeFile(path.join(root,'run-jobs.sh'),source);
  for(const [name,body] of Object.entries({date:'printf "%s" "$FIXTURE_CLOCK"',python3:'printf "WORKER\\n"', 'run-backup.sh':'printf "BACKUP\\n"; exit "${FIXTURE_BACKUP_STATUS:-0}"'})){const filename=path.join(root,name);await writeFile(filename,'#!/bin/sh\n'+body+'\n');await chmod(filename,0o700)}
  const backups=[];
  for(let hour=0;hour<24;hour++)for(let minute=0;minute<60;minute+=5){const clock=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'),result=spawnSync('/bin/sh',[path.join(root,'run-jobs.sh')],{encoding:'utf8',env:{PATH:root+':/usr/bin:/bin',FIXTURE_CLOCK:clock}});assert.equal(result.status,0);assert.match(result.stdout,/WORKER\n$/);if(result.stdout.includes('BACKUP')){backups.push(clock);assert.equal(result.stdout,'BACKUP\nWORKER\n')}}
  assert.deepEqual(backups,['00:00','03:00','06:00','09:00','12:00','15:00','18:00','21:00']);
  const failed=spawnSync('/bin/sh',[path.join(root,'run-jobs.sh')],{encoding:'utf8',env:{PATH:root+':/usr/bin:/bin',FIXTURE_CLOCK:'03:00',FIXTURE_BACKUP_STATUS:'7'}});assert.equal(failed.status,7);assert.equal(failed.stdout,'BACKUP\n');
 }finally{await rm(root,{recursive:true,force:true})}
});
