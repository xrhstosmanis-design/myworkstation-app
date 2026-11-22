#!/usr/bin/env node
// Controlled production maintenance only. No execution occurs on import or dry run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ACTIVATION_SERVICE_ID,activationInstant,readActivation} from '../../server/src/services/automatic-report-activation.js';

export const TARGET=Object.freeze({serviceId:ACTIVATION_SERVICE_ID,postgresId:'dpg-d9isee7avr4c73bdglog-a',workspaceId:'tea-d9ie26vaqgkc739uudqg',databaseName:'myworkstation',databaseUser:'myworkstation'});
export const ACK=`RESTORE ${TARGET.postgresId} WITH ${TARGET.serviceId} SUSPENDED`;
const CONTROL='AUTOMATIC_REPORT_ACTIVATION_CONTROL';
const refuse=()=>{throw new Error('CONTROLLED_RESTORE_REFUSED');};
function requireThat(value){if(!value)refuse();}
const activeDeploy=new Set(['created','build_in_progress','pre_deploy_in_progress','update_in_progress','queued','pending']);

export function createRenderClient({token,fetchImpl=fetch,base='https://api.render.com/v1'}){
  requireThat(typeof token==='string'&&token.length>0);
  // A nonproduction base is injectable for isolated tests, never a CLI option.
  return async function api(method,resource,body){
    try{
      const response=await fetchImpl(`${base}${resource}`,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      requireThat(response.ok);
      const text=await response.text();requireThat(text.length<=1048576);
      return text?JSON.parse(text):null;
    }catch{refuse();}
  };
}

export async function runChild(command,args,{env,fd,timeout=3600000}={}){
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{env,stdio:[fd??'ignore','pipe','ignore']});
    let stdout='',failed=false;
    const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},timeout);
    child.stdout.on('data',chunk=>{if(stdout.length+chunk.length>65536){failed=true;child.kill('SIGKILL');}else stdout+=chunk.toString('utf8');});
    child.once('error',()=>{clearTimeout(timer);reject(new Error('CONTROLLED_RESTORE_REFUSED'));});
    child.once('close',code=>{clearTimeout(timer);if(failed||code!==0)reject(new Error('CONTROLLED_RESTORE_REFUSED'));else resolve(stdout);});
  });
}

