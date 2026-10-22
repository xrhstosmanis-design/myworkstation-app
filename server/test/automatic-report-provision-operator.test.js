import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {provisionRequest} from '../../ops/backup/provision-automatic-reports.mjs';
import {automaticReportDispatchDDL} from '../src/services/automatic-report-dispatch-schema.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),operator=path.join(root,'ops/backup/provision-automatic-reports.mjs'),revision='a'.repeat(40);
const names=['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload','AutomaticReportDeliverySlot'];
const env={NODE_ENV:'production',RENDER_SERVICE_ID:'srv-d9isenfavr4c73bdh52g',RENDER_GIT_COMMIT:revision,DATABASE_URL:'postgresql://myworkstation:synthetic-secret@dpg-d9isee7avr4c73bdglog-a/myworkstation?schema=public'};
const primary=[['companyId','storeId','reportType'],['companyId','storeId','reportType'],['recipientId'],['companyId','storeId','recipientId'],['payloadId'],['slotId']],unique=[0,0,2,0,1,0];
const proposed=JSON.parse(readFileSync(path.join(root,'ops/backup/lifecycle/automatic-report-manifest.proposed.json'),'utf8'));
function cli(args=[],variant='ok',changes={}){
 const directory=mkdtempSync(path.join(tmpdir(),'report-operator-')),events=path.join(directory,'events.jsonl');
 try{
  const client=path.join(directory,'client.mjs'),loader=path.join(directory,'loader.mjs');
  writeFileSync(client,`import fs from 'node:fs';const names=${JSON.stringify(names)},primary=${JSON.stringify(primary)},unique=${JSON.stringify(unique)},columns=${JSON.stringify(proposed.knownColumns)},ddls=${JSON.stringify(automaticReportDispatchDDL)},variant=${JSON.stringify(variant)};let created=false;function log(event){fs.appendFileSync(${JSON.stringify(events)},JSON.stringify(event)+'\\n')};export class PrismaClient{async $disconnect(){log({kind:'disconnect'})}async $transaction(fn,options){log({kind:'begin',options});try{const result=await fn(this);log({kind:'commit'});return result}catch(e){log({kind:'rollback'});throw e}}async $executeRawUnsafe(sql){log({kind:'execute',sql});if(sql.startsWith('CREATE TABLE')){created=true;if(variant==='ddl-fail')throw Error('synthetic-secret')}return 0}async $queryRawUnsafe(sql,...args){log({kind:'query',sql,args});if(sql.includes('pg_event_trigger'))return[{count:variant==='event'?'1':'0'}];if(sql.includes('FROM pg_trigger'))return[{count:variant==='trigger'?'1':'0'}];if(sql.includes('current_database()'))return[{database:variant==='identity'?'foreign':'myworkstation',username:'myworkstation',schema:'public',version:'180003'}];if(sql.includes('pg_try_advisory'))return[{acquired:variant==='busy'?'false':'true'}];if(sql.includes('pg_event_trigger'))assert.equal(rows[0].count,'0');
    if(sql.includes('c.xmin'))return names.map(name=>({name,kind:'r',own:variant!=='foreign-xmin',partition:false,rls:false,forced:variant==='forced',inherited:variant==='inheritance'}));if(sql.includes('pg_class c JOIN pg_namespace'))return variant==='collision'?[{name:names[0],kind:'v'}]:[];if(sql.includes('pg_attribute a JOIN pg_class'))return names.flatMap(table=>columns[table].map(([name,type,required])=>({table,name,type,required}))).slice(variant==='columns'?1:0);if(sql.includes('FROM pg_constraint'))return names.flatMap((table,i)=>[{table,kind:'p',columns:primary[i]},...Array.from({length:unique[i]},()=>({table,kind:'u',columns:[]})),...(i===3?[{table,kind:'f',columns:['companyId','storeId','recipientId']}]:[]),...Array.from({length:(ddls[i].match(/\\bCHECK\\s*\\(/g)||[]).length},()=>({table,kind:'c',columns:[]}))].map(v=>({...v,validated:true,deferred:false,definition:v.kind==='f'?'FOREIGN KEY REFERENCES "AutomaticReportRecipient"':'reviewed fixture definition'})));if(sql.includes('FROM pg_index'))return names.flatMap((table,i)=>Array.from({length:1+unique[i]},()=>({table,unique:true,valid:variant!=='index',ready:true,plain:true})));if(sql.startsWith('SELECT count'))return[{count:variant==='rows'?'1':'0'}];throw Error('Unexpected isolated SQL') }};`);
  const fakefs=path.join(directory,'fs.mjs');writeFileSync(fakefs,`import {readFile as actual} from 'node:fs/promises';export async function readFile(file,...args){if(String(file).endsWith('automatic-report-dispatch-schema.js'))return Buffer.from('tampered source');return actual(file,...args)}`);
  writeFileSync(loader,`export async function resolve(specifier,context,next){if(specifier==='@prisma/client')return {url:${JSON.stringify(pathToFileURL(client).href)},shortCircuit:true};if(${JSON.stringify(variant)}==='source'&&specifier==='node:fs/promises'&&context.parentURL===${JSON.stringify(pathToFileURL(operator).href)})return {url:${JSON.stringify(pathToFileURL(fakefs).href)},shortCircuit:true};return next(specifier,context)};`);
  const result=spawnSync(process.execPath,['--no-warnings','--experimental-loader',loader,operator,...args],{cwd:root,env:{PATH:process.env.PATH,...env,...changes},encoding:'utf8',timeout:10000});
  let logs=[];try{logs=readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)}catch{}
  return {...result,logs};
 }finally{rmSync(directory,{recursive:true,force:true});}
}

