import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {reviewedFreshStoreManifest} from './store-lifecycle-manifest.js';

const ddl=readFileSync(new URL('../../prisma/assistant-history-archive.sql',import.meta.url),'utf8');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const empty='{"schemaVersion":1,"threads":[]}';
const refuse=()=>{throw Object.assign(new Error('History provisioning requires the reviewed schema and lifecycle plan.'),{code:'ASSISTANT_HISTORY_PROVISION_UNAVAILABLE'})};
const columns=async(tx,oid)=>tx.$queryRawUnsafe('SELECT attname AS name,format_type(atttypid,atttypmod) AS type,attnotnull AS "notNull" FROM pg_attribute WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped ORDER BY attnum',oid);
const constraints=async(tx,oid)=>tx.$queryRawUnsafe('SELECT contype::text AS type,convalidated AS validated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::oid ORDER BY contype,pg_get_constraintdef(oid)',oid);
const indexShape=async(tx,oid)=>tx.$queryRawUnsafe('SELECT indisunique,indisvalid,indisready,indnkeyatts::int,pg_get_expr(indpred,indrelid) AS predicate,ARRAY(SELECT a.attname::text FROM unnest(indkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=indrelid AND a.attnum=k.n ORDER BY k.p) AS columns FROM pg_index WHERE indexrelid=$1::oid',oid);

// Startup/operations only. Never imported or called by an HTTP request.
// Existing populated objects are verified, never altered or silently repaired.
export async function provisionAssistantHistory(db){
 const manifest=reviewedFreshStoreManifest(),node=manifest.tables.find(t=>t.name==='AssistantHistoryArchive');
 if(JSON.stringify(node)!==JSON.stringify({name:'AssistantHistoryArchive',owner:{kind:'DIRECT'},reset:'REMOVE'})||!manifest.knownTables.includes(node.name))refuse();
 const planHash=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='10s'");
  await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('assistant-history-provision-v1',0))");
  const meta=(await tx.$queryRawUnsafe(`SELECT current_schema() AS schema,to_regclass(format('%I.%I',current_schema(),'AssistantHistoryArchive'))::oid::int AS history,to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS fence`))[0];
  if(!meta?.schema)refuse();
  // Never upgrade an enrolled plan or install another owner's guards here.
  if(meta.fence){
   const fences=await tx.$queryRawUnsafe(`SELECT "planHash","maintenance" FROM ${quote(meta.schema)}."StoreLifecycleFence" FOR SHARE NOWAIT`);
   if(fences.some(f=>f.maintenance||f.planHash!==planHash)||(!meta.history&&fences.length))refuse();
  }
  const template='history_template_'+randomUUID().replaceAll('-','');
  const templateDdl=ddl.replace('CREATE TABLE IF NOT EXISTS "AssistantHistoryArchive"',`CREATE TEMP TABLE ${quote(template)}`).trim().replace(/;$/,' ON COMMIT DROP;');
  await tx.$executeRawUnsafe(templateDdl);
  const expectedOid=(await tx.$queryRawUnsafe('SELECT to_regclass($1)::oid::int AS oid',quote(template)))[0].oid;
  const expected=await columns(tx,expectedOid);
  if(JSON.stringify(expected.map(c=>[c.name,c.type,c.notNull]))!==JSON.stringify(manifest.knownColumns.AssistantHistoryArchive))refuse();
  if(!meta.history)await tx.$executeRawUnsafe(ddl);
  const oid=(await tx.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'AssistantHistoryArchive'))::oid::int AS oid`))[0].oid;
  const relation=(await tx.$queryRawUnsafe('SELECT relkind::text AS relkind,relrowsecurity,relispartition FROM pg_class WHERE oid=$1::oid',oid))[0];
  if(relation?.relkind!=='r'||relation.relrowsecurity||relation.relispartition)refuse();
  if(JSON.stringify(await columns(tx,oid))!==JSON.stringify(expected)||JSON.stringify(await constraints(tx,oid))!==JSON.stringify(await constraints(tx,expectedOid)))refuse();
  if((await tx.$queryRawUnsafe("SELECT 1 FROM pg_constraint WHERE contype='f' AND (conrelid=$1::oid OR confrelid=$1::oid) LIMIT 1",oid)).length)refuse();
  const table=quote(meta.schema)+'."AssistantHistoryArchive"';
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AssistantHistoryArchive_expiry_idx" ON ${table} ("expiresAt","scopeKey") WHERE "payload"<>'${empty}'::jsonb`);
  await tx.$executeRawUnsafe(`CREATE INDEX ON ${quote(template)} ("expiresAt","scopeKey") WHERE "payload"<>'${empty}'::jsonb`);
  const index=(await tx.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'AssistantHistoryArchive_expiry_idx'))::oid::int AS oid`))[0].oid;
  const expectedIndex=(await tx.$queryRawUnsafe('SELECT indexrelid::int AS oid FROM pg_index WHERE indrelid=$1::oid AND NOT indisprimary',expectedOid))[0].oid;
  if(JSON.stringify(await indexShape(tx,index))!==JSON.stringify(await indexShape(tx,expectedIndex)))refuse();
  return {available:true,created:!meta.history,planHash};
 },{timeout:20000,maxWait:5000});
}
