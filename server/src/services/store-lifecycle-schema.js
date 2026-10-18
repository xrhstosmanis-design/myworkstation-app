// Internal metadata inventory. Never an executable restore/deletion plan.
import {createHash} from 'node:crypto';
import {requireLifecycleAdmin} from './store-lifecycle-preview.js';
const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status})};
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
export function lifecycleSchemaFingerprint(metadata){return createHash('sha256').update(canonical(metadata)).digest('hex')}
export function reviewLifecycleSchema(metadata){
 const declared=new Set(metadata.constraints.filter(c=>c.kind==='f').flatMap(c=>(c.columns||[]).map(column=>JSON.stringify([c.schema,c.table,column]))));
 return {
  undeclaredIdColumns:metadata.columns.filter(c=>/Id$/.test(c.name)&&!declared.has(JSON.stringify([metadata.schema,c.table,c.name]))).map(c=>({table:c.table,column:c.name})),
  attachmentCandidates:metadata.columns.filter(c=>/^(storageKey|contentData|attachmentData|dataUrl|imageUrl|photoUrl|filePath|documentUrl|attachmentUrl)$/i.test(c.name)||c.type==='bytea').map(c=>({table:c.table,column:c.name,type:c.type})),
  complexTables:metadata.tables.filter(t=>t.kind!=='r'||t.partition||t.rowSecurity||t.forceRowSecurity).map(t=>({table:t.name,kind:t.kind,partition:t.partition,rowSecurity:t.rowSecurity,forceRowSecurity:t.forceRowSecurity})),
  userTriggers:metadata.triggers.map(t=>({table:t.table,name:t.name})),
  limitations:['Identifier and attachment column heuristics are review candidates, not a complete application-link or binary inventory.','Schema fingerprint contains no row freshness, sequence state or restore proof.','Definitions are metadata only and must never be executed as an automatic restore plan.'],
  restoreReady:false,executionAvailable:false
 };
}
export async function captureLifecycleSchema(db,actor,{companyId,storeId}){
 requireLifecycleAdmin(actor);
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8s'");
  const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS name'))[0]?.name;if(!schema)fail('Schema unavailable.',503);
  const found=await tx.$queryRawUnsafe(`SELECT "id" FROM ${quote(schema)}."Store" WHERE "id"=$1 AND "companyId"=$2`,storeId,companyId);if(!found.length)fail('Store not found in selected company.',404);
  const read=async(sql,limit)=>{const rows=await tx.$queryRawUnsafe(sql,schema);if(rows.length>limit)fail('Schema inventory exceeds the review limit.');return rows};
  const tables=await read(`SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS "rowSecurity",c.relforcerowsecurity AS "forceRowSecurity" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') ORDER BY c.relname LIMIT 601`,600);
  const columns=await read(`SELECT c.relname AS "table",a.attname AS name,a.attnum::int AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum LIMIT 20001`,20000);
  const constraints=await read(`SELECT ns.nspname AS schema,t.relname AS "table",c.conname AS name,c.contype::text AS kind,c.condeferrable AS "deferrable",c.condeferred AS "deferred",c.convalidated AS validated,pns.nspname AS "parentSchema",p.relname AS "parentTable",c.confdeltype::text AS "onDelete",c.confupdtype::text AS "onUpdate",ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.pos) AS "columns",ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.pos) AS "parentColumns",pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_namespace ns ON ns.oid=c.connamespace LEFT JOIN pg_class t ON t.oid=c.conrelid LEFT JOIN pg_class p ON p.oid=c.confrelid LEFT JOIN pg_namespace pns ON pns.oid=p.relnamespace WHERE ns.nspname=$1 OR pns.nspname=$1 ORDER BY ns.nspname,t.relname,c.conname LIMIT 10001`,10000);
  const indexes=await read(`SELECT tablename AS "table",indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname LIMIT 10001`,10000);
  const triggerRows=await read(`SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,pg_get_triggerdef(t.oid,true) AS definition,pg_get_functiondef(t.tgfoid) AS "functionDefinition" FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname LIMIT 10001`,10000);
  const triggers=triggerRows.map(({functionDefinition,...row})=>({...row,functionHash:createHash('sha256').update(functionDefinition).digest('hex')}));
  const types=await read(`SELECT t.typname AS name,t.typtype::text AS kind,CASE WHEN t.typtype='d' THEN format_type(t.typbasetype,t.typtypmod) ELSE NULL END AS "baseType",t.typnotnull AS "notNull",t.typdefault AS "defaultExpression",ARRAY(SELECT e.enumlabel::text FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 AND t.typtype IN ('e','d') ORDER BY t.typname LIMIT 2001`,2000);
  const sequences=await read(`SELECT c.relname AS name,format_type(s.seqtypid,NULL) AS type,s.seqstart::text AS "start",s.seqincrement::text AS increment,s.seqmax::text AS maximum,s.seqmin::text AS minimum,s.seqcache::text AS cache,s.seqcycle AS cycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname LIMIT 2001`,2000);
  const views=await read(`SELECT c.relname AS name,c.relkind::text AS kind,pg_get_viewdef(c.oid,true) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('v','m') ORDER BY c.relname LIMIT 1001`,1000);
  const metadata={format:'MWS_STORE_SCHEMA_REVIEW_V1',schema,tables,columns,constraints,indexes,triggers,types,sequences,views};
  return {scope:{companyId,storeId},metadata,schemaFingerprint:lifecycleSchemaFingerprint(metadata),review:reviewLifecycleSchema(metadata)};
 },{isolationLevel:'RepeatableRead',timeout:20000,maxWait:3000});
}