test('operator requires exact revision, fixed identities and OFF before any connection',()=>{
 assert.equal(provisionRequest(['--expected-revision',revision],env).execute,false);
 for(const changes of [{RENDER_GIT_COMMIT:'b'.repeat(40)},{RENDER_SERVICE_ID:'other'},{NODE_ENV:'test'},{DATABASE_URL:env.DATABASE_URL+'&host=remote'},{DATABASE_URL:env.DATABASE_URL.replace('myworkstation?','foreign?')},{AUTOMATIC_REPORT_ACTIVATION_CONTROL:'{"enabled":true}'},{AUTOMATIC_REPORT_ACTIVATION_CONTROL:'broken'}]){const r=cli(['--expected-revision',revision],'ok',changes);assert.equal(r.status,1);assert.equal(r.stderr,'REPORT_PROVISION_REFUSED\n');assert.equal(r.logs.length,0);assert.doesNotMatch(r.stderr,/synthetic-secret/);}
 const sourceFailure=cli(['--expected-revision',revision],'source');assert.equal(sourceFailure.status,1);assert.equal(sourceFailure.logs.length,0);assert.equal(sourceFailure.stderr,'REPORT_PROVISION_REFUSED\n');
 for(const args of [[],['--expected-revision',revision,'--unknown'],['--expected-revision',revision,'--execute','--dry-run']])assert.equal(cli(args).status,1);
});
test('actual default CLI is read-only, verifies installed source, and never executes DDL or advisory lock',()=>{
 const r=cli(['--expected-revision',revision]);assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{ok:true,mode:'DRY_RUN',revision,schemaModuleSha256:'9b58b81fe64a7972ddadef73f62f4b81fc2417619fab0943fd3da42dc2612c6f',tablesAbsent:6,ddlExecuted:0});
 assert.ok(r.logs.some(e=>e.sql==='SET TRANSACTION READ ONLY'));assert.ok(r.logs.some(e=>e.sql==='SET LOCAL search_path TO public'));assert.equal(cli(['--expected-revision',revision],'event').status,1);assert.equal(r.logs.some(e=>e.sql?.includes('CREATE TABLE')||e.sql?.includes('pg_try_advisory')),false);assert.equal(r.logs.at(-1).kind,'disconnect');
});
test('actual CLI executes six reviewed DDL statements in one transaction and validates before commit',()=>{
 const r=cli(['--expected-revision',revision,'--execute']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).mode,'PROVISIONED_EMPTY_OFF');assert.equal(r.logs.filter(e=>e.kind==='begin').length,1);assert.deepEqual(r.logs.filter(e=>e.sql?.startsWith('CREATE TABLE')).map(e=>e.sql),automaticReportDispatchDDL);assert.equal(r.logs.at(-2).kind,'commit');assert.deepEqual(r.logs[0].options,{maxWait:1000,timeout:15000,isolationLevel:'ReadCommitted'});
 assert.equal(r.logs.filter(e=>e.sql?.startsWith('SELECT count')&&e.sql.includes('FROM "public".')).length,6);assert.ok(r.logs.some(e=>e.sql?.includes('pg_current_xact_id()')));
});
test('catalog collisions of any relation kind and postvalidation uncertainty roll back without retries',()=>{
 for(const variant of ['identity','collision','busy','event','trigger','forced','inheritance','ddl-fail','foreign-xmin','columns','index','rows']){const r=cli(['--expected-revision',revision,'--execute'],variant);assert.equal(r.status,1,variant);assert.equal(r.stderr,'REPORT_PROVISION_REFUSED\n');assert.equal(r.logs.filter(e=>e.kind==='begin').length,1);assert.ok(r.logs.some(e=>e.kind==='rollback'));assert.equal(r.logs.some(e=>e.kind==='commit'),false);if(['identity','collision','busy','event'].includes(variant))assert.equal(r.logs.some(e=>e.sql?.startsWith('CREATE TABLE')),false);}
});

