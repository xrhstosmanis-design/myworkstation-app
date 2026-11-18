import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {companyInstallationBackupDiagnostic} from '../src/services/backoffice-company-installation.js';
const root=new URL('../../',import.meta.url),canary='PRIVATE_PERSON_SQL_EMAIL_password_token_CANARY';
const cases=[
 ['UNSUPPORTED_SETTING','ERROR: unrecognized configuration parameter "secret_setting"'],
 ['ARCHIVE_VERSION','pg_restore: error: unsupported version (1.17) in file header'],
 ['PERMISSION','ERROR: permission denied for table confidential'],
 ['MISSING_ROLE','ERROR: role "secret_role" does not exist'],
 ['MISSING_TYPE','ERROR: type "secret_type" does not exist'],
 ['COLLATION','ERROR: collation "secret_locale" does not exist'],
 ['DUPLICATE_RELATION','ERROR: relation "secret_table" already exists'],
 ['ENCODING','ERROR: invalid byte sequence for encoding UTF8'],
 ['MEMORY','ERROR: out of memory'],
 ['PRIVATE_CONNECTION','connection to server on socket "/private/location" failed: Connection refused'],
 ['DUPLICATE_SCHEMA','ERROR: schema "secret_schema" already exists'],
 ['MISSING_SCHEMA','ERROR: schema "secret_schema" does not exist'],
 ['MISSING_FUNCTION','ERROR: function secret_function(integer) does not exist'],
 ['MISSING_EXTENSION','ERROR: could not open extension control file "/private/secret_extension.control"'],
 ['MISSING_RELATION','ERROR: relation "secret_relation" does not exist'],
 ['MISSING_COLUMN','ERROR: column "secret_column" of relation "secret_relation" does not exist'],
 ['MISSING_OPERATOR','ERROR: operator does not exist: secret_type + secret_type'],
 ['CONSTRAINT','ERROR: duplicate key value violates unique constraint "secret_constraint"'],
 ['SQL_SYNTAX','ERROR: syntax error at or near "PRIVATE_QUERY"'],
 ['ARCHIVE_IO','pg_restore: input file does not appear to be a valid archive'],
 ['FILE_IO','pg_restore: could not open input file "/private/archive.dump": No such file or directory'],
 ['RESOURCE','pg_restore: could not write output: No space left on device'],
 ['UNKNOWN','ERROR: unknown private failure']
];

test('private native command failures expose only fixed category, exit code and command basename through producer JSON',()=>{
 const script=String.raw`import sys,json,types,importlib.util,pathlib
from unittest.mock import patch
sys.path.insert(0,'ops/backup/lifecycle')
import verify_restore
spec=importlib.util.spec_from_file_location('private_diag_producer','ops/backup/lifecycle/company-installation-backup.py');producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
values=json.load(sys.stdin);messages=[]
pg=object.__new__(verify_restore.PrivatePostgres);pg.env={};pg.user=None
for category,diagnostic in values['cases']:
 raw=(diagnostic+'\nINSERT INTO Customer VALUES ('+values['canary']+');\nuser@private.invalid password=secret-token').encode()
 result=types.SimpleNamespace(returncode=7,stderr=raw)
 with patch.object(verify_restore.subprocess,'run',return_value=result):
  try: pg.run(['/private/'+values['canary']+'/pg_restore'])
  except verify_restore.PrivatePostgresCommandError as error:
   expected='Private PostgreSQL command failed: pg_restore [exit=7, category='+category+']';assert str(error)==expected
   payload=producer.safe_failure_payload(error)
   assert payload=={'state':'REFUSED','error':'PrivatePostgresCommandError','code':'PRIVATE_PG_'+category,'command':'pg_restore','exitCode':7}
   assert values['canary'] not in str(error)+json.dumps(payload)
   assert 'user@private.invalid' not in str(error)+json.dumps(payload)
   messages.append(payload)
  else: raise AssertionError('Failed private command was admitted')
success=types.SimpleNamespace(returncode=0,stderr=values['canary'].encode())
with patch.object(verify_restore.subprocess,'run',return_value=success): assert pg.run(['pg_dump']) is success
malformed=verify_restore.PrivatePostgresCommandError(values['canary'],values['canary'],values['canary']);assert values['canary'] not in str(malformed)+json.dumps(producer.safe_failure_payload(malformed))
malformed.command=values['canary'];malformed.category=values['canary'];malformed.exit_code=values['canary'];assert values['canary'] not in json.dumps(producer.safe_failure_payload(malformed))
assert producer.safe_failure_payload(ValueError(values['canary']))=={'state':'REFUSED','error':'ValueError'}
print(json.dumps(messages))`;
 const result=spawnSync('python3',['-c',script],{cwd:root,encoding:'utf8',input:JSON.stringify({cases,canary}),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},timeout:10000,maxBuffer:16000});
 assert.equal(result.status,0,(result.stderr||result.stdout).slice(-8000));assert.equal(JSON.parse(result.stdout).length,cases.length);assert.doesNotMatch(result.stdout,/PRIVATE_PERSON|INSERT INTO|private\.invalid|secret-token/);
});

