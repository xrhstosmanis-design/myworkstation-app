// Explicit, unmounted future-storage provisioner. Importing creates no schema,
// enrollment or startup route. The canonical production manifest is unchanged.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getReviewedMonthlySnapshotLifecycleGuardDefinitions} from './store-lifecycle-executor.js';
import {reviewedFreshStoreManifest} from './store-lifecycle-manifest.js';
const name='MonthlyInventorySnapshot',q=s=>'"'+s.replaceAll('"','""')+'"';
const columns=[['id','text',true],['companyId','text',true],['storeId','text',true],['lifecycleGeneration','bigint',true],['issueMonth','text',true],...['scheduledFor','transactionStartedAt','sourceReadStartedAt','sourceReadFinishedAt','sourceObservedAt','storedAt'].map(c=>[c,'timestamp with time zone',true]),['observationStatus','text',true],['delayMs','bigint',true],['sourceRevision','text',true],['formatVersion','integer',true],...['valuationBasis','sourceHash','payloadHash','candidateJsonText','storedBytesSha256'].map(c=>[c,'text',true]),['sourceCoverage','jsonb',true],['capturePrincipal','jsonb',true]];
const body="BEGIN RAISE EXCEPTION 'MONTHLY_SNAPSHOT_IMMUTABLE' USING ERRCODE='55000'; END;";
const guards=[['monthly_inventory_snapshot_immutable',27],['monthly_inventory_snapshot_truncate',34]];
const checks={
 mws_snapshot_id:'octet_length("id")>=1 AND octet_length("id")<=160',
 mws_snapshot_company:'octet_length("companyId")>=1 AND octet_length("companyId")<=160',
 mws_snapshot_store:'octet_length("storeId")>=1 AND octet_length("storeId")<=160',
 mws_snapshot_generation:'"lifecycleGeneration">=0',
 mws_snapshot_month:`"issueMonth" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`,
 mws_snapshot_read_order:'"scheduledFor"<="transactionStartedAt" AND "transactionStartedAt"<="sourceReadStartedAt" AND "sourceReadStartedAt"<="sourceReadFinishedAt" AND "sourceReadFinishedAt"="sourceObservedAt" AND "sourceReadFinishedAt"<="storedAt"',
 mws_snapshot_time_precision:['scheduledFor','transactionStartedAt','sourceReadStartedAt','sourceReadFinishedAt','sourceObservedAt'].map(c=>`date_trunc('milliseconds',"${c}")="${c}" AND isfinite("${c}")`).join(' AND ')+ ' AND isfinite("storedAt")',
 mws_snapshot_read_age:'"sourceReadFinishedAt"-"transactionStartedAt"<=interval \'30 seconds\'',
 mws_snapshot_observation:`("observationStatus"='ON_TIME' OR "observationStatus"='LATE') AND "delayMs">=0`,
 mws_snapshot_revision:`"sourceRevision" ~ '^[a-f0-9]{40}$'`,
 mws_snapshot_version:'"formatVersion"=1',
 mws_snapshot_basis:`"valuationBasis"='CURRENT_OPERATIONAL_V1'`,
 mws_snapshot_hashes:`"sourceHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$' AND "storedBytesSha256" ~ '^[a-f0-9]{64}$'`,
 mws_snapshot_payload:'octet_length("candidateJsonText")>=2 AND octet_length("candidateJsonText")<=4194304 AND jsonb_typeof("candidateJsonText"::jsonb)=\'object\'',
 mws_snapshot_metadata:'jsonb_typeof("sourceCoverage")=\'object\' AND octet_length("sourceCoverage"::text)<=2048 AND jsonb_typeof("capturePrincipal")=\'object\' AND octet_length("capturePrincipal"::text)<=2048'
};
const fail=(code='MONTHLY_SNAPSHOT_SCHEMA_CHANGED')=>{throw Object.assign(new Error('Monthly snapshot storage is unavailable or differs from its reviewed schema.'),{status:409,code})};
export const monthlySnapshotRecoveryColumns=()=>({[name]:structuredClone(columns)});
export function monthlyInventorySnapshotLifecycleManifestProposal(){return JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/monthly-inventory-snapshot-manifest.proposed.json',import.meta.url),'utf8'))}
export function assertMonthlySnapshotLifecycleCatalogue(manifest=monthlyInventorySnapshotLifecycleManifestProposal()){
 const node=manifest?.tables?.find(t=>t.name===name);
 const canonical=reviewedFreshStoreManifest(),without=structuredClone(manifest);
 if(manifest?.tables?.filter(t=>t.name===name).length!==1||!node||node.owner?.kind!=='DIRECT'||node.reset!=='KEEP'||JSON.stringify(manifest.knownColumns?.[name])!==JSON.stringify(columns))fail('MONTHLY_SNAPSHOT_RECOVERY_REVIEW_REQUIRED');
 const expected=guards.map(([trigger,mask])=>({name:trigger,enabled:'A',mask,condition:null,attributes:'',functionSchema:'public',functionName:'monthly_inventory_snapshot_immutable_guard',definer:false,language:'plpgsql',bodySha256:createHash('sha256').update(body).digest('hex')}));
 if(JSON.stringify(node)!==JSON.stringify({name,owner:{kind:'DIRECT'},reset:'KEEP',existingTriggers:expected}))fail('MONTHLY_SNAPSHOT_RECOVERY_REVIEW_REQUIRED');
 without.id=canonical.id;without.knownTables=without.knownTables.filter(t=>t!==name);delete without.knownColumns[name];without.reviewedColumns=without.reviewedColumns.filter(c=>!c.startsWith(name+'.'));without.tables=without.tables.filter(t=>t.name!==name);
 if(JSON.stringify(without)!==JSON.stringify(canonical)||manifest.knownTables.filter(t=>t===name).length!==1||JSON.stringify(manifest.reviewedColumns.filter(c=>c.startsWith(name+'.')).sort())!==JSON.stringify(columns.map(([c])=>name+'.'+c).sort()))fail('MONTHLY_SNAPSHOT_RECOVERY_REVIEW_REQUIRED');
}
export async function createMonthlyInventorySnapshotSchema(tx){
 const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(!schema)fail();
 const table=q(schema)+'.'+q(name);
 await tx.$executeRawUnsafe(`CREATE TABLE ${table} (${columns.map(([c,type])=>q(c)+' '+type+' NOT NULL'+(c==='storedAt'?' DEFAULT clock_timestamp()':'')).join(',')},CONSTRAINT mws_snapshot_company_parent FOREIGN KEY ("companyId") REFERENCES ${q(schema)}."Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT NOT DEFERRABLE,CONSTRAINT mws_snapshot_store_parent FOREIGN KEY ("storeId") REFERENCES ${q(schema)}."Store"("id") ON DELETE RESTRICT ON UPDATE RESTRICT NOT DEFERRABLE,CONSTRAINT mws_snapshot_primary PRIMARY KEY ("id"),CONSTRAINT mws_snapshot_slot UNIQUE ("companyId","storeId","lifecycleGeneration","issueMonth"),${Object.entries(checks).map(([key,value])=>'CONSTRAINT '+q(key)+' CHECK ('+value+')').join(',')})`);
 await tx.$executeRawUnsafe(`CREATE INDEX mws_snapshot_scope_time ON ${table} ("companyId","storeId","storedAt")`);
 await tx.$executeRawUnsafe(`CREATE FUNCTION ${q(schema)}.monthly_inventory_snapshot_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$${body}$$`);
 await tx.$executeRawUnsafe(`CREATE TRIGGER monthly_inventory_snapshot_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${q(schema)}.monthly_inventory_snapshot_immutable_guard()`);
 await tx.$executeRawUnsafe(`CREATE TRIGGER monthly_inventory_snapshot_truncate BEFORE TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION ${q(schema)}.monthly_inventory_snapshot_immutable_guard()`);
 for(const [trigger] of guards)await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE ALWAYS TRIGGER ${q(trigger)}`);
}
const normalize=value=>String(value).replace(/::(?:text|bigint|integer|interval)/g,'').replace(/[\s()"]/g,'').replace(/00:00:30/g,'30seconds').replace(/interval'/g,"'");
export async function validateMonthlyInventorySnapshotSchema(tx){
 const meta=(await tx.$queryRawUnsafe(`SELECT current_schema() AS schema,c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid) AS inherited,EXISTS(SELECT 1 FROM pg_rewrite w WHERE w.ev_class=c.oid AND w.rulename<>'_RETURN') AS rewritten FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=$1`,name))[0];
 if(!meta)fail('MONTHLY_SNAPSHOT_SCHEMA_UNAVAILABLE');if(meta.kind!=='r'||meta.partition||meta.rls||meta.forced||meta.inherited||meta.rewritten)fail();
 const actual=await tx.$queryRawUnsafe(`SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS "defaultExpression" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=current_schema() AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,name);
 if(JSON.stringify(actual.map(c=>[c.name,c.type,c.required]))!==JSON.stringify(columns)||actual.some(c=>c.identity||c.generated||c.defaultExpression!==(c.name==='storedAt'?'clock_timestamp()':null)))fail();
 const constraints=await tx.$queryRawUnsafe(`SELECT c.conname AS name,c.contype::text AS kind,c.convalidated AS valid,c.condeferrable AS deferrable,pg_get_expr(c.conbin,c.conrelid) AS expression,ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.p) AS columns FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname=$1 AND c.contype IN ('p','u','f','c')`,name);
 if(constraints.length!==Object.keys(checks).length+4||constraints.some(c=>!c.valid||c.deferrable)||!constraints.some(c=>c.kind==='p'&&JSON.stringify(c.columns)==='["id"]')||!constraints.some(c=>c.kind==='u'&&JSON.stringify(c.columns)==='["companyId","storeId","lifecycleGeneration","issueMonth"]'))fail();
 for(const [key,expression] of Object.entries(checks))if(!constraints.some(c=>c.kind==='c'&&c.name===key&&normalize(c.expression)===normalize(expression)))fail();
 const fks=await tx.$queryRawUnsafe(`SELECT c.confdeltype::text AS deletion,c.confupdtype::text AS "update",c.condeferrable AS deferrable,p.relname AS parent,pn.nspname AS schema,ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.p) AS local,ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,p) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.p) AS remote FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class p ON p.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace WHERE n.nspname=current_schema() AND t.relname=$1 AND c.contype='f'`,name);
 if(fks.length!==2||!['Company','Store'].every(parent=>fks.some(f=>f.parent===parent&&f.schema===meta.schema&&f.deletion==='r'&&f.update==='r'&&!f.deferrable&&JSON.stringify(f.local)===JSON.stringify([parent==='Company'?'companyId':'storeId'])&&JSON.stringify(f.remote)==='["id"]')))fail();
 const indexes=await tx.$queryRawUnsafe(`SELECT i.indisunique AS "unique",i.indisvalid AS valid,i.indisready AS ready,i.indimmediate AS immediate,pg_get_expr(i.indpred,i.indrelid) AS predicate,pg_get_expr(i.indexprs,i.indrelid) AS expression,ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,p) LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.p) AS columns FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname=$1`,name);
 if(indexes.length!==3||indexes.some(i=>!i.valid||!i.ready||!i.immediate||i.predicate||i.expression)||!indexes.some(i=>!i.unique&&JSON.stringify(i.columns)==='["companyId","storeId","storedAt"]'))fail();
 const triggers=await tx.$queryRawUnsafe(`SELECT t.tgname AS name,t.tgenabled::text AS enabled,t.tgtype::int AS mask,t.tgqual::text AS condition,t.tgattr::text AS attributes,p.prosrc AS body,p.prosecdef AS definer,pn.nspname AS schema,p.proname AS "function",l.lanname AS language FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=current_schema() AND c.relname=$1 AND NOT t.tgisinternal`,name);
 for(const [trigger,mask] of guards){const row=triggers.find(t=>t.name===trigger);if(!row||row.enabled!=='A'||row.mask!==mask||row.condition!==null||row.attributes!==''||row.body!==body||row.definer||row.schema!==meta.schema||row.function!=='monthly_inventory_snapshot_immutable_guard'||row.language!=='plpgsql')fail();}
 const lifecycleGuards=getReviewedMonthlySnapshotLifecycleGuardDefinitions(monthlyInventorySnapshotLifecycleManifestProposal(),meta.schema);
 const other=triggers.filter(t=>!guards.some(([n])=>n===t.name));
 if(other.length&&(other.length!==2||!other.every(t=>lifecycleGuards.some(g=>t.name===g.name&&t.mask===g.mask&&t.body===g.body)&&t.enabled==='A'&&!t.definer&&t.schema===meta.schema&&t.function===t.name&&t.language==='plpgsql'&&t.condition===null&&t.attributes==='')))fail();
 return {available:true};
}
export async function provisionMonthlyInventorySnapshotSchema(db,{manifest=monthlyInventorySnapshotLifecycleManifestProposal()}={}){
 assertMonthlySnapshotLifecycleCatalogue(manifest);
 return db.$transaction(async tx=>{
  await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('mws:monthly-snapshot-schema-v1',0))");
  const fence=(await tx.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS name`))[0];
  if(fence?.name&&(await tx.$queryRawUnsafe('SELECT 1 FROM "StoreLifecycleFence" WHERE "maintenance" LIMIT 1')).length)fail('MONTHLY_SNAPSHOT_RECOVERY_MAINTENANCE');
  const exists=(await tx.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'MonthlyInventorySnapshot'))::text AS name`))[0]?.name;
  if(!exists)await createMonthlyInventorySnapshotSchema(tx);
  await validateMonthlyInventorySnapshotSchema(tx);
  return {available:true,productionActivated:false,captureEnabled:false};
 },{maxWait:5000,timeout:30000});
}
