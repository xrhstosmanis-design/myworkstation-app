import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
// Fixed local --version probes only: no database, storage, shell or credentials.
export async function companyInstallationRuntimePrerequisites({env=process.env,probe=execute}={}){
 const commands=['python3','psql','pg_dump','aws'];
 const results=await Promise.all(commands.map(async command=>{
  try{const result=await probe(command,['--version'],{shell:false,timeout:1500,maxBuffer:4096,env:{PATH:env.PATH||process.env.PATH||'/usr/bin:/bin',LANG:'C'}});return String(result.stdout||'')+'\n'+String(result.stderr||'');}catch{return '';}
 }));
 const python=results[0].trim().match(/^Python (\d+)\.(\d+)(?:\.\d+)?\s*$/);
 const psql=results[1].trim().match(/^psql \(PostgreSQL\) (\d+)(?:\.\d+)*(?:\s+[^\r\n]*)?$/);
 const dump=results[2].trim().match(/^pg_dump \(PostgreSQL\) (\d+)(?:\.\d+)*(?:\s+[^\r\n]*)?$/);
 const aws=results[3].trim().match(/^aws-cli\/([12])\.\d+\.\d+(?:\s+[^\r\n]*)?$/);
 const nonempty=key=>typeof env[key]==='string'&&env[key].trim().length>0;
 const checks={pythonAvailable:!!python&&Number(python[1])===3&&Number(python[2])>=9,postgresClientAvailable:!!psql&&Number(psql[1])>=18,postgresDumpAvailable:!!dump&&Number(dump[1])>=18,postgresVersionsMatch:!!psql&&!!dump&&psql[1]===dump[1],awsCliAvailable:!!aws,databaseConfigured:nonempty('DATABASE_URL'),storageConfigured:['S3_BUCKET_NAME','AWS_REGION','S3_ENDPOINT_URL'].every(nonempty),storageCredentialsConfigured:['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY'].every(nonempty),signingConfigured:typeof env.BACKUP_MONITOR_SECRET==='string'&&env.BACKUP_MONITOR_SECRET.length>=24};
 return {...checks,ready:Object.values(checks).every(value=>value===true)};
}
