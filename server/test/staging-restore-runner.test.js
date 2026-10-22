import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {mkdtempSync, writeFileSync, mkdirSync, readFileSync, copyFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {randomUUID, createHash} from 'node:crypto';

const script = path.resolve('../ops/staging-restore/restore.py');
const fixture = String.raw`
import contextlib, datetime as dt, hashlib, importlib.util, io, json, os, pathlib, subprocess, tempfile
from unittest import mock
spec=importlib.util.spec_from_file_location('staging_restore', SCRIPT)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
root=tempfile.TemporaryDirectory(); directory=pathlib.Path(root.name)
body=b'PGDMP'+b'synthetic archive; no database operation'
archive=directory/'fixture.dump';archive.write_bytes(body)
receipt={'schema_version':1,'target_id':m.TARGET_ID,'source_run_id':'synthetic-only',
 'object_version':'fixture-v1','archive_bytes':len(body),'archive_sha256':hashlib.sha256(body).hexdigest(),
 'restored_bytes_upper_bound':1024,'expires_at':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=1)).isoformat().replace('+00:00','Z'),
 'table_rows':{'public.Company':2,'public.Store':3}}
receipt_path=directory/'receipt.json'
def write(value): receipt_path.write_text(json.dumps(value)); return str(receipt_path)
def refuses(fn, code=None):
 try: fn()
 except m.Refusal as error:
  if code: assert str(error)==code, (str(error),code)
 else: raise AssertionError('expected refusal')
env={'RENDER':'true','RENDER_REGION':'oregon','RENDER_SERVICE_NAME':'myworkstation-staging-restore-20261022',
 'RENDER_SERVICE_ID':'srv-synthetic-staging-only','STAGING_RESTORE_PASSWORD':'fixture-secret-not-real'}
proof={'database':m.TARGET_DATABASE,'user':m.TARGET_USER,'bytes':1024,'schemas':['public'],
 'relations':0,'functions':0,'types':0,'extensions':['plpgsql']}
`;

function python(body) {
  const result = spawnSync('python3', ['-c', `SCRIPT=${JSON.stringify(script)}\n${fixture}\n${body}`], {
    encoding: 'utf8', timeout: 15000, env: {PATH: process.env.PATH, LANG: 'C.UTF-8'},
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('staging tool default validates exact private snapshot with zero subprocess/network and no secret output', () => python(String.raw`
write(receipt)
with mock.patch.dict(os.environ,{},clear=True), mock.patch.object(m.subprocess,'run',side_effect=AssertionError('no subprocess')), contextlib.redirect_stdout(io.StringIO()) as out:
 assert m.main(['--archive',str(archive),'--receipt',str(receipt_path)])==0
result=json.loads(out.getvalue());assert result['status']=='VALIDATED_ONLY'
assert 'fixture-secret' not in out.getvalue() and 'fixture.dump' not in out.getvalue()
with m.archive_snapshot(str(archive),receipt) as copy:
 archive.write_bytes(b'changed original after verification')
 assert copy.read()==body
`));

test('staging receipt rejects production, unknown/duplicate fields, booleans, unsafe table names, expired and overlarge data', () => python(String.raw`
m.read_receipt(write(receipt))
for key,value in [('target_id','dpg-d9isee7avr4c73bdglog-a'),('schema_version',True),('archive_bytes',True),
 ('archive_bytes',m.MAX_ARCHIVE+1),('restored_bytes_upper_bound',m.CAPACITY),('archive_sha256','x'*64),
 ('expires_at','2000-01-01T00:00:00Z'),('expires_at','2026-10-22T13:00:00+01:00Z'),('expires_at',(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=2)).isoformat().replace('+00:00','Z')),
 ('table_rows',{'public.Bad";DROP':1}),('table_rows',{'public.Company':True}),('table_rows',{})]:
 bad={**receipt,key:value};refuses(lambda:m.read_receipt(write(bad)))
refuses(lambda:m.read_receipt(write({**receipt,'sql':'SELECT 1'})))
receipt_path.write_text(json.dumps(receipt)[:-1]+',"target_id":"'+m.TARGET_ID+'"}')
refuses(lambda:m.read_receipt(str(receipt_path)),'RECEIPT_DUPLICATE_KEY')
receipt_path.write_text(json.dumps(receipt).replace('"schema_version": 1','"schema_version": NaN'))
refuses(lambda:m.read_receipt(str(receipt_path)),'RECEIPT_NONFINITE_NUMBER')
`));

test('staging archive refuses digest/size/format mismatch, symlinks and insufficient local scratch', () => python(String.raw`
for bad,code in [({**receipt,'archive_sha256':'0'*64},'ARCHIVE_HASH_MISMATCH'),
 ({**receipt,'archive_bytes':len(body)-1},'ARCHIVE_SIZE_MISMATCH'),
 ({**receipt,'archive_bytes':len(body)+1},'ARCHIVE_SIZE_MISMATCH')]:
 refuses(lambda:m.archive_snapshot(str(archive),bad).__enter__(),code)
archive.write_bytes(b'WRONG'+body[5:]);bad={**receipt,'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
refuses(lambda:m.archive_snapshot(str(archive),bad).__enter__(),'ARCHIVE_FORMAT')
link=directory/'linked';link.symlink_to(archive)
try: m.regular_fd(str(link),m.MAX_ARCHIVE)
except OSError: pass
else: raise AssertionError('symlink accepted')
with mock.patch.object(m.shutil,'disk_usage',return_value=type('Disk',(),{'free':0})()):
 refuses(lambda:m.archive_snapshot(str(archive),receipt).__enter__(),'LOCAL_SCRATCH_CAPACITY')
`));

test('staging execute gate refuses inherited production URLs, missing acknowledgement and wrong runner', () => python(String.raw`
m.environment_guard(env,True,m.ACK)
for bad,ack in [({**env,'DATABASE_URL':'postgres://production/secret'},m.ACK),(env,None),
 ({**env,'RENDER_SERVICE_ID':'srv-d9isenfavr4c73bdh52g'},m.ACK),
 ({**env,'RENDER_REGION':'frankfurt'},m.ACK),({**env,'RENDER_SERVICE_NAME':'myworkstation-db-backup'},m.ACK),
 ({**env,'STAGING_RESTORE_PASSWORD':''},m.ACK)]:
 refuses(lambda:m.environment_guard(bad,True,ack))
child=m.child_environment({**env,'PGHOST':'production','PGHOSTADDR':'127.0.0.1','PGOPTIONS':'evil','PSQLRC':'evil','LD_PRELOAD':'evil'},True)
assert child['PGHOST']==m.TARGET_ID and child['PGDATABASE']==m.TARGET_DATABASE and child['PGUSER']==m.TARGET_USER
assert all(key not in child for key in ['PGHOSTADDR','PSQLRC','LD_PRELOAD','DATABASE_URL'])
assert 'default_transaction_read_only=on' in child['PGOPTIONS']
`));

test('staging preflight refuses wrong live identity, populated functions/types/views/schema/extensions and declared quota overflow', () => python(String.raw`
m.assert_empty_target(proof,receipt)
for key,value in [('database','myworkstation'),('user','myworkstation'),('relations',1),('functions',1),
 ('types',1),('schemas',['public','hidden']),('extensions',['plpgsql','dblink']),('bytes',m.CAPACITY),('relations',False)]:
 refuses(lambda:m.assert_empty_target({**proof,key:value},receipt))
assert 'pg_class' in m.IDENTITY_SQL and 'pg_type' in m.IDENTITY_SQL and 'pg_proc' in m.IDENTITY_SQL
`));

test('staging execution binds same snapshot fd, atomic restore flags, exact tables/counts and no repeated command', () => python(String.raw`
calls=[]
def database_query(sql,environment):
 if sql==m.IDENTITY_SQL:return proof
 if 'json_agg' in sql:return ['public.Company','public.Store']
 return 2 if '"Company"' in sql else 3
def database_command(args,environment,fd=None):
 calls.append((args,environment,fd));assert os.read(fd,len(body))==body;return ''
with m.archive_snapshot(str(archive),receipt) as copy, mock.patch.object(m,'query',side_effect=database_query),mock.patch.object(m,'command',side_effect=database_command):
 result=m.restore(copy,receipt,env)
assert result['table_count']==2 and result['row_count']==5 and len(calls)==1
args,child,fd=calls[0]
assert args[-1]=='/proc/self/fd/'+str(fd) and args[args.index('--dbname')+1]==m.TARGET_DATABASE
assert all(flag in args for flag in ['--single-transaction','--exit-on-error','--no-owner','--no-privileges'])
assert not any(flag in args for flag in ['--clean','--create','--jobs','--host'])
assert env['STAGING_RESTORE_PASSWORD'] not in ' '.join(args)
`));

test('staging failed preflight never restores; wrong postrestore counts fail without cleanup or retry', () => python(String.raw`
with m.archive_snapshot(str(archive),receipt) as copy,mock.patch.object(m,'query',return_value={**proof,'relations':1}),mock.patch.object(m,'command') as cmd:
 refuses(lambda:m.restore(copy,receipt,env),'TARGET_NOT_EMPTY');cmd.assert_not_called()
with m.archive_snapshot(str(archive),receipt) as copy,mock.patch.object(m,'query',side_effect=[proof,['public.Company','public.Store'],999]),mock.patch.object(m,'command') as cmd:
 refuses(lambda:m.restore(copy,receipt,env),'RESTORED_ROW_COUNT_MISMATCH');assert cmd.call_count==1
with m.archive_snapshot(str(archive),receipt) as copy,mock.patch.object(m,'query',side_effect=[proof,['public.Extra']]),mock.patch.object(m,'command') as cmd:
 refuses(lambda:m.restore(copy,receipt,env),'RESTORED_TABLE_SET_MISMATCH');assert cmd.call_count==1
with m.archive_snapshot(str(archive),receipt) as copy,mock.patch.object(m,'query',return_value=proof),mock.patch.object(m,'command') as cmd:
 refuses(lambda:m.restore(copy,{**receipt,'expires_at':'2000-01-01T00:00:00Z'},env),'RECEIPT_EXPIRED');cmd.assert_not_called()
`));

test('staging command failure/timeout and CLI errors do not expose secrets, paths or subprocess stderr', () => python(String.raw`
with mock.patch.object(m.subprocess,'run',return_value=type('R',(),{'returncode':1,'stdout':b'','stderr':b'private secret URI'})()) as run:
 refuses(lambda:m.command(['psql'],{}),'DATABASE_COMMAND_FAILED');assert run.call_count==1
with mock.patch.object(m.subprocess,'run',side_effect=subprocess.TimeoutExpired('private secret',1)):
 refuses(lambda:m.command(['psql'],{}),'DATABASE_COMMAND_FAILED')
write(receipt)
with mock.patch.dict(os.environ,{'DATABASE_URL':'private-secret'},clear=True),contextlib.redirect_stderr(io.StringIO()) as err:
 assert m.main(['--archive',str(archive),'--receipt',str(receipt_path)])==1
assert json.loads(err.getvalue())=={'status':'REFUSED_OR_FAILED'} and 'private-secret' not in err.getvalue()
with contextlib.redirect_stderr(io.StringIO()) as err:
 assert m.main(['--unknown','/private/secret-path'])==1
assert 'secret-path' not in err.getvalue()
receipt_path.write_text('['*2000+'0'+']'*2000)
with mock.patch.dict(os.environ,{},clear=True),contextlib.redirect_stderr(io.StringIO()) as err:
 assert m.main(['--archive',str(archive),'--receipt',str(receipt_path)])==1
assert json.loads(err.getvalue())=={'status':'REFUSED_OR_FAILED'}
`));

test('staging image is separate and inert: only Python tool, default validation, no existing backup/app entrypoint', () => {
  const result = spawnSync('python3', ['-c', `from pathlib import Path\np=Path(${JSON.stringify(path.resolve('../ops/staging-restore/Dockerfile'))}).read_text()\nassert 'CMD ["validate"]' in p\nassert 'ENTRYPOINT ["python3", "/staging-restore/restore.py"]' in p\nassert all(s not in p for s in ['run-jobs', 'run-backup', 'npm ', 'DATABASE_URL', 'EXPOSE', 'render.yaml'])`], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

function isolatedDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    return process.env.NODE_ENV === 'test' && ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) && /test/i.test(url.pathname) &&
      [...url.searchParams.keys()].every(key => ['schema', 'connection_limit', 'pool_timeout'].includes(key));
  } catch { return false; }
}

test('native isolated PostgreSQL executes exact identity SQL read-only and its actual non-staging proof is refused',
  {skip: !isolatedDatabase() ? 'requires isolated loopback test database; mandatory in full native CI' : false}, async () => {
    const extracted = spawnSync('python3', ['-c', `import importlib.util\ns=importlib.util.spec_from_file_location('m',${JSON.stringify(script)})\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(m.IDENTITY_SQL)`], {encoding:'utf8'});
    assert.equal(extracted.status, 0, extracted.stderr);
    const {PrismaClient} = await import('@prisma/client');
    const db = new PrismaClient();
    try {
      const rows = await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.$queryRawUnsafe(extracted.stdout);
      });
      const proof = rows[0].json_build_object;
      assert.equal(typeof proof.database, 'string');
      assert.equal(typeof proof.user, 'string');
      assert.ok(Number.isSafeInteger(proof.bytes) && proof.bytes > 0);
      for (const name of ['relations','functions','types']) assert.ok(Number.isSafeInteger(proof[name]));
      assert.ok(Array.isArray(proof.schemas) && Array.isArray(proof.extensions));
      python(`refuses(lambda:m.assert_empty_target(json.loads(${JSON.stringify(JSON.stringify(proof))}),receipt),'LIVE_TARGET_MISMATCH')`);
    } finally { await db.$disconnect(); }
  });

const dockerProbe = spawnSync('docker', ['info'], {encoding:'utf8', timeout:15000});
const hasDocker = dockerProbe.status === 0;
test('actual isolated staging image builds and validates by default with network disabled and read-only mounts',
  {skip: !hasDocker && !process.env.CI ? 'local Docker absent; required in CI' : false, timeout:240000}, () => {
    assert.ok(hasDocker, 'Docker is required for this full-CI packaging check');
    const directory = mkdtempSync(path.join(tmpdir(), 'staging-image-'));
    const tag = `mws-staging-test-${randomUUID()}`;
    let built = false;
    function docker(args, timeout = 30000) {
      return spawnSync('docker', args, {encoding:'utf8', timeout, maxBuffer:2*1024*1024});
    }
    try {
      const context = path.join(directory,'context'), input = path.join(directory,'input');
      mkdirSync(path.join(context,'ops/staging-restore'), {recursive:true});mkdirSync(input);
      for (const name of ['Dockerfile','restore.py']) copyFileSync(path.resolve('../ops/staging-restore',name),path.join(context,'ops/staging-restore',name));
      const body = Buffer.from('PGDMPsynthetic offline packaging check');
      writeFileSync(path.join(input,'archive.dump'), body);
      writeFileSync(path.join(input,'receipt.json'), JSON.stringify({schema_version:1,
        target_id:'dpg-db900vks728c73b9phtg-a',source_run_id:'synthetic-package-only',object_version:'fixture-v1',
        archive_bytes:body.length,archive_sha256:createHash('sha256').update(body).digest('hex'),
        restored_bytes_upper_bound:1024,expires_at:new Date(Date.now()+3600000).toISOString(),table_rows:{'public.Company':1}}));
      const build = docker(['build','--tag',tag,'--file',path.join(context,'ops/staging-restore/Dockerfile'),context],180000);
      assert.equal(build.status,0,build.stderr);built=true;
      const run = docker(['run','--rm','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
        '--tmpfs','/tmp:rw,noexec,nosuid,size=128m','--mount',`type=bind,source=${input},target=/input,readonly`,
        tag,'--receipt','/input/receipt.json','--archive','/input/archive.dump']);
      assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).status,'VALIDATED_ONLY');
      const denied = docker(['run','--rm','--network=none','--read-only',tag]);
      assert.equal(denied.status,1);assert.deepEqual(JSON.parse(denied.stderr),{status:'REFUSED_OR_FAILED'});
      assert.ok(readFileSync(path.join(input,'archive.dump')).equals(body));
    } finally {
      if(built) docker(['image','rm',tag]);
      rmSync(directory,{recursive:true,force:true});
    }
  });
