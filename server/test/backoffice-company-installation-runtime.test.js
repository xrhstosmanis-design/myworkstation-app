import test from 'node:test';
import assert from 'node:assert/strict';
import {companyInstallationRuntimePrerequisites} from '../src/services/backoffice-company-installation-runtime.js';
const env={PATH:'/reviewed/bin',DATABASE_URL:'private-database',S3_BUCKET_NAME:'private-bucket',AWS_REGION:'region',S3_ENDPOINT_URL:'private-endpoint',AWS_ACCESS_KEY_ID:'private-access',AWS_SECRET_ACCESS_KEY:'private-secret',BACKUP_MONITOR_SECRET:'private-signing-secret-long-enough'};
const versions={python3:'Python 3.12.9',psql:'psql (PostgreSQL) 18.1',pg_dump:'pg_dump (PostgreSQL) 18.1',aws:'aws-cli/2.31.0 Python/3.12.9 Linux/6 exe/x86_64'};
function probe(overrides={},calls=[]){return async(command,args,options)=>{calls.push({command,args,options});if(overrides[command] instanceof Error)throw overrides[command];return{stdout:overrides[command]??versions[command],stderr:''};};}
test('Company consume runtime probes only fixed version commands without passing secrets or touching DB/storage',async()=>{
 const calls=[],result=await companyInstallationRuntimePrerequisites({env,probe:probe({},calls)});
 assert.equal(result.ready,true);assert.ok(Object.values(result).every(v=>typeof v==='boolean'));
 assert.deepEqual(calls.map(c=>c.command),['python3','psql','pg_dump','aws']);
 for(const c of calls){assert.deepEqual(c.args,['--version']);assert.equal(c.options.shell,false);assert.equal(c.options.timeout,1500);assert.equal(c.options.maxBuffer,4096);assert.deepEqual(c.options.env,{PATH:'/reviewed/bin',LANG:'C'});}
 assert.equal(JSON.stringify(result).includes('private'),false);
});
test('missing, unknown, old or mismatched version tools refuse readiness without exposing diagnostics',async()=>{
 for(const overrides of [{python3:Error('private failure')},{python3:'Python 2.7.18'},{python3:'Python 3.8.20'},{python3:'unknown'},{psql:'psql (PostgreSQL) 17.9'},{pg_dump:'pg_dump (PostgreSQL) 17.9'},{pg_dump:'pg_dump (PostgreSQL) 19.0'},{aws:'not aws'},{aws:Error('private credentials')}]){
  const result=await companyInstallationRuntimePrerequisites({env,probe:probe(overrides)});assert.equal(result.ready,false);assert.ok(Object.values(result).every(v=>typeof v==='boolean'));assert.equal(JSON.stringify(result).includes('private'),false);
 }
});
test('each required app consumer configuration is checked for presence without value disclosure',async()=>{
 for(const key of ['DATABASE_URL','S3_BUCKET_NAME','AWS_REGION','S3_ENDPOINT_URL','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','BACKUP_MONITOR_SECRET']){
  const result=await companyInstallationRuntimePrerequisites({env:{...env,[key]:''},probe:probe()});assert.equal(result.ready,false,key);
 }
 assert.equal((await companyInstallationRuntimePrerequisites({env:{...env,BACKUP_MONITOR_SECRET:'short'},probe:probe()})).ready,false);
});
