import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, writeFileSync, symlinkSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const job=fileURLToPath(new URL("../run-backup.sh",import.meta.url));

// Execute the real shell flow. All network/database/storage commands are fakes;
// openssl signs real HMACs, checked independently by the fake receiver.
function runJob({responses={},dumpFails=false,uploadFails=false}={}) {
  const dir=mkdtempSync(join(tmpdir(),"backup-retry-test-"));
  try {
    const stub=join(dir,"command.cjs");
    writeFileSync(stub,`#!${process.execPath}
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const args=process.argv.slice(2), command=path.basename(process.argv[1]);
const log=e=>fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(e)+'\\n');
const statePath=path.join(process.env.FAKE_DIR,'state.json');
const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):{};
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state));
if(command==='date') {
  if(args[0]==='+%s') {state.clock=(state.clock||1800000000)+1;save();console.log(state.clock);}
  else if(args.includes('+%Y/%m/%d')) console.log('2026/10/12');
  else if(args.includes('+%Y%m%dT%H%M%SZ')) console.log('20261012T090019Z');
  else console.log('2026-10-12T09:00:19Z');
} else if(command==='sleep') {log({command,seconds:Number(args[0])});}
else if(command==='curl') {
  const bodyText=args[args.indexOf('--data')+1], body=JSON.parse(bodyText);
  const headers=args.filter((a,i)=>args[i-1]==='-H');
  const timestamp=headers.find(h=>h.startsWith('X-Backup-Timestamp: ')).slice(20);
  const signature=headers.find(h=>h.startsWith('X-Backup-Signature: ')).slice(20);
  const expected=crypto.createHmac('sha256',process.env.BACKUP_MONITOR_SECRET).update(timestamp+'.'+bodyText).digest('hex');
  log({command,body,timestamp,signatureValid:signature===expected});
  const count=state[body.status]||0;state[body.status]=count+1;save();
  const options=JSON.parse(process.env.FAKE_RESPONSES)[body.status]||[];
  const response=options[count]||{http:'200',code:0};
  process.stdout.write(response.http);process.exit(response.code);
} else if(command==='aws') {
  log({command,operation:args.slice(0,2).join(' '),retryMode:process.env.AWS_RETRY_MODE,maxAttempts:process.env.AWS_MAX_ATTEMPTS});
  if(args[0]==='s3'&&args[1]==='cp'&&process.env.FAKE_UPLOAD_FAIL==='1') process.exit(17);
  if(args[1]==='get-bucket-versioning') console.log('Enabled');
  if(args[1]==='head-object') console.log(Buffer.byteLength('fake archive\\n'));
} else if(command==='pg_dump') {
  log({command});
  const archive=args.find(a=>a.startsWith('--file=')).slice(7);
  fs.writeFileSync(archive,'fake archive\\n');
  if(process.env.FAKE_DUMP_FAIL==='1') process.exit(9);
} else if(command==='pg_restore') {
  if(args[0]!=='--list'||args.length!==2) process.exit(99);
  log({command}); console.log('TABLE public synthetic');
} else process.exit(98);
`,{mode:0o755});
    for(const name of ["curl","aws","pg_dump","pg_restore","sleep","date"]) symlinkSync(stub,join(dir,name));
    const result=spawnSync("/bin/sh",[job],{encoding:"utf8",timeout:10000,env:{
      ...process.env,PATH:dir+":"+process.env.PATH,
      DATABASE_URL:"postgres://synthetic.invalid/not-a-database",
      AWS_REGION:"synthetic",S3_BUCKET_NAME:"synthetic",S3_ENDPOINT_URL:"https://synthetic.invalid",
      BACKUP_MONITOR_URL:"https://synthetic.invalid/private-token",
      BACKUP_MONITOR_SECRET:"synthetic-test-secret-never-production",
      AWS_RETRY_MODE:"legacy",AWS_MAX_ATTEMPTS:"1",
      FAKE_DIR:dir,FAKE_LOG:join(dir,"events.jsonl"),FAKE_RESPONSES:JSON.stringify(responses),FAKE_DUMP_FAIL:dumpFails?"1":"0",FAKE_UPLOAD_FAIL:uploadFails?"1":"0"
    }});
    assert.equal(result.error,undefined);
    const events=readFileSync(join(dir,"events.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
    assert.ok(events.filter(e=>e.command==="curl").every(e=>e.signatureValid));
    assert.doesNotMatch(result.stdout+result.stderr,/synthetic-test-secret|private-token/);
    return {...result,events};
  } finally {rmSync(dir,{recursive:true,force:true});}
}
const http=(status)=>({http:String(status),code:status>=400?22:0});
const deliveries=(r,status)=>r.events.filter(e=>e.command==="curl"&&e.body.status===status);
function sameSignedEvent(events) {
  assert.ok(events.length>1);
  assert.ok(events.every(e=>JSON.stringify(e.body)===JSON.stringify(events[0].body)));
  assert.equal(new Set(events.map(e=>e.timestamp)).size,events.length);
}

test("interrupted dump delivers PG_DUMP_FAILED after receiver recovery; no dump retry/upload",()=>{
  const r=runJob({dumpFails:true,responses:{FAILED:[http(500),http(503),http(200)]}});
  assert.equal(r.status,9);
  const events=deliveries(r,"FAILED");sameSignedEvent(events);
  assert.equal(events.length,3);assert.equal(events[0].body.errorCode,"PG_DUMP_FAILED");
  assert.equal(r.events.filter(e=>e.command==="pg_dump").length,1);
  assert.equal(r.events.filter(e=>e.command==="pg_restore").length,0);
  assert.equal(r.events.filter(e=>e.operation==="s3 cp").length,0);
  assert.deepEqual(r.events.filter(e=>e.command==="sleep").map(e=>e.seconds),[2,4]);
});

test("success callback survives 503 and lost response with one archive/upload and unchanged evidence",()=>{
  const r=runJob({responses:{SUCCEEDED:[http(503),{http:"000",code:28},http(200)]}});
  assert.equal(r.status,0);
  const events=deliveries(r,"SUCCEEDED");sameSignedEvent(events);
  assert.equal(events.length,3);assert.equal(events[0].body.dryRunStatus,"PASSED");
  assert.equal(events[0].body.sizeBytes,13);assert.match(events[0].body.checksum,/^[a-f0-9]{64}$/);
  assert.equal(r.events.filter(e=>e.command==="pg_dump").length,1);
  assert.equal(r.events.filter(e=>e.operation==="s3 cp").length,1);
  assert.equal(deliveries(r,"FAILED").length,0);
});

test("STARTED must be acknowledged before bucket/database work",()=>{
  const r=runJob({responses:{STARTED:[{http:"000",code:7},http(200)]}});
  assert.equal(r.status,0);sameSignedEvent(deliveries(r,"STARTED"));
  assert.ok(r.events.findIndex(e=>e.command==="aws")>r.events.findLastIndex(e=>e.command==="curl"&&e.body.status==="STARTED"));
});

test("permanent signature rejection is not retried or reported successful",()=>{
  const r=runJob({responses:{SUCCEEDED:[http(401)]}});
  assert.equal(r.status,1);assert.equal(deliveries(r,"SUCCEEDED").length,1);
  assert.equal(deliveries(r,"FAILED")[0].body.errorCode,"MONITOR_SUCCESS_NOTIFY_FAILED");
  assert.equal(r.events.filter(e=>e.command==="sleep").length,0);
});

test("unavailable failure receiver stops at five deliveries, preserving original dump exit",()=>{
  const r=runJob({dumpFails:true,responses:{FAILED:Array(5).fill(http(503))}});
  assert.equal(r.status,9);assert.equal(deliveries(r,"FAILED").length,5);
  assert.deepEqual(r.events.filter(e=>e.command==="sleep").map(e=>e.seconds),[2,4,6,8]);
  assert.match(r.stderr,/delivery failed: status=FAILED http=503 curl=22 attempts=5/);
});

test("redirect cannot silently acknowledge STARTED or begin an export",()=>{
  const r=runJob({responses:{STARTED:[http(302)]}});
  assert.equal(r.status,1);assert.equal(deliveries(r,"STARTED").length,1);
  assert.equal(deliveries(r,"FAILED")[0].body.errorCode,"MONITOR_START_NOTIFY_FAILED");
  assert.equal(r.events.filter(e=>e.command==="aws"||e.command==="pg_dump").length,0);
});

test("upload alone receives bounded SDK retries; inherited settings remain on bucket and verification calls",()=>{
  const r=runJob();
  assert.equal(r.status,0);
  const uploads=r.events.filter(e=>e.operation==="s3 cp");
  assert.equal(uploads.length,1);
  assert.equal(uploads[0].retryMode,"standard");assert.equal(uploads[0].maxAttempts,"8");
  const other=r.events.filter(e=>e.command==="aws"&&e.operation!=="s3 cp");
  assert.ok(other.some(e=>e.operation==="s3api head-object"));
  assert.ok(other.every(e=>e.retryMode==="legacy"&&e.maxAttempts==="1"));
  assert.equal(r.events.filter(e=>e.command==="pg_dump").length,1);
});

test("exhausted upload reports failure with original exit and no second dump, upload or success",()=>{
  const r=runJob({uploadFails:true});
  assert.equal(r.status,17);
  assert.equal(r.events.filter(e=>e.command==="pg_dump").length,1);
  assert.equal(r.events.filter(e=>e.operation==="s3 cp").length,1);
  assert.equal(r.events.filter(e=>e.operation==="s3api head-object").length,0);
  assert.equal(deliveries(r,"SUCCEEDED").length,0);
  assert.equal(deliveries(r,"FAILED").length,1);
  assert.equal(deliveries(r,"FAILED")[0].body.errorCode,"UPLOAD_FAILED");
});
