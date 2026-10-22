#!/usr/bin/env node
// Explicit fixed-service schema operator. Never imports application bootstrap.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const SERVICE='srv-d9isenfavr4c73bdh52g',HOST='dpg-d9isee7avr4c73bdglog-a',SCHEMA_SHA='9b58b81fe64a7972ddadef73f62f4b81fc2417619fab0943fd3da42dc2612c6f';
const names=['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload','AutomaticReportDeliverySlot'];
const fail=()=>{throw Error('REPORT_PROVISION_REFUSED')};
const need=value=>{if(!value)fail()};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function provisionRequest(argv,env){
 const options={};for(let i=0;i<argv.length;i++){const key=argv[i];need(['--execute','--dry-run','--expected-revision'].includes(key)&&!Object.hasOwn(options,key));options[key]=key==='--expected-revision'?argv[++i]:true;}
 need(!(options['--execute']&&options['--dry-run'])&&/^[a-f0-9]{40}$/.test(options['--expected-revision']||'')&&env.RENDER_GIT_COMMIT===options['--expected-revision']&&env.RENDER_SERVICE_ID===SERVICE&&env.NODE_ENV==='production');
 // An absent control is OFF; malformed/potentially enabled control is refused.
 if(env.AUTOMATIC_REPORT_ACTIVATION_CONTROL){let control;try{control=JSON.parse(env.AUTOMATIC_REPORT_ACTIVATION_CONTROL)}catch{fail()}need(control?.enabled===false);}
 let url;try{url=new URL(env.DATABASE_URL)}catch{fail()}
 need(['postgres:','postgresql:'].includes(url.protocol)&&[HOST,HOST+'.oregon-postgres.render.com'].includes(url.hostname)&&(!url.port||url.port==='5432')&&decodeURIComponent(url.username)==='myworkstation'&&decodeURIComponent(url.pathname)==='/myworkstation'&&!url.hash&&url.password);
 const seen=new Set();for(const [key,value]of url.searchParams){need(!seen.has(key));seen.add(key);if(key==='schema')need(value==='public');else if(key==='sslmode')need(['require','verify-full'].includes(value));else if(['connection_limit','pool_timeout','statement_cache_size'].includes(key))need(/^\d{1,6}$/.test(value));else fail();}
 return Object.freeze({execute:options['--execute']===true,revision:options['--expected-revision']});
}
function checks(ddl){return (ddl.match(/\bCHECK\s*\(/g)||[]).length;}
async function main(argv,env){
 const request=provisionRequest(argv,env),source=new URL('../../server/src/services/automatic-report-dispatch-schema.js',import.meta.url),manifest=new URL('./lifecycle/automatic-report-manifest.proposed.json',import.meta.url);
 need(digest(await readFile(source))===SCHEMA_SHA);
 const installed=await import(source.href);need(digest(await readFile(source))===SCHEMA_SHA&&installed.automaticReportDispatchDDL.length===6);
 const expected=JSON.parse(await readFile(manifest,'utf8'));
 const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
 try{
  const result=await db.$transaction(async tx=>{
   if(!request.execute)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   await tx.$executeRawUnsafe('SET LOCAL search_path TO public');
   await tx.$executeRawUnsafe("SET LOCAL lock_timeout='1s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
   const identity=await tx.$queryRawUnsafe("SELECT current_database() AS \"database\",current_user AS username,current_schema() AS schema,current_setting('server_version_num') AS version");
   need(identity.length===1&&identity[0].database==='myworkstation'&&identity[0].username==='myworkstation'&&identity[0].schema==='public'&&/^18\d{4}$/.test(identity[0].version));
   const noEventHooks=async()=>need((await tx.$queryRawUnsafe("SELECT count(*)::text AS count FROM pg_event_trigger WHERE evtenabled<>'D'"))[0]?.count==='0');
   await noEventHooks();
   if(request.execute){const lock=await tx.$queryRawUnsafe("SELECT pg_try_advisory_xact_lock(hashtextextended('MWS_AUTOMATIC_REPORT_PROVISION_V1',0))::text AS acquired");need(lock[0]?.acquired==='true');}
   // pg_class includes tables, views, materialized views, sequences and indexes.
   const collisions=await tx.$queryRawUnsafe('SELECT c.relname AS name,c.relkind::text AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[])','public',names);
   need(Array.isArray(collisions)&&collisions.length===0);
   if(!request.execute)return {ok:true,mode:'DRY_RUN',revision:request.revision,schemaModuleSha256:SCHEMA_SHA,tablesAbsent:6,ddlExecuted:0};
   let statements=0;
   const facade={$executeRawUnsafe:async ddl=>{need(ddl===installed.automaticReportDispatchDDL[statements]&&statements<6);statements++;return tx.$executeRawUnsafe(ddl)}};
   await installed.provisionAutomaticReportDispatchSchema({$transaction:async callback=>callback(facade)});need(statements===6);
   const relations=await tx.$queryRawUnsafe("SELECT c.relname AS name,c.relkind::text AS kind,c.xmin=pg_current_xact_id()::xid AS own,c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,EXISTS(SELECT 1 FROM pg_inherits h WHERE h.inhrelid=c.oid OR h.inhparent=c.oid) AS inherited FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[])",'public',names);
   need(relations.length===6&&new Set(relations.map(r=>r.name)).size===6&&relations.every(r=>names.includes(r.name)&&r.kind==='r'&&r.own===true&&r.partition===false&&r.rls===false&&r.forced===false&&r.inherited===false));
   const columns=await tx.$queryRawUnsafe("SELECT c.relname AS \"table\",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS \"defaultExpression\" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",'public',names);
   const constraints=await tx.$queryRawUnsafe("SELECT t.relname AS \"table\",c.contype::text AS kind,c.convalidated AS validated,c.condeferrable AS deferred,pg_get_constraintdef(c.oid,true) AS definition,ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.pos) AS columns FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname=ANY($2::text[]) AND c.contype IN ('c','p','u','f')",'public',names);
   const indexes=await tx.$queryRawUnsafe("SELECT t.relname AS \"table\",i.indisunique AS \"unique\",i.indisvalid AS valid,i.indisready AS ready,i.indpred IS NULL AND i.indexprs IS NULL AS plain,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname=ANY($2::text[])",'public',names);
   need((await tx.$queryRawUnsafe("SELECT count(*)::text AS count FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname=ANY($2::text[]) AND NOT g.tgisinternal",'public',names))[0]?.count==='0');
   const uniqueCounts=[0,0,2,0,1,0],pk=[['companyId','storeId','reportType'],['companyId','storeId','reportType'],['recipientId'],['companyId','storeId','recipientId'],['payloadId'],['slotId']];
   for(let i=0;i<names.length;i++){
    const name=names[i],cs=constraints.filter(c=>c.table===name),ix=indexes.filter(r=>r.table===name);
    need(JSON.stringify(columns.filter(c=>c.table===name).map(c=>[c.name,c.type,c.required]))===JSON.stringify(expected.knownColumns[name]));
    need(cs.length===checks(installed.automaticReportDispatchDDL[i])+1+uniqueCounts[i]+(i===3?1:0)&&cs.every(c=>c.validated===true&&c.deferred===false&&typeof c.definition==='string'&&c.definition.length>0&&['c','p','u','f'].includes(c.kind)));
    need(cs.filter(c=>c.kind==='c').length===checks(installed.automaticReportDispatchDDL[i])&&cs.filter(c=>c.kind==='u').length===uniqueCounts[i]);
    const primary=cs.filter(c=>c.kind==='p');need(primary.length===1&&JSON.stringify(primary[0].columns)===JSON.stringify(pk[i]));
    const foreign=cs.filter(c=>c.kind==='f');need(foreign.length===(i===3?1:0));if(i===3)need(JSON.stringify(foreign[0].columns)===JSON.stringify(['companyId','storeId','recipientId'])&&foreign[0].definition.includes('REFERENCES "AutomaticReportRecipient"'));
    need(ix.length===1+uniqueCounts[i]&&ix.every(r=>r.unique===true&&r.valid===true&&r.ready===true&&r.plain===true));
    need((await tx.$queryRawUnsafe('SELECT count(*)::text AS count FROM "public"."'+name+'"'))[0]?.count==='0');
   }
   await noEventHooks();
   const ordered=rows=>[...rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   const catalogSha256=digest(JSON.stringify({columns:ordered(columns),constraints:ordered(constraints),indexes:ordered(indexes)}));
   return {ok:true,mode:'PROVISIONED_EMPTY_OFF',catalogSha256,revision:request.revision,schemaModuleSha256:SCHEMA_SHA,tablesCreated:6,columnsVerified:true,constraintsVerified:true,indexesVerified:true,rows:0};
  },{maxWait:1000,timeout:15000,isolationLevel:'ReadCommitted'});
  process.stdout.write(JSON.stringify(result)+'\n');
 }finally{await db.$disconnect();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){main(process.argv.slice(2),process.env).catch(()=>{process.stderr.write('REPORT_PROVISION_REFUSED\n');process.exitCode=1;});}
