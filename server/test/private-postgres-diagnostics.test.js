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

test('installer accepts only strict known diagnostic JSON and never reflects arbitrary stderr or extra data',()=>{
 for(const[category]of cases){const payload={state:'REFUSED',error:'PrivatePostgresCommandError',code:'PRIVATE_PG_'+category,command:'pg_restore',exitCode:1};assert.equal(companyInstallationBackupDiagnostic(JSON.stringify(payload)),payload.code)}
 const valid={state:'REFUSED',error:'PrivatePostgresCommandError',code:'PRIVATE_PG_UNKNOWN',command:'pg_restore',exitCode:1};
 for(const payload of [{...valid,state:'PASSED'},{...valid,error:'ValueError'},{...valid,code:'PRIVATE_PG_'+canary},{...valid,command:'/private/'+canary+'/pg_restore'},{...valid,exitCode:'1'},{...valid,exitCode:true},{...valid,exitCode:256},{...valid,stderr:canary},null,[],canary])assert.equal(companyInstallationBackupDiagnostic(JSON.stringify(payload)),null);
 for(const raw of [canary,JSON.stringify(valid)+'\n'+canary,'x'.repeat(4097),undefined,Buffer.from(canary)])assert.equal(companyInstallationBackupDiagnostic(raw),null);
});