function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(u.pathname)&&!u.search&&!u.hash}catch{return false}}
test('native operator query fixture is mandatory in CI',()=>{if(process.env.CI)assert.ok(isolated(),'native operator SQL must run in isolated CI')});
test('native exact operator SQL parses and inspects its own six-table creation transaction',{skip:!isolated(),timeout:60000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient(),schema='operator_'+randomBytes(10).toString('hex');let created=false;
 try{
  await db.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');created=true;
  const captured=cli(['--expected-revision',revision,'--execute']);assert.equal(captured.status,0);
  await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET LOCAL search_path TO "'+schema+'"');
   let ddlIndex=0;
   for(const event of captured.logs){
    if(event.sql==='SET LOCAL search_path TO public'){
     assert.equal(ddlIndex,0);await tx.$executeRawUnsafe(event.sql);
     const [search]=await tx.$queryRawUnsafe('SELECT current_schema() AS name,current_schemas(true)::text[] AS schemas');
     assert.equal(search.name,'public');assert.deepEqual(search.schemas.slice(0,2),['pg_catalog','public']);
     await tx.$executeRawUnsafe('SET LOCAL search_path TO "'+schema+'"');continue;
    }
    if(event.kind==='execute'&&event.sql.startsWith('CREATE TABLE')){await tx.$executeRawUnsafe(event.sql);ddlIndex++;continue}
    if(event.kind!=='query')continue;
    const sql=event.sql.replaceAll('"public".', '"'+schema+'".'),args=event.args.map(v=>v==='public'?schema:v);
    const rows=await tx.$queryRawUnsafe(sql,...args);
    if(sql.includes('pg_event_trigger'))assert.equal(rows[0].count,'0');
    if(sql.includes('c.xmin'))assert.equal(rows.every(row=>row.own===true),true);
    if(sql.includes('pg_attribute a JOIN pg_class'))for(const name of names)assert.deepEqual(rows.filter(r=>r.table===name).map(r=>[r.name,r.type,r.required]),proposed.knownColumns[name]);
    if(sql.includes('FROM pg_constraint'))for(let i=0;i<names.length;i++){
     const cs=rows.filter(r=>r.table===names[i]);assert.equal(cs.length,(automaticReportDispatchDDL[i].match(/\bCHECK\s*\(/g)||[]).length+1+unique[i]+(i===3?1:0));assert.ok(cs.every(c=>c.validated===true&&c.deferred===false));assert.deepEqual(cs.find(c=>c.kind==='p').columns,primary[i]);
     if(i===3)assert.ok(cs.find(c=>c.kind==='f').definition.includes('REFERENCES "AutomaticReportRecipient"'));
    }
    if(sql.includes('FROM pg_index'))for(let i=0;i<names.length;i++){const ix=rows.filter(r=>r.table===names[i]);assert.equal(ix.length,1+unique[i]);assert.ok(ix.every(r=>r.unique&&r.valid&&r.ready&&r.plain));}
    if(sql.startsWith('SELECT count'))assert.equal(rows[0].count,'0');
   }
   assert.equal(ddlIndex,6);
  },{timeout:30000});
 }finally{try{if(created)await db.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE')}finally{await db.$disconnect()}}
});