test('SQLSTATE diagnostics inspect only fresh private log bytes and retain no unrecognized code or stale error',()=>{
 const script=String.raw`import sys,json,types,importlib.util,pathlib,tempfile
from unittest.mock import patch
sys.path.insert(0,'ops/backup/lifecycle')
import verify_restore
spec=importlib.util.spec_from_file_location('diag_producer','ops/backup/lifecycle/company-installation-backup.py');producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
canary=json.load(sys.stdin)['canary'];payloads=[]
prefix='2026-11-18 12:00:00 UTC [123] ERROR:  '
def line(code): return (prefix+code+': '+canary+'\nSTATEMENT: INSERT INTO Customer VALUES (user@private.invalid,password=secret-token);\n').encode()
with tempfile.TemporaryDirectory() as directory:
 pg=object.__new__(verify_restore.PrivatePostgres);pg.env={};pg.user=None;pg.root=pathlib.Path(directory)
 logfile=pg.root/'postgres.log'
 result=types.SimpleNamespace(returncode=1,stderr=b'unknown client failure')
 def command(code):
  def run(*args,**options):
   if code is not None:
    with open(logfile,'ab') as stream: stream.write(line(code))
   return result
  return run
 for code,category in verify_restore.PRIVATE_SQLSTATE_CATEGORIES.items():
  logfile.write_bytes(line('42P07'));logfile.chmod(0o600)
  with patch.object(verify_restore.subprocess,'run',side_effect=command(code)):
   try: pg.run(['/private/'+canary+'/pg_restore'])
   except verify_restore.PrivatePostgresCommandError as error:
    assert error.category==category;payloads.append(producer.safe_failure_payload(error));assert canary not in str(error)
   else: raise AssertionError('Unknown private failure was admitted')
 for code in [None,'SECRT']:
  logfile.write_bytes(line('42P07'))
  with patch.object(verify_restore.subprocess,'run',side_effect=command(code)):
   try: pg.run(['pg_restore'])
   except verify_restore.PrivatePostgresCommandError as error: assert error.category=='UNKNOWN';assert 'SECRT' not in str(error);assert '42P07' not in str(error)
   else: raise AssertionError('Unknown failure was admitted')
 logfile.write_bytes(line('42P06')+line('SECRT'));assert verify_restore.private_server_log_category(logfile)=='UNKNOWN'
 assert verify_restore.private_command_failure_category(b'warning '*30000+b'\nERROR: schema "'+canary.encode()+b'" already exists')=='DUPLICATE_SCHEMA'
 pg.data=pg.root/'pgdata';pg.socket=pg.root/'socket';calls=[]
 with patch.object(pg,'run',side_effect=lambda args,**options:calls.append(args)): assert pg.__enter__() is pg
 assert '--auth-host=reject' in calls[0]
 startup=calls[1][calls[1].index('-o')+1];assert '-c log_error_verbosity=verbose' in startup;assert "-h ''" in startup
print(json.dumps(payloads))`;
 const result=spawnSync('python3',['-c',script],{cwd:root,encoding:'utf8',input:JSON.stringify({canary}),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},timeout:10000,maxBuffer:16000});
 assert.equal(result.status,0,(result.stderr||result.stdout).slice(-8000));const payloads=JSON.parse(result.stdout);assert.equal(payloads.length,24);
 for(const payload of payloads)assert.equal(companyInstallationBackupDiagnostic(JSON.stringify(payload)),payload.code);
 assert.doesNotMatch(result.stdout,/PRIVATE_PERSON|INSERT INTO|private\.invalid|secret-token|SECRT/);
 assert.equal(companyInstallationBackupDiagnostic(JSON.stringify({state:'REFUSED',error:'PrivatePostgresCommandError',code:'PRIVATE_PG_SQLSTATE_SECRT_UNKNOWN',command:'pg_restore',exitCode:1})),null);
});

test('installer accepts only strict known diagnostic JSON and never reflects arbitrary stderr or extra data',()=>{
 for(const[category]of cases){const payload={state:'REFUSED',error:'PrivatePostgresCommandError',code:'PRIVATE_PG_'+category,command:'pg_restore',exitCode:1};assert.equal(companyInstallationBackupDiagnostic(JSON.stringify(payload)),payload.code)}
 const valid={state:'REFUSED',error:'PrivatePostgresCommandError',code:'PRIVATE_PG_UNKNOWN',command:'pg_restore',exitCode:1};
 for(const payload of [{...valid,state:'PASSED'},{...valid,error:'ValueError'},{...valid,code:'PRIVATE_PG_'+canary},{...valid,command:'/private/'+canary+'/pg_restore'},{...valid,exitCode:'1'},{...valid,exitCode:true},{...valid,exitCode:256},{...valid,stderr:canary},null,[],canary])assert.equal(companyInstallationBackupDiagnostic(JSON.stringify(payload)),null);
 for(const raw of [canary,JSON.stringify(valid)+'\n'+canary,'x'.repeat(4097),undefined,Buffer.from(canary)])assert.equal(companyInstallationBackupDiagnostic(raw),null);
});