function snapshotArchive(file,receipt){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mws-controlled-restore-'));fs.chmodSync(dir,0o700);
  let source,fd;
  try{
    source=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    const stat=fs.fstatSync(source);requireThat(stat.isFile()&&stat.size===receipt.archiveBytes&&stat.size>0&&stat.size<=1024**3);
    fd=fs.openSync(path.join(dir,'archive'),fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
    fs.unlinkSync(path.join(dir,'archive'));
    const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0,count;
    while((count=fs.readSync(source,buffer,0,buffer.length,null))>0){offset+=count;requireThat(offset<=receipt.archiveBytes);hash.update(buffer.subarray(0,count));let written=0;while(written<count)written+=fs.writeSync(fd,buffer,written,count-written,offset-count+written);}
    requireThat(offset===receipt.archiveBytes&&hash.digest('hex')===receipt.archiveSha256);
    fs.closeSync(source);source=undefined;
    return {fd,close(){fs.closeSync(fd);fs.rmdirSync(dir);}};
  }catch{if(source!==undefined)fs.closeSync(source);if(fd!==undefined)fs.closeSync(fd);fs.rmSync(dir,{recursive:true,force:true});refuse();}
}
function validateReceipt(receipt,now){
  requireThat(receipt&&Object.keys(receipt).sort().join(',')===['archiveBytes','archiveSha256','expiresAt','postgresId','serviceId','sourceRevision','v'].sort().join(',')&&receipt.v===1&&receipt.postgresId===TARGET.postgresId&&receipt.serviceId===TARGET.serviceId&&/^[a-f0-9]{40}$/.test(receipt.sourceRevision)&&/^[a-f0-9]{64}$/.test(receipt.archiveSha256)&&Number.isSafeInteger(receipt.archiveBytes)&&receipt.archiveBytes>0&&receipt.archiveBytes<=1024**3&&activationInstant(receipt.expiresAt)&&receipt.expiresAt>now);
}
function controlValue(issuedAt,notBefore){
  requireThat(activationInstant(issuedAt)&&activationInstant(notBefore)&&notBefore>issuedAt);
  return JSON.stringify({v:1,serviceId:TARGET.serviceId,epoch:randomUUID(),issuedAt,notBefore,enabled:false});
}
async function exactControl(api,value){
  const result=await api('GET',`/services/${TARGET.serviceId}/env-vars/${CONTROL}`);
  requireThat(result?.value===value&&readActivation({RENDER_SERVICE_ID:TARGET.serviceId,[CONTROL]:result.value}).valid);
}
async function stopped(api,value){
  await exactControl(api,value);
  const service=await api('GET',`/services/${TARGET.serviceId}`);
  requireThat(service?.id===TARGET.serviceId&&service.ownerId===TARGET.workspaceId&&service.suspended==='suspended');
  const instances=await api('GET',`/services/${TARGET.serviceId}/instances`);
  requireThat(Array.isArray(instances)&&instances.length===0);
  const deploys=await api('GET',`/services/${TARGET.serviceId}/deploys?limit=100`);
  requireThat(Array.isArray(deploys)&&deploys.every(item=>{const status=item?.deploy?.status;return typeof status==='string'&&!activeDeploy.has(status)&&['live','deactivated','build_failed','update_failed','pre_deploy_failed','canceled'].includes(status);}));
}
function connectionEnvironment(connection,metadata){
  requireThat(metadata?.id===TARGET.postgresId&&metadata.owner?.id===TARGET.workspaceId&&metadata.databaseName===TARGET.databaseName&&metadata.databaseUser===TARGET.databaseUser&&metadata.version==='18'&&metadata.status==='available');
  let url;try{url=new URL(connection.externalConnectionString);}catch{refuse();}
  requireThat(['postgres:','postgresql:'].includes(url.protocol)&&decodeURIComponent(url.username)===TARGET.databaseUser&&decodeURIComponent(url.pathname.slice(1))===TARGET.databaseName&&url.hostname===`${TARGET.postgresId}.oregon-postgres.render.com`&&(!url.port||url.port==='5432')&&!url.hash&&[...url.searchParams].every(([key,value])=>key==='sslmode'&&['require','verify-full'].includes(value))&&url.searchParams.size<=1&&url.password);
  return {PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C',PGHOST:url.hostname,PGPORT:'5432',PGUSER:TARGET.databaseUser,PGDATABASE:TARGET.databaseName,PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'verify-full',PGCONNECT_TIMEOUT:'15',PGAPPNAME:'mws-controlled-restore'};
}

export async function controlledRestore({archive,receipt,notBefore,execute=false,acknowledge,api,child=runChild,clock=()=>new Date().toISOString()}){
  const now=clock();requireThat(activationInstant(now));validateReceipt(receipt,now);
  const initial=controlValue(now,notBefore),snapshot=snapshotArchive(archive,receipt);
  try{
    if(!execute)return Object.freeze({mode:'DRY_RUN',postgresId:TARGET.postgresId,serviceId:TARGET.serviceId,archiveSha256:receipt.archiveSha256,mutations:0});
    requireThat(acknowledge===ACK&&typeof api==='function');
    const metadata=await api('GET',`/postgres/${TARGET.postgresId}`);
    const connection=await api('GET',`/postgres/${TARGET.postgresId}/connection-info`);
    const env=connectionEnvironment(connection,metadata);
    const service=await api('GET',`/services/${TARGET.serviceId}`);
    requireThat(service?.id===TARGET.serviceId&&service.ownerId===TARGET.workspaceId&&service.type==='web_service'&&service.autoDeploy==='no');
    await api('PUT',`/services/${TARGET.serviceId}/env-vars/${CONTROL}`,{value:initial});
    await exactControl(api,initial);
    await api('POST',`/services/${TARGET.serviceId}/suspend`);
    // Two separately fetched complete proofs; a 202 acknowledgement is insufficient.
    await stopped(api,initial);await stopped(api,initial);
    const identity=await child('psql',['-X','--no-password','-A','-t','-c',"SELECT current_database() || '|' || current_user || '|' || current_setting('server_version_num')"],{env,timeout:30000});
    requireThat(/^myworkstation\|myworkstation\|18[0-9]{4}\s*$/.test(identity));
    validateReceipt(receipt,clock());await stopped(api,initial);
    await child('pg_restore',['--no-password','--clean','--if-exists','--exit-on-error','--single-transaction','--no-owner','--no-privileges','--dbname',TARGET.databaseName],{env,fd:snapshot.fd});
    // Keep OFF, rotate again so every archived grant is stale. Never resume.
    const final=controlValue(clock(),notBefore);
    await stopped(api,initial);
    await api('PUT',`/services/${TARGET.serviceId}/env-vars/${CONTROL}`,{value:final});
    await stopped(api,final);
    return Object.freeze({mode:'RESTORED_SUSPENDED_OFF',postgresId:TARGET.postgresId,serviceId:TARGET.serviceId,archiveSha256:receipt.archiveSha256});
  }finally{snapshot.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const args=process.argv.slice(2),allowed=new Set(['--archive','--receipt','--not-before','--execute','--dry-run','--acknowledge']);const values={};
    for(let i=0;i<args.length;i++){const key=args[i];requireThat(allowed.has(key)&&!Object.hasOwn(values,key));values[key]=['--execute','--dry-run'].includes(key)?true:args[++i];}
    requireThat(!(values['--execute']&&values['--dry-run']));
    const bytes=fs.readFileSync(values['--receipt']);requireThat(bytes.length<=16384);
    const receipt=JSON.parse(bytes.toString('utf8'));
    const result=await controlledRestore({archive:values['--archive'],receipt,notBefore:values['--not-before'],execute:values['--execute']===true,acknowledge:values['--acknowledge'],...(values['--execute']?{api:createRenderClient({token:process.env.RENDER_API_KEY})}:{})});
    console.log(JSON.stringify(result));
  }catch{console.error('CONTROLLED_RESTORE_REFUSED: service is never automatically resumed.');process.exitCode=1;}
}
